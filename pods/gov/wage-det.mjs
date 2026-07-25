// wage-det.mjs — the SCA / Service Contract Labor Standards (SCLS) WAGE DETERMINATION reader + the self-perform
// price built off it. For janitorial/facilities work the SCA wage determination is the legal price backbone:
// the minimum hourly wage + Health & Welfare fringe per labor category in the place of performance (free,
// attached to the solicitation, cached by Phase 1). Doctrine #1: parsing + money math are PURE + deterministic
// + eval-pinned — no LLM near the money. Never fabricates a wage (garbage text → empty rates), and the bid can
// never come in below the SCA labor floor.

import fs from 'node:fs';
import path from 'node:path';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// knob: explicit → env → default, then CLAMP (a typo can never produce an underwater or absurd bid).
function knob(explicit, envName, dflt, lo, hi) {
  const envN = Number(process.env[envName]);
  const want = explicit != null ? Number(explicit) : (isFinite(envN) ? envN : dflt);
  return Math.min(hi, Math.max(lo, isFinite(want) ? want : dflt));
}

// PURE: parse a wage-determination's text → structured rates + Health & Welfare. Eval-pinned.
export function parseWageDetermination(text = '') {
  const t = String(text || '');
  const rates = [];
  const seen = new Set();
  // occupation lines: "11150 - Janitor .......... 16.85"  (5-digit code - title - hourly rate)
  for (const m of t.matchAll(/^\s*(\d{5})\s*-\s*(.+?)[\s.]+\$?(\d{1,3}\.\d{2})\s*$/gm)) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    rates.push({ code, title: m[2].replace(/[\s.]+$/, '').replace(/\s+/g, ' ').trim(), hourly: Number(m[3]) });
  }
  // Health & Welfare: "$5.36 per hour" (or "per week" → ÷ the WD's weekly hours, default 40)
  let healthWelfare = 0;
  const hw = t.match(/health\s*(?:&amp;|&|and)?\s*welfare[^$\d]*\$?\s*(\d+\.\d{2})\s*(per\s*(hour|week|hr|wk))?/i);
  if (hw) {
    let v = Number(hw[1]);
    if (hw[3] && /week|wk/i.test(hw[3])) { const wk = (t.match(/(\d{2})\s*hours?\s*(?:per\s*)?week/i) || [])[1]; v = v / (Number(wk) || 40); }
    healthWelfare = round2(v);
  }
  const wd = t.match(/wd\s*([0-9-]+)\s*\(?\s*rev\.?-?\s*(\d+)/i);
  return { wdNumber: wd ? wd[1] : '', revision: wd ? Number(wd[2]) : null, rates, healthWelfare, source: rates.length ? 'parsed' : 'no rates found' };
}

// PURE: the janitorial/custodial-relevant labor categories, matched by TITLE (robust across WD code series —
// Janitor 11150, Window Cleaner 11360, etc. don't share a prefix). Eval-pinned.
export function janitorialRates(parsed = {}) {
  return (parsed.rates || []).filter((r) => /janitor|custodial|cleaner|housekeep|window|floor|maid|porter/i.test(String(r.title)));
}

// PURE: the SCA-compliant SELF-PERFORM labor-loaded bid. directLabor uses wage + H&W (the SCA minimum);
// burden (payroll taxes / workers-comp) applies to the CASH wage only (H&W paid to a plan is exempt); then
// supplies, overhead, and profit. `floorHourly` (wage + H&W) is the minimum the bid must clear. Eval-pinned.
export function laborLoadedPrice({ baseHourly, hwHourly = 0, hours, burdenPct = null, supplies = 0, overheadPct = null, profitPct = null } = {}) {
  const base = Number(baseHourly) || 0, hw = Number(hwHourly) || 0, hrs = Number(hours) || 0;
  if (base <= 0 || hrs <= 0) return null;
  const burden = knob(burdenPct, 'GOV_LABOR_BURDEN_PCT', 22, 10, 45);
  const overhead = knob(overheadPct, 'GOV_OVERHEAD_PCT', 15, 5, 40);
  const profit = knob(profitPct, 'GOV_PROFIT_PCT', 10, 3, 30);
  const supp = Math.max(0, Number(supplies) || 0);
  const directLabor = round2((base + hw) * hrs);
  const burdenCost = round2(base * hrs * (burden / 100));
  const laborCost = round2(directLabor + burdenCost);
  const cost = round2(laborCost + supp);
  const withOverhead = round2(cost * (1 + overhead / 100));
  const bid = round2(withOverhead * (1 + profit / 100));
  return {
    floorHourly: round2(base + hw), hours: hrs, directLabor, burdenPct: burden, burden: burdenCost,
    laborCost, supplies: supp, overheadPct: overhead, overhead: round2(withOverhead - cost),
    profitPct: profit, profit: round2(bid - withOverhead), bid,
  };
}

// Best-effort IO: find + parse the wage determination among a notice's cached attachments (Phase 1). Picks the
// attachment text with the most parsed rate lines. Never throws — no cache / no WD → empty rates.
export async function readCachedWd(op = {}) {
  try {
    const { attDir } = await import('./attachments.mjs');
    const dir = attDir(op);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
    let best = null;
    for (const f of files) {
      const parsed = parseWageDetermination(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (parsed.rates.length && (!best || parsed.rates.length > best.rates.length)) best = parsed;
    }
    return best || { wdNumber: '', revision: null, rates: [], healthWelfare: 0, source: 'no wage determination found in attachments' };
  } catch { return { wdNumber: '', revision: null, rates: [], healthWelfare: 0, source: 'attachments not available' }; }
}

// PURE: one plain-English line for the proposal / card.
export function priceLine(p) {
  if (!p) return '';
  const f = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `SCA labor ${f(p.floorHourly)}/hr × ${p.hours} hrs = ${f(p.directLabor)} + ${p.burdenPct}% burden (${f(p.burden)})${p.supplies ? ' + supplies ' + f(p.supplies) : ''} → +${p.overheadPct}% overhead → +${p.profitPct}% profit → bid ${f(p.bid)} (never below the SCA floor of ${f(p.floorHourly)}/hr).`;
}
