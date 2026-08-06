// platforms.mjs — the publishing matrix. Pure policy: what may be posted where, how often, and in
// what shape. No network calls, no credentials. Adapters live separately and must ask this module
// for permission first.
//
// Every limit here was verified against a live vendor page on 2026-08-06. Two findings drove the
// design and both are worth stating in code so nobody re-litigates them from memory:
//
// 1. X KILLED THE FREE TIER on 2026-02-06. Pay-per-use: $0.015 a post, $0.200 a post if it contains
//    a URL. That is a 13x premium, so `stripLinks` is true for X and the link goes in a reply.
//    https://docs.x.com/x-api/getting-started/pricing
//
// 2. BROWSER AUTOMATION IS HOW ACCOUNTS DIE. LinkedIn's user agreement prohibits automated access
//    and it maintains a separate prohibited-software policy; X's terms have banned automated access
//    without written consent since 2023-09. LinkedIn fingerprints browsers and restricts accounts.
//    His LinkedIn IS his distribution, so `browserAutomationSafe` is false everywhere it matters and
//    `assertRoute` refuses a browser route on those platforms outright.
//
// The official APIs are sanctioned on all of these. Worst case there is a revoked key, not a dead
// account.

export const PLATFORMS = {
  bluesky: {
    label: 'Bluesky',
    route: 'api',                    // AT Protocol, app password
    free: true,
    costPerPost: 0,
    approvalRequired: false,         // no app registration, no review
    dailyCap: 11666,                 // ~1,666 creates/hour, 11,666/day
    safeDaily: 3,
    maxChars: 300,
    stripLinks: false,
    allowsAutomation: true,          // guidelines only forbid spam and manipulation
    browserAutomationSafe: false,    // never needed; the API is open
    tokenTtlDays: null,
    note: 'Easiest on the list. Build first.',
  },
  mastodon: {
    label: 'Mastodon',
    route: 'api',
    free: true,
    costPerPost: 0,
    approvalRequired: false,
    dailyCap: 1000,                  // 300 requests / 5 min, no separate post cap documented
    safeDaily: 3,
    maxChars: 500,
    stripLinks: false,
    allowsAutomation: true,
    browserAutomationSafe: false,
    tokenTtlDays: null,
    note: 'Mark the account automated. It is the platform convention and costs nothing.',
  },
  linkedin: {
    label: 'LinkedIn',
    route: 'api',                    // w_member_social, self-serve "Share on LinkedIn"
    free: true,
    costPerPost: 0,
    approvalRequired: false,         // self-serve for a personal profile
    dailyCap: 150,                   // 150 requests/member/day
    safeDaily: 1,
    safeWeekly: 4,                   // more divides algorithmic attention across posts
    maxChars: 3000,
    stripLinks: false,
    linkReachPenalty: true,          // external links reported at roughly 60% reach loss
    allowsAutomation: true,          // via the official API only
    browserAutomationSafe: false,    // UA prohibits it and LinkedIn is the aggressive enforcer
    personalProfileOnly: true,       // Company Pages need the Community Management API,
                                     // which excludes solo developers and unregistered projects
    tokenTtlDays: 60,
    note: 'Highest value destination and it is free. Personal profile only.',
  },
  threads: {
    label: 'Threads',
    route: 'api',
    free: true,
    costPerPost: 0,
    approvalRequired: false,         // add yourself as a tester under App Roles and skip App Review
    dailyCap: 250,                   // 250 API-published posts / 24h rolling
    safeDaily: 2,
    maxChars: 500,
    stripLinks: false,
    allowsAutomation: true,
    browserAutomationSafe: false,
    tokenTtlDays: 60,                // long-lived tokens expire; the refresh job is not optional
    note: 'Free and generous. The 60-day token refresh is the thing that will silently break.',
  },
  x: {
    label: 'X',
    route: 'api',
    free: false,                     // free tier discontinued 2026-02-06
    costPerPost: 0.015,
    costPerPostWithLink: 0.200,      // 13x. This is why stripLinks is true.
    approvalRequired: false,         // self-serve; the gate is billing, not review
    dailyCap: null,                  // billing is the limit
    safeDaily: 3,
    maxChars: 280,
    stripLinks: true,                // link goes in a reply, not the body
    allowsAutomation: true,
    browserAutomationSafe: false,    // terms ban automated access without written consent
    noDuplicateAcrossAccounts: true, // explicit rule in X's automation policy
    tokenTtlDays: null,
    note: 'Cheap but not free. Never put a link in the body.',
  },
  instagram: {
    label: 'Instagram',
    route: 'api',
    free: true,
    costPerPost: 0,
    approvalRequired: true,          // App Review required before publishing for non-testers
    dailyCap: 100,
    safeDaily: 1,
    maxChars: 2200,
    stripLinks: true,                // links are not clickable in captions anyway
    allowsAutomation: true,
    browserAutomationSafe: false,
    tokenTtlDays: 60,
    deferred: true,                  // professional account + linked Page + hosted media + review
    note: 'Defer until the other five run unattended for a month.',
  },
};

/** Platforms to build first: free, no approval, no waiting. */
export const START_WITH = ['bluesky', 'mastodon'];

/** Anything not deferred. */
export const ACTIVE = Object.keys(PLATFORMS).filter((k) => !PLATFORMS[k].deferred);

/**
 * The hard gate. Throws rather than returning false, because a caller that ignores a boolean here
 * is a caller that gets an account banned.
 */
export function assertRoute(platform, route = 'api') {
  const p = PLATFORMS[platform];
  if (!p) throw new Error(`unknown platform "${platform}"`);
  if (route !== 'api') {
    throw new Error(
      `refusing a "${route}" route to ${p.label}. Only the official API is permitted. ` +
      `Browser automation violates the terms on LinkedIn, X and Meta, and LinkedIn restricts ` +
      `accounts for it. His LinkedIn is his distribution and is not worth the risk.`
    );
  }
  return true;
}

/**
 * PURE. Can this text go to this platform right now?
 * Returns { ok, reasons, transformed } where `transformed` is the text after platform rules.
 */
export function checkPost(platform, text = '', { sentToday = 0, sentThisWeek = 0 } = {}) {
  const p = PLATFORMS[platform];
  const reasons = [];
  if (!p) return { ok: false, reasons: [`unknown platform "${platform}"`], transformed: null };
  if (p.deferred) reasons.push(`${p.label} is deferred until the core platforms are stable`);

  let body = String(text).trim();
  if (!body) reasons.push('empty body');

  // Link handling. On X this is a 13x billing decision, not a style one.
  const links = body.match(/https?:\/\/\S+/g) || [];
  let replyLink = null;
  if (p.stripLinks && links.length) {
    replyLink = links[0];
    body = body.replace(/https?:\/\/\S+/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (body.length > p.maxChars) reasons.push(`${body.length} chars over the ${p.maxChars} limit for ${p.label}`);

  const cap = p.safeDaily;
  if (cap != null && sentToday >= cap) reasons.push(`already sent ${sentToday} to ${p.label} today, safe cadence is ${cap}`);
  if (p.safeWeekly != null && sentThisWeek >= p.safeWeekly) {
    reasons.push(`already sent ${sentThisWeek} to ${p.label} this week, safe cadence is ${p.safeWeekly}`);
  }

  const notes = [];
  if (p.linkReachPenalty && links.length) notes.push('external link: LinkedIn reach drops materially. Consider omitting.');
  if (replyLink) notes.push(`link moved to a reply: in-body would cost $${p.costPerPostWithLink} instead of $${p.costPerPost}`);

  return { ok: reasons.length === 0, reasons, notes, transformed: body, replyLink };
}

/** What a week of posting costs, so the number is never a guess. */
export function weeklyCost(plan = {}) {
  let total = 0;
  const lines = [];
  for (const [k, n] of Object.entries(plan)) {
    const p = PLATFORMS[k];
    if (!p || !n) continue;
    const c = round2(p.costPerPost * n);
    total += c;
    lines.push(`${p.label}: ${n} posts, $${c.toFixed(2)}`);
  }
  return { total: round2(total), monthly: round2(total * 4.33), lines };
}

/** Jittered send times. Posting on the hour across every platform is a machine signature. */
export function jitter(baseHour, index, { spreadMin = 40, windowMin = 20 } = {}) {
  const offset = index * spreadMin;               // stagger platforms
  const wobble = ((index * 37) % (windowMin * 2)) - windowMin;  // deterministic, not random:
  const mins = baseHour * 60 + offset + wobble;   // the same plan must replay identically
  return { hour: Math.floor(((mins % 1440) + 1440) % 1440 / 60), minute: ((mins % 60) + 60) % 60 };
}

const round2 = (n) => Math.round(n * 100) / 100;
