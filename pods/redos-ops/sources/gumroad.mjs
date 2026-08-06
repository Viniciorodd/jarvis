// gumroad.mjs — the revenue truth. READ-ONLY by construction.
//
// PRD §4: *"Enforce limits with scoped, read-only credentials, never by telling the agent don't. This
// module is a dashboard. It has no write path to anything."*
//
// ⚠️ GUMROAD DOES NOT OFFER A READ-ONLY TOKEN. There is no scope picker on its application form — the
// token it hands you can also refund a sale and delete a product. So the guarantee the PRD asks for
// cannot come from the credential and has to be structural instead:
//
//   · `get()` is the only request function in this file and it hard-codes method GET
//   · no other verb appears anywhere in this module
//   · there is no exported function that takes a sale id and does anything to it
//
// That is a weaker guarantee than a scoped key and it is worth being honest about rather than
// describing this as "read-only credentials" when it is not.
//
// 🔒 BUYER EMAILS NEVER TOUCH DISK. PRD §8: *"Buyer emails stay in Gumroad. The dashboard shows
// counts. It does not build a local copy of a customer list it does not need."* Sales come back with
// full email addresses; this module drops them at the boundary and keys everything on Gumroad's own
// sale id. What gets stored is a count and a classification, never a customer list.
//
// `fetch()` NEVER THROWS. One dead API must not take down the page — it returns { ok:false, error }
// and the tile goes amber.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const API = 'https://api.gumroad.com/v2';

// His manual classifications: which sales are friends, which were hand-sold. Keyed by SALE ID, never
// by email. Defaults to unknown and stays unknown until he says otherwise — see metrics.customers().
export const CLASSIFY_FILE = path.join(ROOT, 'redos-ops', 'customers.json');

export function readClassifications() {
  try { return JSON.parse(fs.readFileSync(CLASSIFY_FILE, 'utf8')) || {}; } catch { return {}; }
}

// The ONLY request function here, and it cannot be anything but a GET.
async function get(pathname, token, params = {}) {
  const url = new URL(API + pathname);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { success: false, message: text.slice(0, 200) }; }
  if (!res.ok || body.success === false) {
    throw new Error(`gumroad ${pathname} ${res.status}: ${body.message || 'request failed'}`);
  }
  return body;
}

const cents = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };

// ── This pod is REDOS Ops, not "every product he has ever sold" ─────────────────────────────────
// The account also carries an old Twitter ebook with four free downloads on it. Counting those as
// REDOS customers would have put "4" against a north-star metric that is supposed to mean "strangers
// who wanted THIS", and it would have been wrong in the flattering direction, which is the worst
// kind. Product scoping is the fix, and it belongs here rather than in the metric layer so the
// snapshot never contains the other product at all.
export const isRedosProduct = (name = '') => /redos/i.test(String(name));

// PURE: one Gumroad sale → the only fields we keep. The email is deliberately absent.
export function normaliseSale(s = {}, classifications = {}) {
  const id = s.id || s.sale_id || '';
  const c = classifications[id] || {};
  return {
    id,
    at: String(s.created_at || '').slice(0, 10),
    tier: s.variants_and_quantity || s.product_name || 'unknown',
    priceCents: cents(s.price),
    feeCents: cents(s.gumroad_fee),
    affiliateCents: cents(s.affiliate_credit_amount_cents),
    refunded: s.refunded === true || s.partially_refunded === true,
    // 🚨 All three default to UNDEFINED, not false. Unknown is a real state and it must survive to
    // the metric layer, where unclassified buyers are excluded from the headline number.
    is_friend: typeof c.is_friend === 'boolean' ? c.is_friend : undefined,
    hand_sold: typeof c.hand_sold === 'boolean' ? c.hand_sold : undefined,
    // A row he created himself while testing checkout. NOT a friend — a friend is at least a person.
    // Conflating the two would quietly leave his own test sitting in the customer denominator.
    is_test: c.is_test === true,
  };
}

// PURE: the sales list → the shape metrics.mjs consumes.
export function summarise(sales = [], classifications = {}) {
  const all = (Array.isArray(sales) ? sales : []).map((s) => normaliseSale(s, classifications));
  // Scope to REDOS, then drop his own test rows. Both exclusions are counted and reported rather
  // than silently applied — a number that quietly got smaller is a number nobody can audit.
  const scoped = all.filter((r) => isRedosProduct(r.tier));
  const rows = scoped.filter((r) => !r.is_test);
  const live = rows.filter((r) => !r.refunded);
  const byTier = {};
  for (const r of live) byTier[r.tier] = (byTier[r.tier] || 0) + 1;
  return {
    customers: rows.map((r) => ({ id: r.id, at: r.at, is_friend: r.is_friend, hand_sold: r.hand_sold, refunded: r.refunded })),
    gross_cents: live.reduce((n, r) => n + r.priceCents, 0),
    fee_cents: live.reduce((n, r) => n + r.feeCents, 0),
    affiliate_cents: live.reduce((n, r) => n + r.affiliateCents, 0),
    refund_cents: rows.filter((r) => r.refunded).reduce((n, r) => n + r.priceCents, 0),
    orders: live.length,
    by_tier: byTier,
    unclassified: rows.filter((r) => r.is_friend === undefined).length,
    excluded: {
      other_products: all.length - scoped.length,
      self_tests: scoped.length - rows.length,
    },
  };
}

/**
 * fetch() -> { ok, data, fetchedAt, error }. Never throws.
 *
 * Paginated, with a hard page cap: a runaway loop against someone else's API is rude and slow, and at
 * this stage the whole sales history is a handful of rows anyway.
 */
export async function fetchSource({ token = process.env.GUMROAD_ACCESS_TOKEN, maxPages = 20 } = {}) {
  const fetchedAt = new Date().toISOString();
  if (!token) return { ok: false, data: null, fetchedAt, error: 'GUMROAD_ACCESS_TOKEN is not set' };
  try {
    const sales = [];
    let pageKey = null, pages = 0;
    do {
      const body = await get('/sales', token, pageKey ? { page_key: pageKey } : {});
      if (Array.isArray(body.sales)) sales.push(...body.sales);
      pageKey = body.next_page_key || null;
      pages += 1;
    } while (pageKey && pages < maxPages);
    return { ok: true, data: summarise(sales, readClassifications()), fetchedAt, error: '', pages };
  } catch (e) {
    return { ok: false, data: null, fetchedAt, error: e.message };
  }
}

/** healthCheck() -> { ok, credentialExpiresAt }. Gumroad tokens do not expire until revoked. */
export async function healthCheck({ token = process.env.GUMROAD_ACCESS_TOKEN } = {}) {
  if (!token) return { ok: false, error: 'GUMROAD_ACCESS_TOKEN is not set' };
  try {
    const u = await get('/user', token);
    return { ok: true, as: (u.user && (u.user.name || u.user.email_domain)) || 'gumroad user', credentialExpiresAt: null };
  } catch (e) { return { ok: false, error: e.message, credentialExpiresAt: null }; }
}

export { fetchSource as fetch };
