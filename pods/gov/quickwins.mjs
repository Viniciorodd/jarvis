// quickwins.mjs — the "wide net" scout for one-off, quick, in-lane jobs the main scout misses.
// The primary scout is locked to 3 janitorial NAICS. This casts a WIDER net (adjacent service NAICS +
// a keyword sweep) to surface the fun, fast, profitable one-offs — "the government needs a chimney swept,
// a one-time deep clean, grounds cleared, junk hauled" — while STILL filtering to Rodgate's lane and
// screening out the traps (base-ops, O&M, construction, IT, anything needing past performance / clearance
// / bonding). classifyQuickWin is PURE + eval-pinned; scanQuickWins does the live SAM fetch.

import { secret } from './lib.mjs';

// Adjacent service NAICS Rodgate can self-perform or easily sub — cleaning, grounds, hauling, pressure-
// wash, painting, moving, pest, snow. Deliberately wider than the primary 561210/561720/561990.
export const QUICKWIN_NAICS = ['561720', '561730', '561210', '561740', '561790', '561990', '561710', '561612', '562111', '562119', '238320', '488490', '484210', '561621', '561440'];

// The "fun one-off" vocabulary — the jobs that are quick, physical, and in his wheelhouse.
const LANE_KW = /\b(janitorial|custodial|cleaning|clean(?:ed|ing)?|carpet|floor care|floor strip|window wash|window clean|pressure wash|power wash|grounds|landscap|mow|lawn|snow (?:removal|plow)|haul|junk|debris|trash removal|waste removal|refuse|pest control|deep clean|one[- ]time|restoration|chimney|gutter|graffiti|pressure clean|paint(?:ing)?|moving services|relocation services|dumpster|porta)\b/i;

// Traps a brand-new no-past-performance small biz will lose — exclude hard.
const TRAP = /\b(base operations|\bBOS\b|operations and maintenance|\bO&M\b|IDIQ|multiple award|construction of|design[- ]build|renovation of|IT services|software|cyber|clearance|secret\b|top secret|surety|bonding required|past performance required|architect|engineering services|A-E services)\b/i;

// PURE: decide whether a SAM notice is an in-lane quick win + score it. Eval-pinned.
export function classifyQuickWin(opp = {}, { } = {}) {
  const title = String(opp.title || '');
  const desc = String(opp.description || opp.body || '');
  const text = `${title} ${desc}`;
  const naics = String(opp.naicsCode || opp.naics || '').trim();
  const setAside = String(opp.typeOfSetAside || opp.setAside || '');
  const type = String(opp.type || opp.ptype || '').toLowerCase();
  const sourcesSought = type === 'r' || /sources sought/i.test(text);

  if (TRAP.test(text)) return { ok: false, reason: 'trap (base-ops / O&M / construction / IT / clearance)' };
  if (/^8a$/i.test(setAside) || /8\(a\)/i.test(setAside)) return { ok: false, reason: '8(a)-only (not certified)' };

  const inNaics = QUICKWIN_NAICS.includes(naics);
  const kw = LANE_KW.test(text);
  if (!inNaics && !kw) return { ok: false, reason: 'out of lane' };

  const reasons = [];
  if (inNaics) reasons.push(`NAICS ${naics} in lane`);
  if (kw) reasons.push('keyword match');
  const oneTime = /\b(one[- ]time|single|deep clean|removal|haul|event|as[- ]needed|non[- ]recurring)\b/i.test(text);
  if (oneTime) reasons.push('looks one-time / quick');
  if (sourcesSought) reasons.push('sources-sought (free relationship)');
  const smallBizFriendly = setAside === '' || /SBP|SBA|SDB|total small|small business/i.test(setAside);
  if (smallBizFriendly) reasons.push('small-business friendly');
  // Certs he lacks (only a blocker for a real bid, not a sources-sought):
  const needsCert = /HZC|HUBZone|SDVOSBC|WOSB|EDWOSB/i.test(setAside);
  if (needsCert && !sourcesSought) return { ok: false, reason: 'needs a cert we lack (' + setAside + ')' };

  let score = 0;
  if (inNaics) score += 2;
  if (kw) score += 2;
  if (oneTime) score += 2;
  if (sourcesSought) score += 1;
  if (smallBizFriendly) score += 2;
  if (needsCert) score -= 1;
  return { ok: true, score, oneTime, sourcesSought, reasons, why: reasons.join(' · ') };
}

const mmddyyyy = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

// Live SAM fetch across the wide NAICS set → classify → ranked quick-wins list. Best-effort; returns
// { ok, count, leads, error? }. Reuses the vault-scoped SAM key (least privilege).
export async function scanQuickWins({ days = 7, limit = 60 } = {}) {
  const key = secret('CONNECT-01', 'SAM_API_KEY') || process.env.SAM_API_KEY;
  if (!key) return { ok: false, error: 'no SAM_API_KEY', leads: [], count: 0 };
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const seen = new Set();
  const leads = [];
  for (const code of QUICKWIN_NAICS) {
    const u = new URL('https://api.sam.gov/opportunities/v2/search');
    u.searchParams.set('api_key', key);
    u.searchParams.set('postedFrom', mmddyyyy(from));
    u.searchParams.set('postedTo', mmddyyyy(to));
    u.searchParams.set('ncode', code);
    u.searchParams.set('ptype', 'o,k,r');
    u.searchParams.set('limit', '100');
    let data;
    try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) continue; data = await r.json(); } catch { continue; }
    for (const o of data.opportunitiesData || []) {
      const id = o.solicitationNumber || o.noticeId;
      if (!id || seen.has(id)) continue; seen.add(id);
      const c = classifyQuickWin(o);
      if (!c.ok) continue;
      leads.push({
        noticeId: o.noticeId, sol: o.solicitationNumber || o.noticeId, title: o.title,
        agency: o.fullParentPathName || '', naics: o.naicsCode || '', type: o.type || '',
        setAside: o.typeOfSetAside || 'none stated', due: o.responseDeadLine || '', link: o.uiLink || '',
        score: c.score, why: c.why, oneTime: c.oneTime, sourcesSought: c.sourcesSought,
      });
    }
  }
  leads.sort((a, b) => b.score - a.score || String(a.due).localeCompare(String(b.due)));
  return { ok: true, count: leads.length, leads: leads.slice(0, limit) };
}

if (process.argv[1] && process.argv[1].endsWith('quickwins.mjs')) {
  const days = Number((process.argv.find((a) => a.startsWith('--days=')) || '').split('=')[1] || 7);
  scanQuickWins({ days }).then((r) => {
    if (!r.ok) { console.error('quickwins:', r.error); process.exit(1); }
    console.log(`\nQuick wins: ${r.count} in-lane one-off/quick notices (last ${days}d)\n`);
    for (const l of r.leads.slice(0, 20)) console.log(`[${l.score}] ${l.title}\n   ${l.agency} · ${l.naics} · due ${l.due || 'n/a'}\n   ${l.why}\n   ${l.link}\n`);
  });
}
