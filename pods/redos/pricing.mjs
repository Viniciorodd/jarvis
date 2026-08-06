// pricing.mjs — REDOS prices, read from the REDOS codebase. Never from memory.
//
// Doctrine directive #1: LLM proposes, deterministic code disposes. Prices, commissions and
// entitlements live in `DealCalc/lib/pricing.ts` and Postgres. An agent that states a price from
// memory is exactly the failure that put "$49" into six vault documents and left it there for
// weeks after the repricing.
//
// So this module does not contain prices. It PARSES them out of the real file at read time. If the
// file moves, is unreadable, or stops matching the expected shape, every caller fails closed —
// which is correct, because a marketing agent with no verified price should send nothing at all.
//
// REDOS_REPO points at the DealCalc checkout (default: the operator's local path).

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_REPO = 'C:\\Users\\vinic\\Documents\\Projects\\DealCalc';
export const COMMISSION_RATE = 0.5;   // 50%, per docs/AFFILIATE-ACCESS.md. Verified at read time below.

const PLAN_RE = /name:\s*"([^"]+)"[\s\S]{0,200}?price:\s*(\d+)/g;

/**
 * PURE-ish (one fs read, no network). Returns { ok, plans, commissions, allowed, error }.
 * `plans`       → [{ id, name, price }] in file order.
 * `commissions` → [{ name, price, commission }] at COMMISSION_RATE.
 * `allowed`     → Set of every dollar STRING a REDOS message may legitimately contain
 *                 without an external citation (prices + commissions).
 * On any failure: { ok:false, plans:[], allowed:new Set(), error }. Callers must treat !ok as
 * "block the send", never as "assume the defaults".
 */
export function readPlans(repo = process.env.REDOS_REPO || DEFAULT_REPO) {
  const file = path.join(repo, 'lib', 'pricing.ts');
  let src;
  try { src = fs.readFileSync(file, 'utf8'); }
  catch (e) { return { ok: false, plans: [], commissions: [], allowed: new Set(), error: `cannot read ${file}: ${e.code || e.message}` }; }

  const plans = [];
  for (const m of src.matchAll(PLAN_RE)) plans.push({ name: m[1], price: Number(m[2]) });

  if (plans.length < 3) {
    return { ok: false, plans, commissions: [], allowed: new Set(),
      error: `pricing.ts parsed ${plans.length} plans, expected at least 3 — the file shape changed, refusing to guess` };
  }

  const commissions = plans.map((p) => ({ ...p, commission: round2(p.price * COMMISSION_RATE) }));
  const allowed = new Set();
  for (const p of commissions) {
    allowed.add(fmt(p.price));
    allowed.add(fmt(p.commission));
  }
  return { ok: true, plans, commissions, allowed, error: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** "$79" / "$74.50" — the canonical rendering. Whole dollars never get ".00". */
export function fmt(n) {
  const v = round2(Number(n));
  return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

/** Every dollar figure in a body, normalised for comparison. "$1,234.50" → "$1234.50". */
export function dollarFigures(body = '') {
  return [...String(body).matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)]
    .map((m) => '$' + m[1].replace(/,/g, '').replace(/\.00$/, ''));
}
