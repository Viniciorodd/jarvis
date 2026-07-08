// expenses.mjs — talk-to-track spending. "Hey Jarvis, I spent $40 on gas today" → parsed in CODE (never
// guessed by the LLM — money is deterministic, doctrine #1), appended to a plain JSONL ledger, and read
// back for totals. The companion detects an expense statement in the chat/voice stream and logs it before
// the model ever runs, so it works hands-free. Pure parser + summary are eval-pinned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'expenses');
const ledgerFile = (year) => path.join(DIR, `${year}.jsonl`);

// ── PURE: light category inference from the description. Eval-pinned. ────────────────────────────────
const CATEGORIES = [
  ['transport', /\b(gas|fuel|uber|lyft|toll|parking|ez.?pass|sunpass|car|tires?|oil change|dmv)\b/i],
  ['food', /\b(groceries|grocery|food|lunch|dinner|breakfast|coffee|restaurant|doordash|ubereats|snack|drinks?)\b/i],
  ['supplies', /\b(supplies|equipment|tools?|materials?|office|paper|printer|ink|hardware)\b/i],
  ['software', /\b(software|subscription|saas|hosting|domain|api|claude|openai|adobe|notion)\b/i],
  ['bills', /\b(bill|utilities|electric|water|internet|phone|rent|mortgage|insurance)\b/i],
  ['business', /\b(sam|registration|filing|llc|legal|accountant|bond|coi)\b/i],
];
export function categoryOf(description = '') {
  for (const [cat, re] of CATEGORIES) if (re.test(description)) return cat;
  return 'other';
}

// ── PURE: parse a spoken/typed expense statement. Eval-pinned. Returns { ok, amount, description,
// category, date } or { ok:false }. Money parsed by CODE — the LLM never invents the number. ───────────
export function parseExpense(text, now = new Date()) {
  const t = String(text || '').trim();
  if (!t) return { ok: false };
  // Needs a spend verb OR an explicit $ amount, to avoid logging random numbers.
  const hasVerb = /\b(spent|spend|paid|pay|bought|buy|expensed?|cost|dropped|charged)\b/i.test(t);
  const hasDollar = /\$\s?\d/.test(t);
  if (!hasVerb && !hasDollar) return { ok: false };
  // Amount: $40 · 40 dollars/bucks · "spent 40" · 40.50
  const am = t.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/)
    || t.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?|usd)\b/i)
    || t.match(/\b(?:spent|spend|paid|pay|cost|dropped|expensed?)\s+\$?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (!am) return { ok: false };
  const amount = Number(am[1].replace(/,/g, ''));
  if (!(amount > 0) || amount > 1e7) return { ok: false };
  // Description: text after "on" or "for", minus trailing time words.
  let desc = '';
  const dm = t.match(/\b(?:on|for)\s+(.+)$/i);
  if (dm) desc = dm[1];
  desc = desc.replace(/\b(today|yesterday|this (?:morning|afternoon|evening)|last night|just now|earlier|tonight)\b\.?$/i, '')
    .replace(/[.!?,\s]+$/, '').trim();
  if (desc.length > 80) desc = desc.slice(0, 80).trim();
  // Date: today (default) or yesterday.
  const d = /\byesterday\b/i.test(t) ? new Date(now.getTime() - 864e5) : new Date(now);
  const date = d.toISOString().slice(0, 10);
  return { ok: true, amount, description: desc || 'expense', category: categoryOf(desc), date };
}

// ── IO ──────────────────────────────────────────────────────────────────────────────────────────────
export function logExpense({ amount, description = 'expense', category = '', date = '', source = 'voice' } = {}) {
  const n = Number(amount);
  if (!(n > 0)) return { ok: false, error: 'amount must be > 0' };
  const day = (date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rec = { id: crypto.randomUUID(), ts: new Date().toISOString(), date: day, amount: Math.round(n * 100) / 100, description: String(description).slice(0, 120), category: category || categoryOf(description), source };
  try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(ledgerFile(day.slice(0, 4)), JSON.stringify(rec) + '\n'); }
  catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, expense: rec };
}

export function readExpenses({ year = new Date().getFullYear(), since = '' } = {}) {
  let raw; try { raw = fs.readFileSync(ledgerFile(year), 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (!since || e.date >= since) out.push(e); } catch { /* skip */ } }
  return out;
}

// PURE: roll a list of expense records into totals. Eval-pinned.
export function summarize(list = []) {
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCategory = {};
  for (const e of list) byCategory[e.category || 'other'] = Math.round(((byCategory[e.category || 'other'] || 0) + (Number(e.amount) || 0)) * 100) / 100;
  return { count: list.length, total: Math.round(total * 100) / 100, byCategory };
}

// Convenience: log from a raw utterance. Returns { ok, expense, spoken } — `spoken` is the confirmation.
export function captureFromText(text) {
  const p = parseExpense(text);
  if (!p.ok) return { ok: false };
  const r = logExpense({ amount: p.amount, description: p.description, category: p.category, date: p.date, source: 'voice' });
  if (!r.ok) return { ok: false, error: r.error };
  const today = readExpenses({ since: new Date().toISOString().slice(0, 10) });
  const dayTotal = summarize(today).total;
  const when = p.date === new Date().toISOString().slice(0, 10) ? 'today' : p.date;
  const spoken = `Got it — logged $${p.amount.toFixed(2)} for ${p.description} (${when}). That's $${dayTotal.toFixed(2)} tracked today.`;
  return { ok: true, expense: r.expense, spoken };
}

if (process.argv[1] && process.argv[1].endsWith('expenses.mjs')) {
  const arg = process.argv.slice(2).join(' ');
  if (arg) console.log(JSON.stringify(captureFromText(arg), null, 2));
  else { const l = readExpenses({}); console.log(JSON.stringify({ ...summarize(l), recent: l.slice(-10) }, null, 2)); }
}
