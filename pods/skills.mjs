// skills.mjs — the SKILLS RAIL data (Trillion's left panel: every capability listed, lighting up as
// it's invoked "so I can see which one's being used"). Jarvis's version derives the list from the
// event log itself — the skills shown are things the system has ACTUALLY done, not a wish list.
// Pure functions, eval-pinned; the companion serves it at /api/skills.

// Friendly labels for the actions that matter. Anything else gets humanized ("sub.reply.parsed" →
// "Sub reply parsed"). Pure noise never shows (rest, spend bookkeeping, mirrors).
const LABELS = {
  'scan.done': 'Scan SAM.gov',
  'bid.score': 'Score bid / no-bid',
  'sow.pull': 'Pull scope of work',
  'proposal.draft': 'Draft proposal',
  'compliance.check': 'Compliance pre-check',
  'proposal.submitted': 'Record submission',
  'procurement.shortlist': 'Rate subcontractors',
  'sub.outreach.draft': 'Draft sub outreach',
  'sub.reply.parsed': 'Parse sub quotes',
  'deal.priced': 'Price the bid (markup)',
  'briefs.push': 'Send top-3 briefs',
  'inbox.triage': 'Triage the inbox',
  'daily.logged': 'Log the day to Notion',
  'money': 'Bank revenue',
  'send': 'Send email (gated)',
  'submit': 'Submit proposal (gated)',
  'image.generate': 'Generate artwork',
  'thumbnail': 'Make a thumbnail',
};
const NOISE = new Set(['rest', 'spend.check', 'spend.log', 'mirror', 'disposition', 'estimate']);

export function labelFor(action) {
  if (LABELS[action]) return LABELS[action];
  return String(action || '').replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// ── PURE: reduce the event log to the rail — one row per (pod, action), newest activity first.
// live = fired in the last 2 minutes (pulse gold); recent = last 15 minutes (bright). Eval-pinned.
export function skillsFromEvents(events, now = Date.now(), { livemin = 2, recentMin = 15, cap = 40 } = {}) {
  const by = new Map();
  for (const e of (events || [])) {
    if (!e || !e.action || NOISE.has(e.action) || e.kind === 'meta') continue;
    const key = (e.pod || 'system') + '|' + e.action;
    const t = e.ts ? new Date(e.ts).getTime() : 0;
    const cur = by.get(key);
    if (cur) { cur.count++; if (t > cur.lastTs) { cur.lastTs = t; cur.who = e.actor || cur.who; } }
    else by.set(key, { pod: e.pod || 'system', action: e.action, label: labelFor(e.action), who: e.actor || '', lastTs: t, count: 1 });
  }
  return [...by.values()]
    .map((s) => ({ ...s, live: now - s.lastTs < livemin * 60000, recent: now - s.lastTs < recentMin * 60000 }))
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, cap);
}

// ── PURE: "3m ago" / "2h ago" / "3d ago" for the rail stamps. Eval-pinned. ──────────────────────────
export function ago(ts, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.round(m / 60); if (h < 24) return h + 'h';
  return Math.round(h / 24) + 'd';
}
