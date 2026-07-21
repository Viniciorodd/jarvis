// bid-winners.mjs — "who actually wins this work?" (vault [[Jarvis]]: bid-winner research for Gideon/
// Patricia). Pure aggregation over the SAME comparable-award sample price-to-win already fetches from
// USASpending (fetchComparableAwards → [{ recipient, amount, date }]). No new network call. Feeds two
// things: the post-loss debrief (know the incumbent) and pricing (who to price against). Eval-pinned.

const round = (n) => Math.round(Number(n) || 0);
const norm = (r) => String(r || '').trim().replace(/\s+/g, ' ').toUpperCase();

// PURE: aggregate awards by recipient → the firms that win this lane, ranked by win count then dollars.
// Returns { totalAwards, totalDollars, uniqueWinners, winners:[{recipient,wins,total,avg,lastDate,winSharePct,dollarSharePct}] }.
export function topWinners(awards = [], { limit = 8 } = {}) {
  const usable = (awards || []).filter((a) => a && a.recipient && Number(a.amount) > 0);
  const totalAwards = usable.length;
  const totalDollars = usable.reduce((s, a) => s + Number(a.amount), 0);
  const by = new Map();
  for (const a of usable) {
    const k = norm(a.recipient);
    const g = by.get(k) || { recipient: a.recipient, wins: 0, total: 0, lastDate: '' };
    g.wins += 1; g.total += Number(a.amount);
    if ((a.date || '') > g.lastDate) g.lastDate = a.date || '';
    by.set(k, g);
  }
  const winners = [...by.values()]
    .map((g) => ({
      recipient: g.recipient, wins: g.wins, total: round(g.total), avg: round(g.total / g.wins), lastDate: g.lastDate,
      winSharePct: totalAwards ? Math.round((g.wins / totalAwards) * 1000) / 10 : 0,
      dollarSharePct: totalDollars ? Math.round((g.total / totalDollars) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.total - a.total)
    .slice(0, limit);
  return { totalAwards, totalDollars: round(totalDollars), uniqueWinners: by.size, winners };
}

// PURE: a plain-English read of concentration — is this lane locked up by an incumbent, or wide open?
export function winnerSummary(agg = {}) {
  const { totalAwards = 0, uniqueWinners = 0, winners = [] } = agg;
  if (!totalAwards) return { level: 'none', text: 'No comparable awards found — no incumbent signal yet.' };
  const top = winners[0];
  const level = top && top.winSharePct >= 40 ? 'concentrated' : uniqueWinners >= Math.max(6, totalAwards * 0.6) ? 'fragmented' : 'moderate';
  const lead = top ? `${top.recipient} leads (${top.wins} of ${totalAwards} awards, ${top.winSharePct}%)` : '';
  const text = level === 'concentrated'
    ? `Incumbent-heavy: ${lead}. Expect an entrenched competitor — price and past-performance must be sharp, and a debrief is worth requesting on a loss.`
    : level === 'fragmented'
      ? `Wide open: ${uniqueWinners} different winners across ${totalAwards} awards — no lock-in, good room for a new entrant.`
      : `Moderately contested: ${lead}. Beatable with a strong offer.`;
  return { level, text };
}
