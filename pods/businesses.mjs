// businesses.mjs — the registry of every business + how each summarizes to "where it stands · whose
// move is next · (optionally) a board". The Businesses hub renders from here, so ADDING A BUSINESS =
// add ONE entry to BUSINESSES below. If it has data, point `source` at a summarizer; if not, it shows
// as "not wired yet — give Jarvis the files". Pure logic (eval-pinned); the server feeds it raw data.

const you = (text) => ({ who: 'you', text });
const jarvis = (text) => ({ who: 'jarvis', text });

// The registry. icon = Tabler name. `source` selects the summarizer; `board`: 'gov' opens the dedicated
// Gov board, 'generic' renders a board from the summarizer's {stages,cards}, null = status only.
// `folder` = the business's home folder under the vault's "04 - Projects/" (its Log/CRM/agents live there).
// `crm` = true scaffolds a Contacts (CRM) file (gov subs, real-estate tenants).
export const BUSINESSES = [
  { id: 'gov',        name: 'Gov contracting', icon: 'building-bank', source: 'gov',         board: 'gov',     folder: 'Gov Contracting', crm: true },
  // Operator, 2026-08-07: *"I have no business control for REDOS within Jarvis."* He was right, and this
  // was the file that made it true — pods/redos-ops/ was built and eval-pinned months before anything
  // listed it here, so the hub showed eight businesses and not the one with a live launch running.
  { id: 'redos',      name: 'REDOS',           icon: 'calculator',    source: 'redos',       board: 'generic', folder: 'REDOS' },
  { id: 'fiverr',     name: 'Fiverr Studio',   icon: 'palette',       source: 'fiverr',      board: 'generic', folder: 'Fiverr Studio' },
  { id: 'web',        name: 'Web Studio',      icon: 'world',         source: 'web',         board: 'generic', folder: 'Web Studio' },
  { id: 'realestate', name: 'Real estate',     icon: 'home',          source: 'realestate',  board: 'generic', folder: 'Real Estate', crm: true },
  { id: 'finance',    name: 'Finance',         icon: 'cash',          source: 'finance',     board: null,      folder: 'Finance' },
  { id: 'music',      name: 'Music',           icon: 'music',         source: 'music',       board: 'generic', folder: 'Music' },
  { id: 'zerotick',   name: 'ZeroTick',        icon: 'chart-line',    source: 'placeholder', tagline: 'SaaS',  board: null, folder: 'ZeroTick' },
  { id: 'lifeline',   name: 'Lifeline',        icon: 'heartbeat',     source: 'placeholder', board: null,      folder: 'Lifeline' },
];

// PURE per-source summarizers: (raw, biz) => { status, metric, next:{who,text}, setup?, board?, empty? }
const SUMMARIZERS = {
  /**
   * REDOS. `r` is the /api/redos payload: launch gates, revenue, and the publishing loop's position.
   *
   * 🚨 UNKNOWN IS NEVER ZERO, on the hub row as much as anywhere. `customers.nonFriend === null` means
   * the source could not be read; rendering that as "0 customers" would read as a measured flop rather
   * than a broken connector, and he would make decisions on it. Same discipline the engine enforces.
   *
   * WHOSE MOVE is answered honestly too. The loop posting on its own is Jarvis's move. A post held for
   * figures he has not confirmed is HIS move and nothing else can release it — so that outranks
   * everything else this summarizer could say.
   */
  redos(r) {
    if (!r || r.error) return { setup: true, status: 'not reporting', next: you('Run: node pods/redos-ops/collect.mjs --write') };

    const c = r.customers || {};
    const rev = r.revenue || {};
    const p = r.posts || null;
    const n = (v, word) => (v === null || v === undefined ? 'unknown ' + word : v + ' ' + word);

    const bits = [n(c.nonFriend, 'strangers'), rev.netUsd === null || rev.netUsd === undefined ? 'unknown net' : '$' + Number(rev.netUsd).toFixed(2) + ' net'];
    if (p && p.status) bits.push(`${p.status.published}/${p.status.total} posts sent`);
    if (r.stale) bits.push('⚠ stale');

    // Precedence: his blocked decisions first, then a live batch, then the standing gate.
    let next;
    const held = (p && p.held) || [];
    if (held.length) {
      next = you(`${held.length} post${held.length > 1 ? 's' : ''} held — confirm the figures, nothing else can`);
    } else if (p && p.pending && !p.pending.decision && p.pending.closesAt) {
      next = jarvis(`Batch ${p.pending.batchId} posting unless you stop it`);
    } else if (r.stale) {
      next = you('Snapshot is stale — re-run collect.mjs');
    } else {
      next = jarvis(r.gateLine || 'Tracking the launch');
    }

    // The board reads as the launch itself: three gates in order, plus what is queued to go out.
    const gateCards = (r.gates || []).map((g) => ({
      title: g.label,
      stage: g.met === true ? 'Met' : g.met === null ? 'Unknown' : 'Not yet',
      who: g.met === null ? 'you' : 'jarvis',
      next: (g.value === null ? 'unknown' : g.value) + ' / ' + g.target + ' ' + g.unit,
      meta: g.why || '',
    }));
    const postCards = ((p && p.next) || []).map((x) => ({
      title: '#' + x.n + ' ' + x.title, stage: 'Queued', who: 'jarvis',
      next: (x.platforms || []).join(' · '), meta: '',
    })).concat(held.map((h) => ({
      title: '#' + h.n + ' ' + h.title, stage: 'Held', who: 'you',
      next: 'confirm: ' + (h.pending || []).join(' '), meta: '',
    })));

    return {
      status: bits.join(' · '),
      metric: c.nonFriend === null ? 'unknown' : c.nonFriend + ' strangers',
      next,
      board: { stages: ['Met', 'Not yet', 'Unknown', 'Queued', 'Held'], cards: gateCards.concat(postCards) },
      empty: 'Nothing tracked yet — run collect.mjs to take the first snapshot.',
    };
  },
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
