// Finance pod (Victor / LEDGER-01, pod "exec") — create a Stripe PAYMENT LINK / invoice for a client,
// gated for your approval. This is the first money-IN path.
//
// Doctrine in code:
//  §1 code disposes — the AMOUNT is parsed + validated HERE (never invented by an LLM), money is integer
//     cents, and a deterministic idempotency key stops a double-charge if an approval is replayed.
//  §9 rule 2 (gate irreversibles) — draftInvoice only DRAFTS + raises a gate; the link is created in Stripe
//     by the control-plane executor ONLY when you approve, and only with FINANCE_AUTO_INVOICE=1 (else dry-run).
//  §3 least privilege — the Stripe key is read through the vault, scoped to LEDGER-01; no other agent can read it.
//  Test mode first: use sk_test_ keys. A sk_live_ key is REFUSED unless STRIPE_ALLOW_LIVE=1.
// Stripe is called over its REST API with fetch (form-encoded) — no npm dep, runs on the NAS alpine image.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, env, emit, hqApproval, mirror as gmirror } from '../lib.mjs';
import { getSecret } from '../../control-plane/vault.mjs';

const DRAFTS = path.join(ROOT, 'finance-drafts');
const mirror = (agent, state, text) => gmirror(agent, state, text, 'exec');
const dollars = (cents) => (cents / 100).toFixed(2);

// PURE: a money string/number -> integer cents. Rejects junk, zero, negatives, and > $1,000,000. Eval-tested.
export function toCents(amount) {
  let n;
  if (typeof amount === 'number') { if (!Number.isFinite(amount)) return null; n = amount; }
  else if (typeof amount === 'string') { const c = amount.replace(/[$,\s]/g, ''); if (!/^\d+(\.\d{1,2})?$/.test(c)) return null; n = parseFloat(c); }
  else return null;
  if (!(n > 0) || n > 1_000_000) return null;
  return Math.round(n * 100);
}

const EMAIL_OK = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

// PURE: validate + normalize an invoice request. Eval-tested — the deterministic core of the money gate.
export function validateInvoice({ amountUsd, customerEmail = '', description = '', currency = 'usd' } = {}) {
  const cents = toCents(amountUsd);
  if (cents == null) return { ok: false, reason: `invalid amount ${JSON.stringify(amountUsd)} (must be > $0 and <= $1,000,000)` };
  if (customerEmail && !EMAIL_OK(customerEmail)) return { ok: false, reason: `invalid customer email: ${customerEmail}` };
  const cur = /^[a-z]{3}$/i.test(currency) ? currency.toLowerCase() : 'usd';
  const desc = String(description || '').trim().replace(/\s+/g, ' ').slice(0, 250) || 'Services rendered';
  return { ok: true, cents, amountUsd: cents / 100, currency: cur, description: desc, customerEmail: String(customerEmail || '').trim() };
}

// PURE: deterministic idempotency key so replaying the SAME approval can't create two links (§9 rule 5).
export function idempotencyKey(spec) {
  return 'inv_' + crypto.createHash('sha256').update(`${spec.cents}|${spec.currency}|${spec.customerEmail}|${spec.description}`).digest('hex').slice(0, 32);
}

// PURE gate: should approving this request create a payment link? exec pod + "invoice" action + a spec with
// a positive cents amount. Eval-tested — the executor only acts on what this returns.
export function invoiceFromApproval(reqEvent) {
  if (!reqEvent || reqEvent.kind !== 'approval.request') return null;
  if (reqEvent.pod !== 'exec') return null;
  if (String(reqEvent.action || '').toLowerCase() !== 'invoice') return null;
  const spec = reqEvent.payload && reqEvent.payload.spec;
  if (!spec || !(Number(spec.cents) > 0)) return null;
  return spec;
}

async function stripePost(pathname, params, key, idemKey) {
  const headers = { Authorization: 'Bearer ' + key, 'content-type': 'application/x-www-form-urlencoded' };
  if (idemKey) headers['Idempotency-Key'] = idemKey;
  const r = await fetch('https://api.stripe.com/v1' + pathname, { method: 'POST', headers, body: new URLSearchParams(params).toString() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || `Stripe ${r.status}`);
  return d;
}

// Hit Stripe (test or live) to create a price + payment link. Returns { ok, url, id, mode } / { ok:false, reason }.
export async function createPaymentLink(spec) {
  let key;
  try { key = getSecret('LEDGER-01', 'STRIPE_API_KEY'); } catch (e) { return { ok: false, reason: 'vault denied: ' + e.message }; }
  if (!key) return { ok: false, reason: 'no STRIPE_API_KEY (scoped to LEDGER-01) — add a test key to .env' };
  const live = /^sk_live_/.test(key);
  if (live && !/^(1|true|yes|on)$/i.test(env('STRIPE_ALLOW_LIVE', ''))) return { ok: false, reason: 'refusing a LIVE Stripe key without STRIPE_ALLOW_LIVE=1 (test mode first)' };
  const idem = idempotencyKey(spec);
  try {
    const price = await stripePost('/prices', { currency: spec.currency, unit_amount: String(spec.cents), 'product_data[name]': spec.description }, key, idem + '_p');
    const link = await stripePost('/payment_links', { 'line_items[0][price]': price.id, 'line_items[0][quantity]': '1' }, key, idem + '_l');
    return { ok: true, url: link.url, id: link.id, price: price.id, mode: live ? 'live' : 'test' };
  } catch (e) { return { ok: false, reason: e.message }; }
}

// Write a ready-to-send email (To:/Subject:/--- body) carrying the link, so you can email it via the
// existing send gate (`node scripts/gov-send.mjs <file> --send`) the moment the link exists. Returns the path.
export function writeInvoiceEmail(spec, url) {
  fs.mkdirSync(DRAFTS, { recursive: true });
  const file = path.join('finance-drafts', `invoice-email-${spec.cents}.md`);
  const body = `To: ${spec.customerEmail}\nSubject: Invoice from Rodgate, LLC — $${dollars(spec.cents)}\n${'-'.repeat(48)}\n\nHello${spec.customerName ? ' ' + spec.customerName : ''},\n\nThank you for your business. You can securely pay your invoice for "${spec.description}" ($${dollars(spec.cents)} ${spec.currency.toUpperCase()}) here:\n\n${url}\n\nPlease reach out with any questions.\n\nBest regards,\nRodgate, LLC\n`;
  fs.writeFileSync(path.join(ROOT, file), body);
  return file;
}

// Draft an invoice / payment link: validate (code), write a draft artifact, raise the HITL money gate.
// NO Stripe call here — the link is created by the executor on your approval.
export async function draftInvoice({ amountUsd, customerEmail = '', customerName = '', description = '', currency = 'usd' } = {}) {
  const v = validateInvoice({ amountUsd, customerEmail, description, currency });
  if (!v.ok) {
    await emit({ kind: 'trace', actor: 'LEDGER-01', pod: 'exec', action: 'invoice.invalid', status: 'error', rationale: v.reason });
    await mirror('LEDGER-01', 'idle', v.reason);
    return { ok: false, reason: v.reason };
  }
  const who = customerName || v.customerEmail || 'a client';
  await mirror('LEDGER-01', 'work', `Drafting a $${v.amountUsd.toFixed(2)} payment link for ${who}…`);
  const spec = { ...v, customerName: String(customerName || '').trim() };
  fs.mkdirSync(DRAFTS, { recursive: true });
  const slug = (customerName || v.customerEmail || 'client').replace(/[^\w]+/g, '-').slice(0, 30).toLowerCase() || 'client';
  const file = path.join('finance-drafts', `invoice-${slug}-${spec.cents}.json`);
  fs.writeFileSync(path.join(ROOT, file), JSON.stringify(spec, null, 2));

  await emit({ kind: 'action', actor: 'LEDGER-01', pod: 'exec', action: 'invoice.draft', reversible: true, rationale: `Drafted a $${v.amountUsd.toFixed(2)} ${v.currency.toUpperCase()} payment link for ${who} — ${v.description}`, payload: { file, cents: spec.cents } });
  await emit({ kind: 'approval.request', actor: 'LEDGER-01', pod: 'exec', action: 'invoice', status: 'pending', reversible: false, rationale: `Create a Stripe payment link: $${v.amountUsd.toFixed(2)} ${v.currency.toUpperCase()} — ${v.description}${customerName ? ' (' + customerName + ')' : ''}.`, payload: { spec, file } });
  await hqApproval({ pod: 'Executive', title: `Approve payment link: $${v.amountUsd.toFixed(2)} — ${v.description}`, detail: `${who} · ${v.currency.toUpperCase()} · created in Stripe on approval (test mode unless STRIPE_ALLOW_LIVE=1)`, xp: 15, verb: 'Approve & create' });
  await mirror('LEDGER-01', 'need', `Payment link ready — $${v.amountUsd.toFixed(2)} for ${who} (needs your approval)`);
  return { ok: true, spec, file };
}

if (process.argv[1] && process.argv[1].endsWith('invoice.mjs')) {
  const [amount, email, ...rest] = process.argv.slice(2);
  draftInvoice({ amountUsd: amount, customerEmail: email || '', description: rest.join(' ') })
    .then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e); process.exitCode = 1; });
}
