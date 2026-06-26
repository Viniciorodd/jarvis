// businesses.mjs — the registry of every business + how each summarizes to "where it stands · whose
// move is next · (optionally) a board". The Businesses hub renders from here, so ADDING A BUSINESS =
// add ONE entry to BUSINESSES below. If it has data, point `source` at a summarizer; if not, it shows
// as "not wired yet — give Jarvis the files". Pure logic (eval-pinned); the server feeds it raw data.

const you = (text) => ({ who: 'you', text });
const jarvis = (text) => ({ who: 'jarvis', text });

// The registry. icon = Tabler name. `source` selects the summarizer; `board`: 'gov' opens the dedicated
// Gov board, 'generic' renders a board from the summarizer's {stages,cards}, null = status only.
export const BUSINESSES = [
  { id: 'gov',        name: 'Gov contracting', icon: 'building-bank', source: 'gov',         board: 'gov' },
  { id: 'fiverr',     name: 'Fiverr Studio',   icon: 'palette',       source: 'fiverr',      board: 'generic' },
  { id: 'web',        name: 'Web Studio',      icon: 'world',         source: 'web',         board: 'generic' },
  { id: 'realestate', name: 'Real estate',     icon: 'home',          source: 'realestate',  board: 'generic' },
  { id: 'finance',    name: 'Finance',         icon: 'cash',          source: 'finance',     board: null },
  { id: 'music',      name: 'Music',           icon: 'music',         source: 'music',       board: 'generic' },
  { id: 'zerotick',   name: 'ZeroTick',        icon: 'chart-line',    source: 'placeholder', tagline: 'SaaS', board: null },
  { id: 'lifeline',   name: 'Lifeline',        icon: 'heartbeat',     source: 'placeholder', board: null },
];

// PURE per-source summarizers: (raw, biz) => { status, metric, next:{who,text}, setup?, board?, empty? }
const SUMMARIZERS = {
  gov(b) {
    if (!b || !b.counts) return { status: 'Scouting…', next: jarvis('Scanning SAM.gov for new work') };
    const c = b.counts;
    const next = b.yourNextAction ? you(`${b.yourNextAction.text} — ${b.yourNextAction.title}`) : jarvis('Tracking the pipeline');
    return { status: `${b.total} tracked · ${c.reviewing} to review · ${c.responding} to sign`, metric: b.total + ' open', next };
  },
  realestate(p) {
    p = p || {};
    const isTemplate = (u) => /add your first|example|placeholder|^tbd$|\[.*\]/i.test((u.address || '') + (u.tenant || ''));
    const units = (p.units || []).filter((u) => !isTemplate(u)), rentals = (p.rentals || []).filter((u) => !isTemplate(u)), flips = (p.flips || []).filter((u) => !isTemplate(u));
    const hapPending = units.find((u) => /pend|late|due|miss/i.test(u.hap_status || ''));
    const status = `${units.length} units · ${rentals.length} rentals${flips.length ? ' · ' + flips.length + ' flips' : ''}`;
    const next = hapPending ? you(`Chase HAP — ${hapPending.address}`) : jarvis('Tracking rent + HAP');
    const stageOf = (u) => /pend|late|due|miss/i.test(u.hap_status || '') ? 'HAP pending' : (/vacan/i.test((u.tenant || '') + (u.notes || '')) ? 'Vacant' : 'Occupied');
    const cards = units.map((u) => ({ title: u.address || 'Unit', stage: stageOf(u), who: stageOf(u) === 'HAP pending' ? 'you' : 'jarvis', next: u.hap_status || (u.rent ? '$' + u.rent + '/mo' : ''), meta: u.type || '' }))
      .concat(flips.map((f) => ({ title: f.address || 'Flip', stage: 'Flips', who: 'you', next: f.status || 'in progress', meta: '' })));
    return { status, metric: units.length + ' units', next, board: { stages: ['Occupied', 'Vacant', 'HAP pending', 'Flips'], cards } };
  },
  web(ws) {
    const ps = (ws && ws.projects) || [];
    const STAGES = ['Scoping', 'Building', 'Review', 'Live', 'Paid'];
    if (!ps.length) return { status: 'No active sites', next: you('Log your first client site'), board: { stages: STAGES, cards: [] }, empty: 'No sites yet — tell Jarvis “new web project for <client>”.' };
    const open = ps.filter((p) => p.status !== 'paid').length;
    const STAGE = { scoping: 'Scoping', building: 'Building', review: 'Review', deployed: 'Live', invoiced: 'Live', paid: 'Paid' };
    const cards = ps.map((p) => ({ title: p.client || 'Client', stage: STAGE[p.status] || 'Scoping', who: ['review', 'invoiced'].indexOf(p.status) >= 0 ? 'you' : 'jarvis', next: p.type || p.status || '', meta: p.price ? '$' + p.price : '' }));
    const yours = ps.find((p) => ['review', 'invoiced'].indexOf(p.status) >= 0);
    return { status: `${ps.length} project${ps.length > 1 ? 's' : ''} · ${open} active`, metric: open + ' active', next: yours ? you(`Send the ${yours.client} site for sign-off`) : jarvis('Building the next site'), board: { stages: STAGES, cards } };
  },
  fiverr(o) {
    const seen = (o && o.seen) || [];
    return { status: `Studio ready · ${seen.length} orders`, metric: seen.length + ' orders', next: seen.length ? jarvis('Drafting the latest order') : you('Publish your gigs to get orders'),
      board: { stages: ['New order', 'Drafting', 'Your QC', 'Delivered'], cards: [] }, empty: 'No orders yet. Open the Studio to make samples + publish your gigs.' };
  },
  finance(m) {
    if (!m || m.error) return { status: 'Not connected', next: you('Connect Stripe to track money') };
    const n = (x) => '$' + (Math.round((Number(x) || 0) * 100) / 100).toLocaleString();
    return { status: `${n(m.weekCollected)} this week · ${n(m.available)} available`, metric: n(m.weekCollected), next: jarvis('Watching for payments + invoices') };
  },
  music(m) {
    m = m || {}; const tracks = (m.tracks || []), releases = (m.releases || []);
    if (!tracks.length && !(m.identity && m.identity.name)) return { status: 'Not started', next: you('Set up your artist identity'), setup: true };
    return { status: `${(m.identity && m.identity.name) || 'Artist'} · ${tracks.length} tracks · ${releases.length} released`, metric: tracks.length + ' tracks',
      next: releases.length ? jarvis('Promoting releases') : you('Approve a track to release'),
      board: { stages: ['Identity', 'Tracks', 'Released'], cards: tracks.map((t) => ({ title: t.title || 'Track', stage: t.released ? 'Released' : 'Tracks', who: 'you', next: t.status || '', meta: '' })) } };
  },
  placeholder(_, biz) {
    return { status: 'Not wired yet', next: you(`Give Jarvis the files + info to set up ${biz.name}`), setup: true };
  },
};

// Summarize one business given the bundle of raw data the server gathered (keyed by business id).
export function summarize(biz, rawBySource = {}) {
  const fn = SUMMARIZERS[biz.source] || SUMMARIZERS.placeholder;
  const raw = rawBySource[biz.id] != null ? rawBySource[biz.id] : rawBySource[biz.source];
  const s = fn(raw, biz) || {};
  return {
    id: biz.id, name: biz.name, icon: biz.icon, tagline: biz.tagline || '',
    boardKind: biz.board, setup: !!s.setup, status: s.status || '', metric: s.metric || '',
    next: s.next || jarvis('—'), board: s.board || null, empty: s.empty || '',
  };
}

// The hub list — one summary row per registered business (boards stripped; fetched on open).
export function buildHub(rawBySource = {}) {
  return BUSINESSES.map((b) => {
    const s = summarize(b, rawBySource);
    return { id: s.id, name: s.name, icon: s.icon, tagline: s.tagline, status: s.status, next: s.next, setup: s.setup,
      hasBoard: b.board === 'gov' || !!s.board, boardKind: b.board };
  });
}

// Count of businesses where the next move is the operator's (for the hub header).
export function needsYouCount(hub) { return hub.filter((b) => b.next && b.next.who === 'you').length; }
