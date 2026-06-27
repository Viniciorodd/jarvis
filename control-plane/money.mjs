// money.mjs — a simple income ledger Jarvis keeps in the vault (💵 Income Log.md) + progress toward the
// monthly goal, so the operator is always "on top of income". Manual entries now (gov payments, Fiverr,
// cash); Stripe folds in automatically when connected. Pure parse/total logic is eval-pinned; I/O wraps it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const VAULT_DIR = process.env.VAULT_DIR || path.join(os.homedir(), 'Documents', 'Second Brain');
export const MONTH_GOAL = Number(process.env.MONEY_GOAL || 10000);
const LEDGER = path.join(VAULT_DIR, '💵 Income Log.md');
const HEAD = '| Date | Source | Amount | Notes |';

// ── PURE ──────────────────────────────────────────────────────────────────────────────────────────
export function parseAmount(s) { const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
export function ym(d) { return String(d).slice(0, 7); } // YYYY-MM
const round2 = (n) => Math.round(n * 100) / 100;

// Parse the ledger's Markdown table → [{date, source, amount, notes}].
export function parseLedger(content) {
  const out = [];
  for (const l of String(content).split(/\r?\n/)) {
    if (!/^\s*\|.*\|\s*$/.test(l) || /^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (/^date$/i.test(c[0])) continue;
    if (!c[0] && !c[2]) continue;
    out.push({ date: c[0] || '', source: c[1] || '', amount: parseAmount(c[2]), notes: c[3] || '' });
  }
  return out;
}

// Summary for a month (default current): money-in MTD vs goal, % progress, lifetime total.
export function summarize(entries, { month, goal = MONTH_GOAL } = {}) {
  const m = month || new Date().toISOString().slice(0, 10).slice(0, 7);
  const mtd = entries.filter((e) => ym(e.date) === m).reduce((s, e) => s + e.amount, 0);
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return { month: m, mtd: round2(mtd), goal, pct: goal > 0 ? Math.min(100, Math.round((mtd / goal) * 100)) : 0, remaining: round2(Math.max(0, goal - mtd)), total: round2(total), count: entries.length };
}

// ── I/O ───────────────────────────────────────────────────────────────────────────────────────────
const eolOf = (c) => (/\r\n/.test(c) ? '\r\n' : '\n');
export function readLedger() { try { return parseLedger(fs.readFileSync(LEDGER, 'utf8')); } catch { return []; } }
export function logIncome({ source, amount, notes = '', date } = {}) {
  date = date || new Date().toISOString().slice(0, 10);
  let content;
  try { content = fs.readFileSync(LEDGER, 'utf8'); }
  catch { content = `# 💵 Income Log\n\n> Every dollar in. Jarvis totals it toward your $${MONTH_GOAL.toLocaleString()}/mo goal — gov payments, Fiverr, Stripe, cash, anything.\n\n${HEAD}\n|---|---|---|---|\n`; }
  const e = eolOf(content);
  const row = `| ${date} | ${String(source || '').replace(/\|/g, '/').trim()} | $${parseAmount(amount)} | ${String(notes || '').replace(/\|/g, '/').trim()} |`;
  fs.writeFileSync(LEDGER, content.replace(/\s*$/, '') + e + row + e);
  return { ok: true, row };
}

// CLI: node control-plane/money.mjs add "Fiverr" 500 "thumbnail order"   |   node control-plane/money.mjs
if (process.argv[1] && process.argv[1].endsWith('money.mjs')) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'add') { const r = logIncome({ source: rest[0], amount: rest[1], notes: rest.slice(2).join(' ') }); console.log('✓', r.row); }
  else { const s = summarize(readLedger()); console.log(`Income ${s.month}: $${s.mtd.toLocaleString()} / $${s.goal.toLocaleString()} (${s.pct}%) · $${s.remaining.toLocaleString()} to go · lifetime $${s.total.toLocaleString()}`); }
}
