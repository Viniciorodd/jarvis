// digest.mjs — the DAILY GOV GROWTH DIGEST: one calm weekday-morning message so the growth engines
// (the wide-net quick-wins scout + the teaming radar) keep running without the operator ever opening
// a dashboard. Pulls the freshest quick wins (last 2 days) + teaming primes (last 60 days), renders the
// top 3 of each into a compact phone-friendly text, and hands it to the control-plane's
// /maintenance/gov-growth-digest route — the ROUTE owns the once-per-day dedup (gov.digest.sent events)
// and the Telegram push; this module never sends anything itself (a digest is a notification TO the
// operator, but the send stays in one audited place). renderDigest is PURE + eval-pinned;
// buildGrowthDigest does the live scans BEST-EFFORT — either engine failing just annotates its section,
// the digest still goes out with whatever's fresh. Calm by design: 3 + 3 items, one closing pointer.

import { scanQuickWins } from './quickwins.mjs';
import { scanTeaming } from './teaming.mjs';

const MAX_ITEMS = 3;   // the calm cap — the phone gets the top 3 per engine, the boards hold the rest
const TITLE_CH = 60;   // quick-win titles trimmed to fit one Telegram line
const NAME_CH = 40;    // agency / prime names trimmed harder — they're context, not the headline

// Trim a string to n chars, ellipsis when cut. Never returns more than n visible characters.
const trim = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

// Whole days from dateStr (YYYY-MM-DD) to a due date (any ISO-ish string). null when unparseable.
function daysLeft(due, dateStr) {
  const d = Date.parse(String(due || '').slice(0, 10) + 'T00:00:00Z');
  const t = Date.parse(String(dateStr || '').slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(d) || !Number.isFinite(t)) return null;
  return Math.round((d - t) / 86400000);
}

// How many items a scan section really has (0 when the scan failed — failures never inflate totals).
const sectionCount = (r) => (r && r.ok ? (r.count ?? (r.leads || []).length) : 0);

// PURE: render the digest text from scan results. Either input may be missing, empty, or { ok:false }
// — every shape degrades to a calm one-liner instead of a crash or a lie. Eval-pinned.
export function renderDigest({ quickwins, teaming, dateStr = new Date().toISOString().slice(0, 10) } = {}) {
  const qw = quickwins || { ok: false, error: 'not scanned' };
  const tm = teaming || { ok: false, error: 'not scanned' };
  const lines = [`Gov growth — ${dateStr}`, ''];

  // Quick wins: score first (it's the sort key on the board), then what/when/who.
  lines.push('Quick wins (fresh, in-lane):');
  const qwLeads = qw.ok && Array.isArray(qw.leads) ? qw.leads.slice(0, MAX_ITEMS) : [];
  if (!qw.ok) lines.push(`  scan unavailable${qw.error ? ` (${qw.error})` : ''}`);
  else if (!qwLeads.length) lines.push('  no new quick wins today');
  else qwLeads.forEach((l, i) => {
    const left = daysLeft(l.due, dateStr);
    lines.push(`${i + 1}. [${l.score}] ${trim(l.title, TITLE_CH)} — ${left == null ? 'no due date' : `${left}d left`} · ${trim(l.agency, NAME_CH)}`);
  });

  // Teaming primes: who, how big, where — enough to decide "reach out or not" from the phone.
  lines.push('', 'Teaming primes (they need small subs):');
  const tmLeads = tm.ok && Array.isArray(tm.leads) ? tm.leads.slice(0, MAX_ITEMS) : [];
  if (!tm.ok) lines.push(`  radar unavailable${tm.error ? ` (${tm.error})` : ''}`);
  else if (!tmLeads.length) lines.push('  no new teaming primes today');
  else tmLeads.forEach((l, i) =>
    lines.push(`${i + 1}. ${trim(l.recipient, NAME_CH)} — $${(Number(l.amount || 0) / 1e6).toFixed(1)}M · ${l.state || '??'}`));

  // One closing line: the totals + where to act. No links, no nagging — the boards do the heavy lifting.
  lines.push('', `${sectionCount(qw)} quick wins · ${sectionCount(tm)} teaming primes — open /quickwins or /teaming to act`);
  return lines.join('\n');
}

// Run both growth engines best-effort and render. Returns { text, counts } — counts feed the dedup
// event's payload so the audit trail shows what each morning's digest actually carried.
export async function buildGrowthDigest({ now = new Date() } = {}) {
  const dateStr = now.toISOString().slice(0, 10);
  let quickwins, teaming;
  try { quickwins = await scanQuickWins({ days: 2 }); }
  catch (e) { quickwins = { ok: false, error: e.message, leads: [], count: 0 }; }
  try { teaming = await scanTeaming({ days: 60 }); }
  catch (e) { teaming = { ok: false, error: e.message, leads: [], count: 0 }; }
  const text = renderDigest({ quickwins, teaming, dateStr });
  return { text, counts: { quickwins: sectionCount(quickwins), teaming: sectionCount(teaming) } };
}

if (process.argv[1] && /gov[\\/]digest\.mjs$/.test(process.argv[1])) {
  buildGrowthDigest().then((r) => { console.log(r.text + '\n'); console.log(JSON.stringify(r.counts)); });
}
