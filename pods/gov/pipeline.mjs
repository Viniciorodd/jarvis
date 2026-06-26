// pipeline.mjs — the Gov Pipeline board, derived deterministically from the live truth (the SAM scout's
// scored opportunities + drafted proposals + pending gates + awards). No parallel list that drifts: the
// board always reflects what the system actually found and did. Pure functions (eval-pinned); the server
// feeds it live data and renders the columns.
//
// The straight line it encodes:  Find → Score → Respond → Build past performance → Track
// Columns:                       Found → Reviewing → Responding → Submitted → Won / Lost
//
// Lane (operator is SDB / minority small business — NOT 8(a)/HUBZone/SDVOSB/WOSB):
//   janitorial · custodial · grounds · facilities, sub-$150k, Total Small Business / SDB set-asides.

// ── PURE: fit score 0–100 → 1–5 (what the operator glances at) ────────────────────────────────────
export function fitScore(score) {
  const s = Number(score) || 0;
  if (s >= 85) return 5;
  if (s >= 70) return 4;
  if (s >= 55) return 3;
  if (s >= 40) return 2;
  return 1;
}

// ── PURE: is this set-aside in the operator's lane? (can they PRIME it?) ───────────────────────────
// SDB small business can prime: Total Small Business, SDB set-asides, and unrestricted. They CANNOT
// prime 8(a)/HUBZone/SDVOSB/WOSB — those are "subcontract only".
const OUT_OF_LANE = /8\s*\(a\)|hubzone|service[- ]?disabled|sdvosb|veteran[- ]?owned|wosb|women[- ]?owned|edwosb/i;
export function inLane(setAside) { return !OUT_OF_LANE.test(String(setAside || '')); }

// ── PURE: tidy the noisy SAM strings for a calm card ──────────────────────────────────────────────
export function shortSetAside(s) {
  const t = String(s || '');
  if (/8\s*\(a\)/i.test(t)) return '8(a)';
  if (/hubzone/i.test(t)) return 'HUBZone';
  if (/service[- ]?disabled|sdvosb/i.test(t)) return 'SDVOSB';
  if (/wosb|women[- ]?owned|edwosb/i.test(t)) return 'WOSB';
  if (/total small business/i.test(t)) return 'Small Business';
  if (/small disadvantaged|^sdb\b/i.test(t)) return 'SDB';
  if (/small business/i.test(t)) return 'Small Business';
  return t ? t.slice(0, 22) : 'Unrestricted';
}
export function shortAgency(a) {
  const t = String(a || '').trim();
  const m = t.match(/^(.*),\s*DEPARTMENT OF$/i);
  const name = m ? 'Dept of ' + m[1] : t;
  return name.replace(/\b([A-Z])([A-Z]+)\b/g, (_, h, r) => h + r.toLowerCase()).slice(0, 30);
}
// Infer the trade + a likely NAICS from the title (the scout payload often omits NAICS).
export function inferTrade(title) {
  const t = String(title || '').toLowerCase();
  if (/janitor|custodial|cleaning|housekeep/.test(t)) return { trade: 'Janitorial', naics: '561720' };
  if (/grounds|landscap|lawn|mowing|vegetation/.test(t)) return { trade: 'Grounds', naics: '561730' };
  if (/pest|disinfect|remediation/.test(t)) return { trade: 'Pest/Remediation', naics: '561710' };
  if (/base operation|\bbos\b|facilit|maintenance|operations support/.test(t)) return { trade: 'Facilities', naics: '561210' };
  return { trade: '', naics: '' };
}

// ── PURE: the five columns, in order ──────────────────────────────────────────────────────────────
export const COLUMNS = [
  { key: 'found',      label: 'Found',      hint: 'Scout flagged it · scored' },
  { key: 'reviewing',  label: 'Reviewing',  hint: 'Worth a look · decide to pursue' },
  { key: 'responding', label: 'Responding', hint: 'Drafting / your sign-off' },
  { key: 'submitted',  label: 'Submitted',  hint: 'Sent · awaiting the agency' },
  { key: 'closed',     label: 'Won / Lost', hint: 'Decided' },
];

// ── PURE: where does one opportunity sit, and whose move is next? ──────────────────────────────────
// ctx = { hasProposal:bool, hasPendingSubmit:bool, disposition:'won'|'lost'|'passed'|null, awarded:bool }
export function deriveStage(opp, ctx = {}) {
  if (ctx.disposition === 'won' || ctx.awarded) return 'closed';
  if (ctx.disposition === 'lost' || ctx.disposition === 'passed') return 'closed';
  if (ctx.hasProposal && !ctx.hasPendingSubmit) return 'submitted';
  if (ctx.hasProposal && ctx.hasPendingSubmit) return 'responding';
  if (String(opp.recommendation || '').toLowerCase() === 'bid') return 'reviewing';
  return 'found';
}

// The single clearest line: WHO does the next thing, and WHAT is it. This is the whole point.
export function nextAction(opp, stage, ctx = {}) {
  const lane = inLane(opp.setAside);
  if (stage === 'closed') {
    if (ctx.disposition === 'won' || ctx.awarded) return { who: 'you', text: 'Won — kick off; Jarvis lines up subs' };
    if (ctx.disposition === 'lost') return { who: 'jarvis', text: 'Lost — logged for next time' };
    return { who: 'jarvis', text: 'Passed — off the board' };
  }
  if (stage === 'submitted') return { who: 'jarvis', text: 'Submitted — awaiting the agency' };
  if (stage === 'responding') {
    return ctx.hasPendingSubmit
      ? { who: 'you', text: 'Review, sign & submit the proposal' }
      : { who: 'jarvis', text: 'Drafting your response' };
  }
  if (stage === 'reviewing') {
    if (!lane) return { who: 'jarvis', text: `Not your lane (${shortSetAside(opp.setAside)}) — subcontract only` };
    return { who: 'you', text: "Say “pursue” → Jarvis drafts the response" };
  }
  // found
  if (!lane) return { who: 'jarvis', text: `Out of lane (${shortSetAside(opp.setAside)}) — tracking only` };
  return { who: 'jarvis', text: 'Tracking — Jarvis flags it if it heats up' };
}

// ── PURE: assemble the whole board from live data ─────────────────────────────────────────────────
// opportunities: [{noticeId,title,score,recommendation,setAside,agency,place,placeState,deadline,url,proposalFile}]
// approvals:     [{pod,action,noticeId,file,rationale}]   awards: [{...}]   dispositions: { [noticeId]: 'won'|'lost'|'passed' }
export function buildBoard({ opportunities = [], approvals = [], awards = [], dispositions = {} } = {}) {
  const pendingSubmitByNotice = new Set();
  const pendingSubmitByFile = new Set();
  for (const a of approvals) {
    if (a.pod === 'gov' && /submit/i.test(a.action || '')) {
      if (a.noticeId) pendingSubmitByNotice.add(a.noticeId);
      if (a.file) pendingSubmitByFile.add(a.file);
    }
  }
  const awardedNotices = new Set((awards || []).filter((w) => !/EXAMPLE/i.test(w.id || '')).map((w) => w.noticeId).filter(Boolean));

  const cards = [];
  for (const o of opportunities) {
    const hasProposal = !!o.proposalFile;
    const hasPendingSubmit = pendingSubmitByNotice.has(o.noticeId) || (o.proposalFile && pendingSubmitByFile.has(o.proposalFile));
    const disposition = dispositions[o.noticeId] || null;
    const awarded = awardedNotices.has(o.noticeId);
    const ctx = { hasProposal, hasPendingSubmit, disposition, awarded };
    const stage = deriveStage(o, ctx);
    const lane = inLane(o.setAside);
    const { trade, naics } = inferTrade(o.title);
    cards.push({
      noticeId: o.noticeId,
      title: o.title || 'Untitled solicitation',
      agency: shortAgency(o.agency),
      place: [o.place, o.placeState].filter(Boolean).join(', '),
      trade, naics,
      setAside: shortSetAside(o.setAside),
      inLane: lane,
      deadline: o.deadline || '',
      score: Number(o.score) || 0,
      fit: fitScore(o.score),
      stage,
      next: nextAction(o, stage, ctx),
      url: o.url || '',
    });
  }

  // sort within a column: your-move first, then fit, then raw score
  cards.sort((a, b) => (a.next.who === b.next.who ? 0 : a.next.who === 'you' ? -1 : 1) || b.fit - a.fit || b.score - a.score);

  const columns = COLUMNS.map((c) => ({ ...c, cards: cards.filter((card) => card.stage === c.key) }));

  // THE one line that matters: your single highest-leverage gov move right now.
  const order = { responding: 0, reviewing: 1, found: 2, submitted: 3, closed: 4 };
  const yours = cards.filter((c) => c.next.who === 'you' && c.inLane)
    .sort((a, b) => (order[a.stage] - order[b.stage]) || b.fit - a.fit || b.score - a.score);
  const yourNext = yours[0] || null;

  return {
    columns,
    counts: Object.fromEntries(columns.map((c) => [c.key, c.cards.length])),
    total: cards.length,
    yourNextAction: yourNext && { noticeId: yourNext.noticeId, title: yourNext.title, text: yourNext.next.text, stage: yourNext.stage, deadline: yourNext.deadline, url: yourNext.url, fit: yourNext.fit },
  };
}
