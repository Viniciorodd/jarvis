// Account registry + CSV column-map profiles. An account carries a defaultEntity and — once learned —
// a columnMap keyed by the CSV header hash, so every future file from that bank is parsed by CODE only
// (the LLM proposes the map once; the operator confirms it before any row files). PURE core + fs wrappers.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toCents } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, 'accounts.json');
const LOCAL = path.join(HERE, 'accounts.local.json');

// PURE: a stable identity for a CSV layout — lowercased, trimmed header cells joined.
export function headerHash(headerCells) {
  const norm = (headerCells || []).map((c) => String(c).toLowerCase().trim()).join('|');
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 12);
}

// PURE: one raw CSV row + a columnMap → normalized { dateISO, cents, direction } or { error }.
export function applyMap(row, columnMap) {
  const m = columnMap || {};
  const rawDate = String(row[m.dateCol] ?? '').trim();
  const dateISO = toISO(rawDate);
  if (!dateISO) return { error: `bad date ${JSON.stringify(rawDate)}` };
  let cents, direction;
  if (m.signConvention === 'debit-credit') {
    const d = String(row[m.debitCol] ?? '').trim(), c = String(row[m.creditCol] ?? '').trim();
    if (d) { const v = toCents(d); if (v == null) return { error: `bad debit ${d}` }; cents = v; direction = 'out'; }
    else if (c) { const v = toCents(c); if (v == null) return { error: `bad credit ${c}` }; cents = v; direction = 'in'; }
    else return { error: 'row has neither debit nor credit' };
  } else {
    let raw = String(row[m.amountCol] ?? '').trim();
    const neg = /^-/.test(raw) || /^\(.*\)$/.test(raw);
    raw = raw.replace(/[()\-]/g, '');
    const v = toCents(raw);
    if (v == null) return { error: `bad amount ${JSON.stringify(row[m.amountCol])}` };
    cents = v; direction = neg ? 'out' : 'in';
  }
  return { dateISO, cents, direction };
}

// PURE: parse common US date formats → ISO. Returns '' if it can't.
function toISO(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { let [, mo, d, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  return '';
}

// PURE: find the account whose saved headerHash matches this file; else flag needsMapping.
export function resolveProfile(accounts, headerCells) {
  const h = headerHash(headerCells);
  const byHash = (accounts || []).find((a) => a.headerHash === h);
  if (byHash) return { account: byHash, columnMap: byHash.columnMap };
  // unknown layout — caller must map it (Claude proposes, operator confirms). Pick a single account if
  // there's exactly one, else null (caller asks which account this file belongs to).
  const single = (accounts || []).length === 1 ? accounts[0] : null;
  return single ? { account: single, needsMapping: true } : null;
}

// ── fs wrappers (not eval-tested) ──────────────────────────────────────────────────────────────────
export function loadAccounts() {
  if (!fs.existsSync(LOCAL)) fs.copyFileSync(TEMPLATE, LOCAL);
  return JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
}
export function saveAccounts(a) { fs.writeFileSync(LOCAL, JSON.stringify(a, null, 2)); }
export function saveProfile(accountId, headerCells, columnMap) {
  const store = loadAccounts();
  const acct = store.accounts.find((x) => x.id === accountId);
  if (!acct) return { error: `unknown account ${accountId}` };
  acct.headerHash = headerHash(headerCells); acct.columnMap = columnMap;
  saveAccounts(store); return acct;
}
