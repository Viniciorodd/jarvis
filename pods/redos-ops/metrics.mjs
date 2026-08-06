// metrics.mjs — snapshot in, numbers out. PURE: no clock, no network, no I/O.
//
// From the PRD, and it is the whole reason this module exists:
//
//   *"The gov pod is the proof of what happens without this. Two years of infrastructure and no
//    number that says whether it is working."*
//
// 🚫 AND THE RULE THAT OUTRANKS EVERY OTHER DESIGN CHOICE HERE. His own Belief Log has named the same
// pattern five times: **"Building is not earning."** So this file must never surface a number that a
// good day of coding can move. Commits, modules, evals green, features shipped, lines written — all
// of them go up when he builds and stay flat when he sells, which is precisely backwards for a man
// whose diagnosed failure mode is building instead of sending.
//
// That is enforced below by `assertNoVanity()` rather than left as a comment, because a banned-metric
// list in prose is a list somebody adds to.
//
// ⚠️ ABSENCE IS NOT A VALUE (L-013). Every function here propagates null. A source that failed
// produces `null` with a reason, never `0`. Zero means "we looked and there were none"; null means
// "we could not look". Rendering the second as the first is how a dashboard lies while every
// individual number in it is technically correct.

// ── The banned list, enforced ────────────────────────────────────────────────────────────────────
export const BANNED_METRICS = new Set([
  'followers', 'follower_count', 'impressions', 'likes', 'reactions', 'reach', 'engagement',
  'commits', 'modules', 'modules_built', 'evals', 'evals_green', 'lines_of_code', 'loc',
  'features_shipped', 'content_pieces', 'posts_written', 'drafts_created', 'hours_worked',
  'tasks_completed', 'streak',
]);

/**
 * PURE. Throws if a metric that rewards building is about to be rendered.
 *
 * Deliberately a throw and not a filter: silently dropping it would let the caller believe the number
 * was displayed, and the next person would "fix" the display. A failing test is the point.
 */
export function assertNoVanity(keys = []) {
  const bad = (Array.isArray(keys) ? keys : Object.keys(keys || {}))
    .filter((k) => BANNED_METRICS.has(String(k).toLowerCase()));
  if (bad.length) {
    throw new Error(`banned metric(s) on the REDOS dashboard: ${bad.join(', ')}. `
      + 'Building is not earning — nothing that moves without a stranger acting belongs here.');
  }
  return true;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
// `src` is a source result: { ok, data, fetchedAt, error }. Anything not ok yields null, with why.
const val = (src, pick, fallbackReason = 'source unavailable') => {
  if (!src || src.ok !== true || !src.data) return { value: null, why: (src && src.error) || fallbackReason };
  const v = pick(src.data);
  return { value: v === undefined ? null : v, why: v === undefined ? 'not in the payload' : '' };
};
const money = (cents) => (cents === null || cents === undefined ? null : Math.round(Number(cents)) / 100);

// ── 3.1 The one number ───────────────────────────────────────────────────────────────────────────
/**
 * PURE. Non-friend customers.
 *
 * 🚨 `is_friend` defaults to UNKNOWN and unknown does NOT count. The PRD is explicit that friends
 * never counted, and the honest consequence is that an unclassified buyer cannot be claimed as proof
 * a stranger wanted this. Counting unknowns would make the headline number drift upward on its own,
 * which is the one thing this number exists not to do.
 */
export function customers(snap = {}) {
  const src = snap && snap.sources && snap.sources.gumroad;
  if (!src || src.ok !== true) {
    return { nonFriend: null, friend: null, unknown: null, total: null, latest: null,
      why: (src && src.error) || 'no revenue source', source: 'gumroad', fetchedAt: (src && src.fetchedAt) || null };
  }
  const rows = Array.isArray(src.data.customers) ? src.data.customers : [];
  const isFriend = (c) => c && c.is_friend === true;
  const isStranger = (c) => c && c.is_friend === false;
  const nonFriend = rows.filter(isStranger);
  const dated = nonFriend.map((c) => c.at).filter(Boolean).sort();
  return {
    nonFriend: nonFriend.length,
    friend: rows.filter(isFriend).length,
    // Everything not deliberately classified. Surfaced, never counted.
    unknown: rows.filter((c) => c && c.is_friend !== true && c.is_friend !== false).length,
    total: rows.length,
    latest: dated.length ? dated[dated.length - 1] : null,
    why: '', source: 'gumroad', fetchedAt: src.fetchedAt || null,
  };
}

// ── 3.3 Money ────────────────────────────────────────────────────────────────────────────────────
/**
 * PURE. `net` is defined ONCE, here, and the definition travels with the number so a tile can print
 * it — PRD §9.4 asks for exactly that. After Gumroad fees AND after affiliate commission: that is
 * what actually lands in the account, and any other reading flatters the number.
 */
export const NET_DEFINITION = 'gross minus Gumroad fees minus affiliate commission';

export function revenue(snap = {}) {
  const src = snap && snap.sources && snap.sources.gumroad;
  const g = val(src, (d) => d.gross_cents);
  const f = val(src, (d) => d.fee_cents);
  const a = val(src, (d) => d.affiliate_cents);
  const r = val(src, (d) => d.refund_cents);
  const anyNull = [g, f, a].some((x) => x.value === null);
  return {
    grossUsd: money(g.value),
    netUsd: anyNull ? null : money(g.value - (f.value || 0) - (a.value || 0)),
    refundsUsd: money(r.value),
    netDefinition: NET_DEFINITION,
    byTier: (src && src.ok && src.data && src.data.by_tier) || null,
    // An average of nothing is not zero, it is nothing.
    aovUsd: (src && src.ok && src.data && Number(src.data.orders) > 0)
      ? money(g.value / Number(src.data.orders)) : null,
    why: anyNull ? (g.why || f.why || a.why || 'incomplete revenue data') : '',
    source: 'gumroad', fetchedAt: (src && src.fetchedAt) || null,
  };
}

// ── 3.3 Product + funnel ─────────────────────────────────────────────────────────────────────────
/**
 * PURE. The funnel, and which step loses the most. A step whose input is unknown is skipped rather
 * than treated as a 100% drop.
 */
export function funnel(snap = {}) {
  const sb = snap && snap.sources && snap.sources.supabase;
  const ph = snap && snap.sources && snap.sources.posthog;
  const visitors = val(ph, (d) => d.visitors).value;
  const signups = val(sb, (d) => d.signups).value;
  const analysed = val(sb, (d) => d.analysed_a_deal).value;
  const paid = customers(snap).total;

  const steps = [
    { name: 'visitors', value: visitors, source: 'posthog' },
    { name: 'signups', value: signups, source: 'supabase' },
    { name: 'analysed a deal', value: analysed, source: 'supabase' },
    { name: 'paid', value: paid, source: 'gumroad' },
  ];
  let worst = null;
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1].value, to = steps[i].value;
    if (from === null || to === null || from <= 0) continue;
    const lost = 1 - to / from;
    if (!worst || lost > worst.lost) worst = { from: steps[i - 1].name, to: steps[i].name, lost: Math.round(lost * 1000) / 10 };
  }
  return { steps, biggestDrop: worst, complete: steps.every((s) => s.value !== null) };
}

// ── 3.3 Leading indicators: sends ────────────────────────────────────────────────────────────────
/**
 * PURE. The leading half, and the only half he controls.
 *
 * Posts are counted as OUTPUT — how many went out. Never engagement, per §6.6. `assertNoVanity`
 * guards the shape so a well-meaning addition of "impressions" here fails a test rather than
 * quietly changing what the dashboard rewards.
 */
export function sends(snap = {}) {
  const out = snap && snap.sources && snap.sources.outreach;
  const brand = snap && snap.sources && snap.sources.brand;
  const shape = {
    emailsSent: val(out, (d) => d.sent).value,
    replies: val(out, (d) => d.replied).value,
    noReply: val(out, (d) => d.no_reply).value,
    postsPublished: val(brand, (d) => d.published).value,
    byPlatform: (brand && brand.ok && brand.data && brand.data.by_platform) || null,
  };
  assertNoVanity(shape);
  return { ...shape, source: 'outreach + brand', fetchedAt: (out && out.fetchedAt) || null };
}

// PURE: anything sent 7+ days ago with no reply. The PRD wants this SURFACED, never auto-chased —
// cold outreach stays human-sent, permanently.
export function needsFollowUp(snap = {}, todayISO = '') {
  const out = snap && snap.sources && snap.sources.outreach;
  if (!out || out.ok !== true || !Array.isArray(out.data.targets)) return [];
  const cutoff = todayISO ? new Date(Date.parse(todayISO) - 7 * 86400000).toISOString().slice(0, 10) : '';
  return out.data.targets
    .filter((t) => t && t.sent_at && !t.replied_at && (!cutoff || String(t.sent_at).slice(0, 10) <= cutoff))
    .map((t) => ({ who: t.who || t.email || 'unknown', sentAt: t.sent_at, days: days(t.sent_at, todayISO) }))
    .sort((a, b) => (b.days || 0) - (a.days || 0));
}

function days(a, b) {
  const x = Date.parse(a), y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.floor((y - x) / 86400000) : null;
}

// ── 3.3 Health, and staleness ────────────────────────────────────────────────────────────────────
export function health(snap = {}) {
  const src = (snap && snap.sources) || {};
  return Object.entries(src).map(([name, s]) => ({
    name,
    state: s && s.ok === true ? 'live' : 'failing',
    fetchedAt: (s && s.fetchedAt) || null,
    error: (s && s.error) || '',
  }));
}

export const STALE_HOURS = 26;

// PURE — `now` is passed in, never read from the clock, so the same snapshot always yields the same
// answer and the eval can pin it.
export function isStale(snap = {}, nowISO = '') {
  const at = Date.parse((snap && snap.at) || '');
  const now = Date.parse(nowISO);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return { stale: true, hours: null, why: 'no snapshot timestamp' };
  const hours = (now - at) / 3600000;
  return { stale: hours > STALE_HOURS, hours: Math.round(hours * 10) / 10, why: hours > STALE_HOURS ? `snapshot is ${Math.round(hours)}h old` : '' };
}

// ── 3.4 The digest ───────────────────────────────────────────────────────────────────────────────
/**
 * PURE. Four lines, per §7.
 *
 * The compassion clause governs the wording: state the number, name the next action, stop. No
 * streaks, no red, no "days since a sale" as a headline. A dashboard he avoids opening has failed
 * however accurate it is. An unknown prints as "unknown" — never as 0.
 */
export function digest(snap = {}, todayISO = '') {
  const c = customers(snap);
  const r = revenue(snap);
  const s = sends(snap);
  const f = needsFollowUp(snap, todayISO);
  const n = (v, suffix = '') => (v === null || v === undefined ? 'unknown' : v + suffix);
  const lines = [
    `Customers ${n(c.nonFriend)}` + (c.unknown ? ` (${c.unknown} unclassified)` : ''),
    `Money      ${r.netUsd === null ? 'unknown' : '$' + r.netUsd.toFixed(2) + ' net'}`
      + ` · ${r.refundsUsd === null ? 'refunds unknown' : (r.refundsUsd ? '$' + r.refundsUsd.toFixed(2) + ' refunded' : '0 refunds')}`,
    `Sends      ${n(s.emailsSent)} affiliate emails · ${n(s.postsPublished)} posts · ${n(s.replies)} replies`,
  ];
  lines.push(f.length
    ? `Attention  ${f[0].who}, ${f[0].days} days no reply` + (f.length > 1 ? ` (+${f.length - 1} more)` : '')
    : 'Attention  nothing waiting');
  return lines;
}
