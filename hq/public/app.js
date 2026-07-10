// JARVIS HQ frontend. Live mode polls /api/state; ?demo=1 runs a local simulation
// (same data shape) so the dashboard is explorable before any workflow exists.
'use strict';

const RANKS = [
  { at: 0, name: 'Garage' },
  { at: 1000, name: 'Workshop' },
  { at: 5000, name: 'Office' },
  { at: 10000, name: 'Studio' },
  { at: 50000, name: 'Penthouse' },
  { at: 100000, name: 'Tower' },
  { at: 1000000, name: 'Empire' },
];

const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeOf = (t) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
};

let prevEarned = null;
let shownEarned = 0;
let counterTimer = null;

// ── render ────────────────────────────────────────────────────────────────
function render(s) {
  const rank = [...RANKS].reverse().find((r) => s.earned >= r.at);
  const next = RANKS.find((r) => r.at > s.earned);

  $('rank-chip').textContent = rank.name.toUpperCase();
  $('streak').textContent = `🔥 EOD streak · ${s.streak || 0}`;
  animateCounter(s.earned);
  $('level').textContent = `LV ${Math.floor(s.xp / 100) + 1}`;
  $('xp-bar').style.width = (s.xp % 100) + '%';
  $('next-label').textContent = `Next rank · ${next ? next.name : '—'}`;
  $('next-amt').textContent = next ? fmt(next.at - s.earned) + ' to go' : 'MAX';
  $('rank-bar').style.width = (next ? Math.min(100, (s.earned / next.at) * 100) : 100) + '%';

  // milestone road
  $('road').innerHTML = RANKS.map((r, i) => {
    const reached = s.earned >= r.at;
    const seg = i > 0 ? `<div class="seg" style="background:${reached ? 'var(--gold)' : 'var(--line)'}"></div>` : '';
    const border = next && next.at === r.at ? 'var(--gold)' : 'var(--line)';
    return seg + `<div class="stop">
      <div class="dot" style="background:${reached ? 'var(--gold)' : 'transparent'};border-color:${border}"></div>
      <div class="amt mono ${reached ? 'gold' : 'dim'}">${fmt(r.at)}</div>
      <div class="nm ${reached ? '' : 'dim'}">${esc(r.name)}</div>
    </div>`;
  }).join('');

  // approvals
  $('needs-title').textContent = `NEEDS YOU (${s.approvals.length})`;
  $('approvals').innerHTML = s.approvals.length === 0
    ? `<div class="panel empty dim">Queue clear. The floor keeps working — check back after the next scout cycle.</div>`
    : s.approvals.map((a) => `<div class="panel approval" data-id="${a.id}">
        <div class="top">
          <div>
            <div class="pod mono dim">${esc(a.pod)}</div>
            <div class="ttl">${esc(a.title)}</div>
            <div class="det dim">${esc(a.detail)}</div>
          </div>
          ${a.amount > 0 ? `<div class="amt mono gold">+${fmt(a.amount)}</div>` : ''}
        </div>
        <div class="acts">
          <button class="btn gold-btn" data-act="approve">✓ ${esc(a.verb || 'Approve')}</button>
          <button class="btn ghost-btn" data-act="pass">✕ Pass</button>
        </div>
      </div>`).join('');

  // floor
  const byPod = {};
  for (const [name, op] of Object.entries(s.operators || {})) {
    (byPod[op.pod] = byPod[op.pod] || []).push({ name, ...op });
  }
  $('floor').innerHTML = s.rooms.map((room) => {
    if (s.earned < room.unlockAt) {
      return `<div class="panel room locked">
        <div class="head dim">🔒 ${esc(room.name)}</div>
        <div class="flavor dim">${esc(room.flavor || '')}</div>
        <div class="unlock mono gold">Unlocks at ${fmt(room.unlockAt)}</div>
      </div>`;
    }
    const ops = (byPod[room.id] || []).sort((a, b) => b.t - a.t);
    const body = ops.length === 0
      ? `<div class="flavor dim">No operators on the floor yet — wire a status ping (see n8n/README).</div>`
      : `<div class="ops">${ops.map((op) => `
          <div class="op">
            <span class="led-wrap">${op.state === 'need' ? '<span class="ring"></span>' : ''}<span class="led led-${esc(op.state)}"></span></span>
            <div>
              <div class="nm mono dim">${esc(op.name)} <span class="dim">· ${ago(op.t)}</span></div>
              <div class="txt ${op.state === 'need' ? 'need' : ''} ${op.state === 'error' ? 'error' : ''}">${esc(op.text)}${op.state === 'work' ? '<span class="dotty"><span></span><span></span><span></span></span>' : ''}</div>
            </div>
          </div>`).join('')}</div>`;
    return `<div class="panel2 room">
      <div class="head"><span>${esc(room.icon)}</span> ${esc(room.name)}</div>
      ${body}
    </div>`;
  }).join('');

  // quests
  $('quests').innerHTML = (s.quests && s.quests.length ? s.quests : [])
    .map((q) => `<div class="quest">
      <div class="row"><span>${esc(q.q)}</span><span class="mono dim">${q.done}/${q.of}</span></div>
      <div class="barbg"><div class="fill goldfill" style="width:${Math.min(100, (q.done / q.of) * 100)}%"></div></div>
    </div>`).join('') || `<div class="dim small">No quests set. The Sunday strategy agent posts three each week.</div>`;

  // feed
  $('feed').innerHTML = (s.feed || []).slice(0, 14).map((e) => `
    <div class="line"><span class="t">${timeOf(e.t)}</span><span class="${String(e.s).startsWith('✓') ? 'money' : ''}">${esc(e.s)}</span></div>
  `).join('') || `<div class="dim small">Quiet so far. Events appear here as agents report in.</div>`;

  $('foot').textContent = DEMO
    ? 'Demo mode · simulated data · remove ?demo=1 for the live floor'
    : 'Live · fed by n8n status pings → events log on your NAS';
  $('mode-tag').textContent = DEMO ? '· DEMO' : '';

  // rank-up detection
  if (prevEarned !== null && prevEarned < s.earned) {
    const crossed = RANKS.find((r) => prevEarned < r.at && s.earned >= r.at);
    if (crossed) showRankUp(crossed);
  }
  prevEarned = s.earned;
}

function animateCounter(target) {
  clearInterval(counterTimer);
  if (shownEarned === target) { $('earned').textContent = fmt(target); return; }
  const step = Math.max(1, Math.ceil(Math.abs(target - shownEarned) / 14));
  counterTimer = setInterval(() => {
    shownEarned = shownEarned < target
      ? Math.min(target, shownEarned + step)
      : Math.max(target, shownEarned - step);
    $('earned').textContent = fmt(shownEarned);
    if (shownEarned === target) clearInterval(counterTimer);
  }, 40);
}

function toast(txt) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = txt;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 1900);
}

function showRankUp(rank) {
  $('rankup-name').textContent = rank.name.toUpperCase();
  $('rankup-text').textContent = `${fmt(rank.at)} banked. A new wing of HQ is open.`;
  $('stars').innerHTML = Array.from({ length: 9 }, (_, i) =>
    `<span class="star" style="left:${8 + i * 11}%;top:${(i % 3) * 26 + 8}%;animation-delay:${i * 0.18}s">✦</span>`).join('');
  $('rankup').classList.remove('hidden');
}
$('rankup-close').addEventListener('click', () => $('rankup').classList.add('hidden'));

// ── adapters ──────────────────────────────────────────────────────────────
let adapter;

const liveAdapter = {
  async refresh() {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error('state fetch failed');
    render(await r.json());
  },
  async decide(id, act, card) {
    const a = readApproval(card);
    const r = await fetch(`/api/approval/${id}/${act}`, { method: 'POST' });
    if (r.ok && act === 'approve') toast(`${a.amount ? '+' + fmt(a.amount) + ' · ' : ''}APPROVED`);
    await this.refresh();
  },
  start() {
    this.refresh().catch(() => {});
    setInterval(() => this.refresh().catch(() => {}), 4000);
  },
};

function readApproval(card) {
  const amtEl = card.querySelector('.amt');
  return { amount: amtEl ? Number(amtEl.textContent.replace(/[^0-9.]/g, '')) : 0 };
}

// Demo: a self-contained simulation matching the original mockup.
const demoAdapter = (() => {
  const FEED_POOL = [
    'SAM-SCOUT · 4 new set-asides matched (561720)',
    'MAILROOM-01 · reply drafted → landlord thread',
    'PIXEL-02 · thumbnail option C rendered',
    'BID-ANALYST · sub shortlist: 6 electrical firms (PA)',
    'WHISPER · voice memo filed → Notion / Lessons',
    'QC-DESK · revision request parsed · #1042',
    'SAM-SCOUT · sources-sought: grounds maint., Carlisle',
    'EOD-BOT · 41 tasks logged today',
  ];
  let i = 0;
  const s = {
    earned: 952, xp: 265, streak: 4,
    quests: [
      { q: 'Ship 5 Fiverr orders', done: 3, of: 5 },
      { q: 'Collect 3 sub quotes', done: 1, of: 3 },
      { q: 'Answer 1 sources-sought', done: 0, of: 1 },
    ],
    operators: {
      'MAILROOM-01': { pod: 'cos', state: 'work', text: 'Triaging 14 new emails', t: Date.now() },
      'EOD-BOT': { pod: 'cos', state: 'idle', text: 'Next report · 6:00 PM', t: Date.now() },
      'PIXEL-02': { pod: 'fiv', state: 'work', text: 'Rendering thumbnail v2 · #1047', t: Date.now() },
      'QC-DESK': { pod: 'fiv', state: 'need', text: '2 deliveries await your review', t: Date.now() },
      'SAM-SCOUT': { pod: 'gov', state: 'work', text: 'Scanned 212 notices → 4 leads', t: Date.now() },
      'BID-ANALYST': { pod: 'gov', state: 'work', text: 'Bid memo · janitorial · $48k', t: Date.now() },
    },
    approvals: [
      { id: 'd1', pod: 'Fiverr Studio', title: 'Deliver thumbnail v2', detail: 'Order #1047 · @BG_Media', amount: 35, xp: 25, verb: 'Approve & deliver' },
      { id: 'd2', pod: 'Fiverr Studio', title: 'Deliver 3 blog graphics', detail: 'Order #1051 · @k.marketing', amount: 48, xp: 30, verb: 'Approve & deliver' },
      { id: 'd3', pod: 'Gov War Room', title: 'Send RFQ to 3 electrical subs', detail: 'Janitorial $48k · Harrisburg area', amount: 0, xp: 40, verb: 'Approve & send' },
    ],
    feed: [{ t: Date.now(), s: 'HQ online · 3 pods active · 6 operators on the floor' }],
    rooms: [],
  };
  return {
    state: s,
    async refresh() { render(s); },
    async decide(id, act) {
      const idx = s.approvals.findIndex((a) => a.id === id);
      if (idx === -1) return;
      const a = s.approvals.splice(idx, 1)[0];
      if (act === 'approve') {
        s.earned += a.amount; s.xp += a.xp;
        toast(`${a.amount ? '+' + fmt(a.amount) + ' · ' : ''}+${a.xp} XP`);
        s.feed.unshift({ t: Date.now(), s: `✓ ${a.title} — ${a.amount ? fmt(a.amount) + ' banked' : 'executed'}` });
      } else {
        s.feed.unshift({ t: Date.now(), s: `— Passed: ${a.title}` });
      }
      if (!s.approvals.some((x) => x.pod === 'Fiverr Studio')) {
        s.operators['QC-DESK'] = { pod: 'fiv', state: 'idle', text: 'Queue clear · standing by', t: Date.now() };
      }
      render(s);
    },
    async start() {
      const r = await fetch('/api/state', { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      s.rooms = r && r.rooms && r.rooms.length ? r.rooms : [
        { id: 'cos', name: 'Chief of Staff', icon: '📬', unlockAt: 0 },
        { id: 'fiv', name: 'Fiverr Studio', icon: '🎨', unlockAt: 0 },
        { id: 'gov', name: 'Gov War Room', icon: '🏛️', unlockAt: 0 },
        { id: 'etsy', name: 'Etsy & POD Workshop', icon: '👕', unlockAt: 1000, flavor: 'Trend scout · original designs' },
        { id: 'lab', name: 'Content Lab', icon: '🎬', unlockAt: 5000, flavor: 'Blog · affiliate · short-form' },
        { id: 'music', name: 'Music Studio', icon: '🎵', unlockAt: 10000, flavor: 'Beats · lofi · licensing' },
        { id: 'kids', name: 'Kids Animation Bay', icon: '🧸', unlockAt: 10000, flavor: 'One show · human-reviewed' },
        { id: 'trade', name: 'Trading Watchtower', icon: '📈', unlockAt: 50000, flavor: 'Monitor-only. Always.' },
        { id: 'myst', name: '???', icon: '👑', unlockAt: 1000000, flavor: 'Empire rank' },
      ];
      render(s);
      setInterval(() => {
        i = (i + 1) % FEED_POOL.length;
        s.feed.unshift({ t: Date.now(), s: FEED_POOL[i] });
        s.feed = s.feed.slice(0, 14);
        render(s);
      }, 4800);
    },
  };
})();

$('approvals').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.approval');
  adapter.decide(card.dataset.id, btn.dataset.act, card);
});

// ── theme picker (flagship black / white + legacy teal / mono / dark — same as the companion) ────
function applyTheme(name) {
  const ok = ['black', 'white', 'teal', 'mono', 'dark'].includes(name) ? name : 'black';
  document.documentElement.dataset.theme = ok;
  document.querySelectorAll('#theme-pick .sw').forEach((b) => b.classList.toggle('on', b.dataset.theme === ok));
  try { localStorage.setItem('jarvis-theme', ok); } catch { /* private mode */ }
}
document.querySelectorAll('#theme-pick .sw').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
applyTheme(document.documentElement.dataset.theme || 'black');

adapter = DEMO ? demoAdapter : liveAdapter;
adapter.start();
