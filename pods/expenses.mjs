// expenses.mjs — talk-to-track spending across BOTH books (personal + business). "Hey Jarvis, I spent
// $40 on gas for the business" → parsed in CODE (money is deterministic, doctrine #1), tagged personal
// or business, categorized, appended to a plain JSONL ledger, and read back for per-book totals. The
// companion detects an expense statement in the chat/voice stream and logs it before the model runs, so
// it works hands-free. Business entries are the tax-relevant ones (feed the Tax pod later). Pure parser
// + summary are eval-pinned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'expenses');
const ledgerFile = (year) => path.join(DIR, `${year}.jsonl`);
const DEFAULT_BOOK = 'personal'; // no cue + not a clearly-business category → personal
export const BOOKS = ['personal', 'business'];

// ── PURE: light category inference from the description. Eval-pinned. ────────────────────────────────
const CATEGORIES = [
  ['transport', /\b(gas|fuel|uber|lyft|toll|parking|ez.?pass|sunpass|car|tires?|oil change|dmv)\b/i],
  ['food', /\b(groceries|grocery|food|lunch|dinner|breakfast|coffee|restaurant|doordash|ubereats|snack|drinks?)\b/i],
  ['supplies', /\b(supplies|equipment|tools?|materials?|office|paper|printer|ink|hardware)\b/i],
  ['software', /\b(software|subscription|saas|hosting|domain|api|claude|openai|adobe|notion)\b/i],
  ['bills', /\b(bill|utilities|electric|water|internet|phone|rent|mortgage|insurance)\b/i],
  ['business', /\b(sam|registration|filing|llc|legal|accountant|bond|coi|payroll|sub|subcontractor|cage)\b/i],
];
export function categoryOf(description = '') {
  for (const [cat, re] of CATEGORIES) if (re.test(description)) return cat;
  return 'other';
}

// ── PURE: which book (personal | business) from explicit cues, else ''. Eval-pinned. ────────────────
const BIZ_CUE = /\b(?:for (?:the |my |a )?(?:business|company|work|firm|office|llc|rodgate|client|gig|contract)|(?:business|work) expense|deductible|write[-\s]?off|tax[-\s]?deduct)\b/i;
const PERSONAL_CUE = /\b(?:for (?:me|myself|the (?:house|home|family|kids?)|ana)|personal(?: expense)?|household)\b/i;
export function detectBook(text = '') {
  const t = String(text || '');
  if (BIZ_CUE.test(t)) return 'business';
  if (PERSONAL_CUE.test(t)) return 'personal';
  return '';
}

// ── PURE: parse a spoken/typed expense statement. Eval-pinned. Returns { ok, amount, description,
// category, book, date } or { ok:false }. Money parsed by CODE — the LLM never invents the number. ─────
export function parseExpense(text, now = new Date()) {
  const t = String(text || '').trim();
  if (!t) return { ok: false };
  const hasVerb = /\b(spent|spend|paid|pay|bought|buy|expensed?|cost|dropped|charged)\b/i.test(t);
  const hasDollar = /\$\s?\d/.test(t);
  if (!hasVerb && !hasDollar) return { ok: false };
  // Remember the book, then strip the cue phrase so it can't pollute the description ("gas for the business" → "gas").
  const explicitBook = detectBook(t);
  const clean = t.replace(BIZ_CUE, ' ').replace(PERSONAL_CUE, ' ').replace(/\s+/g, ' ').trim();
  const am = clean.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/)
    || clean.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|usd)\b/i)
    || clean.match(/\b(?:spent|spend|paid|pay|cost|dropped|expensed?)\s+\$?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (!am) return { ok: false };
  const amount = Number(am[1].replace(/,/g, ''));
  if (!(amount > 0) || amount > 1e7) return { ok: false };
  let desc = '';
  const dm = clean.match(/\b(?:on|for)\s+(.+)$/i);
  if (dm) desc = dm[1];
  desc = desc.replace(/\b(today|yesterday|this (?:morning|afternoon|evening)|last night|just now|earlier|tonight)\b\.?$/i, '')
    .replace(/[.!?,\s]+$/, '').trim();
  if (desc.length > 80) desc = desc.slice(0, 80).trim();
  const category = categoryOf(desc);
  const book = explicitBook || (category === 'business' ? 'business' : DEFAULT_BOOK);
  const d = /\byesterday\b/i.test(t) ? new Date(now.getTime() - 864e5) : new Date(now);
  return { ok: true, amount, description: desc || 'expense', category, book, date: d.toISOString().slice(0, 10) };
}

// ── IO ──────────────────────────────────────────────────────────────────────────────────────────────
export function logExpense({ amount, description = 'expense', category = '', book = '', date = '', source = 'voice' } = {}) {
  const n = Number(amount);
  if (!(n > 0)) return { ok: false, error: 'amount must be > 0' };
  const day = (date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const bk = BOOKS.includes(book) ? book : DEFAULT_BOOK;
  const rec = { id: crypto.randomUUID(), ts: new Date().toISOString(), date: day, amount: Math.round(n * 100) / 100, description: String(description).slice(0, 120), category: category || categoryOf(description), book: bk, source };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(ledgerFile(day.slice(0, 4)), JSON.stringify(rec) + '\n'); }
  catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, expense: rec };
}

export function readExpenses({ year = new Date().getFullYear(), since = '', book = '' } = {}) {
  let raw; try { raw = fs.readFileSync(ledgerFile(year), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if ((!since || e.date >= since) && (!book || (e.book || DEFAULT_BOOK) === book)) out.push(e); } catch { /* skip */ }
  }
  return out;
}

// PURE: roll a list into totals, split by book + by category. Eval-pinned.
const r2 = (x) => Math.round(x * 100) / 100;
export function summarize(list = []) {
  const byBook = { personal: 0, business: 0 };
  const byCategory = {};
  let total = 0;
  for (const e of list) {
    const a = Number(e.amount) || 0; total += a;
    const bk = BOOKS.includes(e.book) ? e.book : DEFAULT_BOOK;
    byBook[bk] = r2(byBook[bk] + a);
    byCategory[e.category || 'other'] = r2((byCategory[e.category || 'other'] || 0) + a);
  }
  return { count: list.length, total: r2(total), byBook, byCategory };
}

// Convenience: log from a raw utterance. Returns { ok, expense, spoken } — `spoken` is the confirmation.
export function captureFromText(text) {
  const p = parseExpense(text);
  if (!p.ok) return { ok: false };
  const r = logExpense({ amount: p.amount, description: p.description, category: p.category, book: p.book, date: p.date, source: 'voice' });
  if (!r.ok) return { ok: false, error: r.error };
  const todayISO = new Date().toISOString().slice(0, 10);
  const s = summarize(readExpenses({ since: todayISO }));
  const when = p.date === todayISO ? 'today' : p.date;
  const spoken = `Got it — logged $${p.amount.toFixed(2)} for ${p.description} (${when}, ${p.book}). Today: $${(s.byBook.business || 0).toFixed(2)} business, $${(s.byBook.personal || 0).toFixed(2)} personal.`;
  return { ok: true, expense: r.expense, spoken };
}

if (process.argv[1] && process.argv[1].endsWith('expenses.mjs')) {
  const arg = process.argv.slice(2).join(' ');
  if (arg) console.log(JSON.stringify(captureFromText(arg), null, 2));
  else { const l = readExpenses({}); console.log(JSON.stringify({ ...summarize(l), recent: l.slice(-10) }, null, 2)); }
}
