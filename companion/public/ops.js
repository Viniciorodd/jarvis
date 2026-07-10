// JARVIS — Operations cockpit. A BUSINESS switcher (Gov / Fiverr / SaaS) sits above the tabs; each business
// shows its own operations. Gov: Leads / Opportunities (→ full detail + real RFP docs from SAM) / Proposals
// (draft + RFP & files) / CRM. Fiverr & SaaS: Leads + Activity. Reads /api/operations + /api/pod-events.
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ops = el('ops'), body = el('opsBody');
  let data = { leads: [], opportunities: [], proposals: [], crm: [] };
  let oppByNotice = {}, leadById = {};
  let loading = false;
  let agentChat = [];        // conversation with the bid analyst, scoped to the open opportunity
  let curDetail = {};        // { noticeId, file } of the opportunity detail currently open

  // The businesses. `pods` = which control-plane pods feed this business's Leads (gov also absorbs the
  // central exec/finance/system approvals so money gates stay visible). `tabs` = the views it shows.
  const BUSINESSES = [
    { id: 'gov', label: '🏛 Gov Contracting', pods: ['gov', 'exec', 'chief-of-staff', 'system'], tabs: ['leads', 'opps', 'props', 'crm'] },
    { id: 'realestate', label: '🏢 Real Estate', pods: ['real-estate'], tabs: ['analyzer', 'units', 'flips', 'builds', 'rentals'] },
    { id: 'trading', label: '📈 Trading', pods: ['trading'], tabs: ['watchlist', 'positions', 'predictions', 'paper'] },
    { id: 'fiverr', label: '🎨 Fiverr Studio', pods: ['fiverr'], tabs: ['studio', 'activity', 'leads'] },
    { id: 'saas', label: '🖥 SaaS / Recon', pods: ['saas'], tabs: ['activity', 'leads'] },
    { id: 'webstudio', label: '🌐 Web Studio', pods: ['webstudio'], tabs: ['projects', 'sites', 'clients', 'pipeline'] },
    { id: 'agents', label: '🤖 Agents', pods: ['chief-of-staff', 'exec'], tabs: ['assistant', 'busops', 'queue'] },
    { id: 'music', label: '🎵 Music', pods: ['music'], tabs: ['identity', 'tracks', 'releases'] },
  ];
  const TAB_LABELS = { studio: '🎨 Studio', leads: '⚑ Leads', opps: '◎ Opportunities', props: '▤ Proposals', crm: '⚇ CRM', activity: '⟁ Activity', analyzer: '📊 Deal Analyzer', units: '🏠 Units', flips: '🔨 Flips', builds: '🏗 New Builds', rentals: '🔑 Rentals', watchlist: '📊 Watchlist', positions: '📋 Positions', predictions: '🔮 Predictions', paper: '🧪 Paper P&L', projects: '🔨 Projects', sites: '🌐 Live Sites', clients: '👥 Clients', pipeline: '💰 Pipeline', assistant: '🧠 Assistant', busops: '⚙ Business Ops', queue: '✋ Review queue', identity: '🪪 Identity', tracks: '🎙 Studio', releases: '🚀 Releases' };
  let biz = 'gov', tab = 'leads';
  const curBiz = () => BUSINESSES.find((b) => b.id === biz) || BUSINESSES[0];

  const recClass = (r) => (/^bid$/i.test(r) ? 'go' : /watch/i.test(r) ? 'mid' : 'no');
  const scoreClass = (n) => (n >= 75 ? 'go' : n >= 50 ? 'mid' : 'no');
  const daysUntil = (d) => { if (!d) return null; const t = new Date(d); if (isNaN(t)) return null; return Math.ceil((t - Date.now()) / 864e5); };
  const dueChip = (d) => { const du = daysUntil(d); if (du == null) return ''; const c = du <= 7 ? 'var(--warn)' : 'var(--dim)'; return `<span style="color:${c}">⏳ ${du < 0 ? 'closed' : 'due in ' + du + 'd'}</span>`; };
  const when = (t) => { if (!t) return '—'; const d = new Date(t); return isNaN(d) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const leadsFor = (b) => (data.leads || []).filter((l) => b.pods.includes((l.pod || 'system')));

  async function load() {
    if (loading) return; loading = true;
    body.innerHTML = '<div class="ops-empty">pulling live data from the floor…</div>';
    try {
      const r = await fetch('/api/operations');
      data = await r.json();
      if (data.error) console.warn('operations:', data.error);
    } catch (e) { body.innerHTML = `<div class="ops-empty">couldn't reach the control-plane (${esc(e.message)})</div>`; loading = false; return; }
    oppByNotice = {}; for (const o of (data.opportunities || [])) if (o.noticeId) oppByNotice[o.noticeId] = o;
    leadById = {}; for (const l of (data.leads || [])) leadById[l.id] = l;
    renderBizBar(); renderTabs(); render();
    loading = false;
  }

  function renderBizBar() {
    el('opsBiz').innerHTML = BUSINESSES.map((b) => {
      const n = leadsFor(b).length;
      return `<button class="ops-bizbtn${b.id === biz ? ' on' : ''}" data-biz="${b.id}">${esc(b.label)}${n ? `<span class="ops-c">${n}</span>` : ''}</button>`;
    }).join('');
  }
  function tabCount(t) {
    if (t === 'leads') return leadsFor(curBiz()).length;
    if (t === 'opps') return (data.opportunities || []).length;
    if (t === 'props') return (data.proposals || []).length;
    if (t === 'crm') return (data.crm || []).length;
    return 0;
  }
  function renderTabs() {
    el('opsTabs').innerHTML = curBiz().tabs.map((t) => {
      const n = tabCount(t);
      return `<button class="ops-tab${t === tab ? ' on' : ''}" data-tab="${t}">${TAB_LABELS[t] || t}${n ? `<span class="ops-c">${n}</span>` : ''}</button>`;
    }).join('');
  }

  function render() {
    if (tab === 'studio') return renderStudio();
    if (tab === 'leads') return renderLeads();
    if (tab === 'opps') return renderOpps();
    if (tab === 'props') return renderProps();
    if (tab === 'crm') return renderCrm();
    if (tab === 'activity') return renderActivity(curBiz().pods[0]);
    if (tab === 'analyzer') return renderAnalyzer();
    if (tab === 'units') return renderUnits();
    if (tab === 'flips') return renderFlips();
    if (tab === 'builds') return renderBuilds();
    if (tab === 'rentals') return renderRentals();
    if (tab === 'watchlist') return renderWatchlist();
    if (tab === 'positions') return renderPositions();
    if (tab === 'predictions') return renderPredictions();
    if (tab === 'paper') return renderPaper();
    if (tab === 'projects') return renderWSProjects();
    if (tab === 'sites') return renderWSSites();
    if (tab === 'clients') return renderWSClients();
    if (tab === 'pipeline') return renderWSPipeline();
    if (tab === 'assistant') return renderAgent('assistant');
    if (tab === 'busops') return renderAgent('ops');
    if (tab === 'queue') return renderAgentQueue();
    if (tab === 'identity') return renderMusicIdentity();
    if (tab === 'tracks') return renderMusicStudio();
    if (tab === 'releases') return renderMusicReleases();
  }

  // ── MUSIC (artist identity + AI songwriting + GATED releases) ──
  let musicData = null;
  async function loadMusic() {
    body.innerHTML = '<div class="ops-empty">loading studio…</div>';
    try { musicData = await fetch('/api/music').then((r) => r.json()); render(); }
    catch (e) { body.innerHTML = `<div class="ops-empty">music offline — ${esc(e.message)}</div>`; }
  }
  function renderMusicIdentity() {
    if (!musicData) { loadMusic(); return; }
    const id = musicData.identity || {};
    const f = (k, label, ph) => `<input class="re-f ms-f" data-ms="${k}" placeholder="${esc(ph)}" value="${esc(id[k] || '')}" style="grid-column:1/-1">`;
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>🪪 Artist Identity</b> — define the act. You set the sound; nothing publishes without you.</div>
      <div class="re-add-form" style="display:block">
        <div class="re-add-grid" style="grid-template-columns:1fr">
          ${f('name', 'Artist name', 'Artist / project name')}
          ${f('genre', 'Genre', 'Genre(s) — e.g. dark synthwave, trap soul')}
          ${f('persona', 'Persona', 'Persona / vibe — who is this artist?')}
          ${f('influences', 'Influences', 'Influences / reference artists')}
          <textarea class="re-f ms-f" data-ms="params" placeholder="Sound parameters — tempo, mood, vocal style, themes (set these when ready)" style="min-height:70px">${esc(id.params || '')}</textarea>
        </div>
        <div class="re-add-acts"><button class="re-save" data-ms-save="1">Save identity</button><span class="re-add-msg" id="msIdMsg"></span></div>
      </div>`;
  }
  function renderMusicStudio() {
    if (!musicData) { loadMusic(); return; }
    const tracks = musicData.tracks || [];
    const keyNote = musicData.hasProviderKey ? '' : ' <span style="color:var(--warn)">· audio pending a provider key (MUSIC_API_KEY)</span>';
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>🎙 Studio</b> — brief a track; Jarvis writes the concept + full lyrics now.${keyNote}</div>
      <div class="re-add-form" style="display:block">
        <textarea class="re-f" id="msBrief" placeholder="Brief: what's this song about? mood, story, hook…" style="min-height:70px;width:100%"></textarea>
        <div class="re-add-acts"><button class="re-save" data-ms-generate="1">Write it →</button><span class="re-add-msg" id="msGenMsg"></span></div>
      </div>
      ${tracks.length ? tracks.map((t) => `<div class="re-card">
        <div class="re-card-head"><div class="re-card-addr">${esc(t.title)}</div><div class="re-card-type">${esc(t.audioStatus || 'concept')}</div></div>
        ${t.style ? `<div class="re-row">Style <span>${esc(t.style)}</span></div>` : ''}
        ${t.concept ? `<div class="re-row" style="color:var(--dim)">${esc(t.concept)}</div>` : ''}
        ${t.lyrics ? `<pre class="ag-text" style="margin-top:8px;max-height:160px;overflow:auto">${esc(t.lyrics)}</pre>` : ''}
        <div style="margin-top:10px"><button class="btn sm go" data-ms-release="${esc(t.id)}">Queue release →</button></div>
      </div>`).join('') : '<div class="ops-empty" style="margin-top:10px">No tracks yet — write your first above.</div>'}`;
  }
  function renderMusicReleases() {
    if (!musicData) { loadMusic(); return; }
    const rels = musicData.releases || [];
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>🚀 Releases</b> — every release is <b>gated</b>. Approving records intent; it never posts to Spotify / Apple / TikTok on its own (needs a distributor + your final go).</div>` +
      (rels.length ? rels.map((r) => `<div class="re-card">
        <div class="re-card-head"><div class="re-card-addr">${esc(r.title)}</div><div class="re-card-type"><span class="re-hap-${r.status === 'approved' ? 'ok' : 'pend'}">${esc(r.status)}</span></div></div>
        <div class="re-row">Platforms <span>${esc((r.platforms || []).join(', '))}</span></div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn sm go" data-ms-rel-approve="${esc(r.id)}">Approve</button>
          <button class="btn sm" data-ms-rel-discard="${esc(r.id)}">Discard</button>
        </div></div>`).join('') : '<div class="ops-empty">Release queue empty — queue a track from the Studio.</div>');
  }

  // ── AGENTS (executive assistant + business-ops autopilot, draft + gated) ──
  const AGENT_TASKS = {
    assistant: [
      { task: 'briefing', label: 'Morning briefing', desc: 'Prioritized rundown of your day from todos + urgent + inbox.' },
      { task: 'plan', label: 'Plan my day', desc: 'A realistic time-blocked plan, highest-leverage first.' },
      { task: 'organize', label: 'Organize my tasks', desc: 'Group + prioritize your open todos (suggestions only).' },
    ],
    ops: [
      { task: 'report', label: 'Status report', desc: "What's moving, stuck, and needs your decision." },
      { task: 'qualify', label: 'Qualify a lead', desc: 'Paste an inquiry — get fit score, signals, next step.', input: 'Paste the lead / inquiry…' },
      { task: 'draft-reply', label: 'Draft a reply', desc: 'Paste a message — drafts a reply (saved to the gated queue).', input: 'Paste the message to reply to…' },
    ],
  };
  function renderAgent(agent) {
    const who = agent === 'assistant' ? '🧠 Executive Assistant' : '⚙ Business Ops';
    const tasks = AGENT_TASKS[agent];
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>${who}</b> — runs on your real data. Read + draft only; anything that would send is held in the <b>Review queue</b> for your approval.</div>` +
      tasks.map((t) => `<div class="ag-task">
        <div class="ag-task-head"><div class="ag-task-title">${esc(t.label)}</div>
          <button class="btn sm go" data-agent="${agent}" data-task="${t.task}">Run</button></div>
        <div class="ag-task-desc">${esc(t.desc)}</div>
        ${t.input ? `<textarea class="ag-input" data-agent-input="${agent}:${t.task}" placeholder="${esc(t.input)}"></textarea>` : ''}
        <div class="ag-out" id="agout-${agent}-${t.task}" hidden></div>
      </div>`).join('');
  }
  async function runAgentTask(agent, task) {
    const outEl = el(`agout-${agent}-${task}`);
    const inEl = body.querySelector(`[data-agent-input="${agent}:${task}"]`);
    const input = inEl ? inEl.value.trim() : '';
    outEl.hidden = false; outEl.innerHTML = '<span class="ag-think">thinking…</span>';
    try {
      const r = await fetch('/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent, task, input }) });
      const d = await r.json();
      if (d.error) { outEl.innerHTML = `<span class="ag-err">${esc(d.error)}</span>`; return; }
      const gated = d.gated ? `<div class="ag-gated">✋ ${esc(d.note || 'Saved to the review queue — not sent.')}</div>` : '';
      outEl.innerHTML = `<pre class="ag-text">${esc(d.output || '')}</pre>${gated}`;
    } catch (e) { outEl.innerHTML = `<span class="ag-err">${esc(e.message)}</span>`; }
  }
  async function renderAgentQueue() {
    body.innerHTML = '<div class="ops-empty">loading queue…</div>';
    try {
      const drafts = await fetch('/api/agent/drafts').then((r) => r.json());
      if (!drafts.length) { body.innerHTML = `<div class="ops-explain"><b>✋ Review queue</b><br>Empty — agent drafts that would send anything land here for your approval. Nothing sends on its own.</div>`; return; }
      body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>✋ Review queue</b> — ${drafts.length} draft${drafts.length !== 1 ? 's' : ''} awaiting you. Approving never auto-sends; it clears it for the gated executor.</div>` +
        drafts.map((d) => `<div class="re-card">
          <div class="re-card-head"><div class="re-card-addr">${esc(d.kind || 'draft')} · ${esc(d.agent)}</div>
            <div class="re-card-type"><span class="re-hap-${d.status === 'approved' ? 'ok' : 'pend'}">${esc(d.status)}</span></div></div>
          ${d.input ? `<div class="re-row" style="color:var(--dim)">Re: <span style="color:var(--dim)">${esc(d.input)}</span></div>` : ''}
          <pre class="ag-text" style="margin-top:8px">${esc(d.body || '')}</pre>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn sm go" data-draft-approve="${d.id}">Approve</button>
            <button class="btn sm" data-draft-discard="${d.id}">Discard</button>
          </div>
        </div>`).join('');
    } catch (e) { body.innerHTML = `<div class="ops-empty">queue offline — ${esc(e.message)}</div>`; }
  }

  // ── DEAL ANALYZER (embeds the DealForge app) ────────────────────────────────
  // DealForge runs as its own dependency-free server (default localhost:8096; override with
  // localStorage 'dealforge-url' to point at the NAS). We pass the current theme + embed flag.
  function dealforgeUrl() {
    let base = 'http://localhost:8096';
    try { base = localStorage.getItem('dealforge-url') || base; } catch { /* private mode */ }
    const theme = document.documentElement.dataset.theme === 'arc' ? 'light' : 'dark';
    return `${base.replace(/\/$/, '')}/?embed=1&theme=${theme}`;
  }
  function renderAnalyzer() {
    const url = dealforgeUrl();
    body.innerHTML = `
      <div class="df-embed">
        <div class="df-embed-bar">
          <span class="df-embed-title">📊 DealForge — flip · BRRRR · rental · wholesale</span>
          <a class="btn ghost" href="${esc(url)}" target="_blank" rel="noreferrer" style="font-size:11px; padding:5px 11px;">open in browser ↗</a>
        </div>
        <iframe class="df-frame" src="${esc(url)}" title="DealForge" referrerpolicy="no-referrer"
          style="width:100%; height:calc(100vh - 190px); min-height:520px; border:0; border-radius:14px; background:var(--panel, #141417);"
          onerror="this.parentElement.querySelector('.df-fallback')?.removeAttribute('hidden')"></iframe>
        <div class="df-fallback ops-empty" hidden>DealForge isn't reachable at ${esc(url)} — start it with <code>node dealforge/server.js</code>.</div>
      </div>`;
  }

  // ── REAL ESTATE ─────────────────────────────────────────────────────────────
  let reData = null;
  async function loadRE() {
    if (biz !== 'realestate') return;
    body.innerHTML = '<div class="ops-empty">loading portfolio…</div>';
    try { reData = await fetch('/api/real-estate').then((r) => r.json()); render(); }
    catch (e) { body.innerHTML = `<div class="ops-empty">portfolio offline — ${esc(e.message)}</div>`; }
  }

  // ── Add-property form: per-type fields, posts real data to /api/real-estate ──
  const RE_FORMS = {
    unit:   [['address', 'Address', 'text'], ['unit', 'Unit / floor', 'text'], ['rent', 'Rent $/mo', 'number'], ['tenant', 'Tenant', 'text'], ['hap', 'HAP $', 'number'], ['notes', 'Notes', 'text']],
    flip:   [['address', 'Address', 'text'], ['budget', 'Budget $', 'number'], ['spent', 'Spent $', 'number'], ['status', 'Status', 'text'], ['notes', 'Notes', 'text']],
    build:  [['address', 'Address / lot', 'text'], ['budget', 'Budget $', 'number'], ['status', 'Status', 'text'], ['notes', 'Notes', 'text']],
    rental: [['address', 'Address', 'text'], ['rent', 'Rent $/mo', 'number'], ['tenant', 'Tenant', 'text'], ['notes', 'Notes', 'text']],
  };
  const RE_TITLE = { unit: 'unit', flip: 'flip', build: 'new build', rental: 'rental' };
  function reAddBar(type) {
    const fields = RE_FORMS[type].map(([k, label, t]) =>
      `<input class="re-f" data-re-field="${k}" type="${t}" placeholder="${esc(label)}"${k === 'address' ? ' style="grid-column:1/-1"' : ''}>`).join('');
    return `<div class="re-add">
      <button class="re-add-btn" data-re-add="${type}">+ Add ${RE_TITLE[type]}</button>
      <div class="re-add-form" id="reAddForm-${type}" hidden>
        <div class="re-add-grid">${fields}</div>
        <div class="re-add-acts">
          <button class="re-save" data-re-save="${type}">Save</button>
          <button class="re-cancel" data-re-cancel="${type}">Cancel</button>
          <span class="re-add-msg" id="reAddMsg-${type}"></span>
        </div>
      </div>
    </div>`;
  }
  async function submitRE(type) {
    const f = el('reAddForm-' + type); if (!f) return;
    const data = {};
    f.querySelectorAll('.re-f').forEach((inp) => {
      let v = inp.value.trim(); if (!v) return;
      if (inp.type === 'number') v = Number(v) || 0;
      data[inp.getAttribute('data-re-field')] = v;
    });
    const msg = el('reAddMsg-' + type);
    if (!data.address) { if (msg) msg.textContent = 'address required'; return; }
    if (msg) msg.textContent = 'saving…';
    try {
      const r = await fetch('/api/real-estate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, data }) });
      if (!r.ok) throw new Error('save failed');
      reData = null; await loadRE();   // reload real portfolio from disk + re-render
    } catch (e) { if (msg) msg.textContent = 'error: ' + esc(e.message); }
  }

  function renderUnits() {
    if (!reData) { loadRE(); return; }
    const units = reData.units || [];
    const hapReceived = units.filter((u) => u.hap_status === 'received').length;
    const total = units.reduce((s, u) => s + (u.rent || 0), 0);
    const head = units.length
      ? `<div class="ops-explain" style="margin-bottom:12px"><b>🏠 Section 8 Units</b> — ${units.length} units · HAP: ${hapReceived}/${units.length} received · Monthly rent roll: <b style="color:var(--teal)">$${total.toLocaleString()}</b></div>`
      : `<div class="ops-explain" style="margin-bottom:12px"><b>🏠 Section 8 Units</b><br>No units yet — add one below, or tell Jarvis <i>"Add unit at 123 Main St, rent $1200, HAP $900"</i>.</div>`;
    body.innerHTML = reAddBar('unit') + head +
      units.map((u) => {
        const hapClass = u.hap_status === 'received' ? 're-hap-ok' : 're-hap-pend';
        return `<div class="re-card">
          <div class="re-card-head"><div class="re-card-addr">${esc(u.address || u.id)}</div><div class="re-card-type">${esc(u.type || 'unit')}</div></div>
          <div class="re-row">Rent <span>$${(u.rent || 0).toLocaleString()}/mo</span></div>
          <div class="re-row">HAP <span class="${hapClass}">${esc(u.hap_status || '?')}${u.hap ? ' · $' + u.hap : ''}</span></div>
          ${u.hap_date ? `<div class="re-row">HAP date <span>${esc(u.hap_date)}</span></div>` : ''}
          ${u.tenant ? `<div class="re-row">Tenant <span>${esc(u.tenant)}</span></div>` : ''}
          ${u.notes ? `<div class="re-row">Notes <span>${esc(u.notes)}</span></div>` : ''}
        </div>`;
      }).join('');
  }

  function renderFlips() {
    if (!reData) { loadRE(); return; }
    const flips = reData.flips || [];
    const head = flips.length
      ? `<div class="ops-explain" style="margin-bottom:12px"><b>🔨 Active Flips</b> — ${flips.length} properties · Total budget: <b style="color:var(--teal)">$${flips.reduce((s, f) => s + (f.budget || 0), 0).toLocaleString()}</b></div>`
      : `<div class="ops-explain" style="margin-bottom:12px"><b>🔨 Active Flips</b><br>No active flips yet — add one below, or tell Jarvis <i>"Add flip at 456 Oak Ave, budget $85k"</i>.</div>`;
    body.innerHTML = reAddBar('flip') + head +
      flips.map((f) => {
        const pct = f.budget ? Math.min(100, Math.round(((f.spent || 0) / f.budget) * 100)) : 0;
        return `<div class="re-card">
          <div class="re-card-head"><div class="re-card-addr">${esc(f.address || f.id)}</div><div class="re-card-type">${esc(f.status || 'in progress')}</div></div>
          <div class="re-row">Budget <span>$${(f.budget || 0).toLocaleString()}</span></div>
          <div class="re-row">Spent <span>$${(f.spent || 0).toLocaleString()}</span></div>
          <div class="re-progress"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--dim)"><span>Progress</span><span>${pct}%</span></div><div class="re-prog-bar"><div class="re-prog-fill" style="width:${pct}%"></div></div></div>
          ${f.notes ? `<div class="re-row" style="margin-top:6px">Notes <span>${esc(f.notes)}</span></div>` : ''}
        </div>`;
      }).join('');
  }

  function renderBuilds() {
    if (!reData) { loadRE(); return; }
    const builds = reData.new_builds || [];
    const head = builds.length
      ? `<div class="ops-explain" style="margin-bottom:12px"><b>🏗 New Builds</b> — ${builds.length} project${builds.length === 1 ? '' : 's'}</div>`
      : `<div class="ops-explain" style="margin-bottom:12px"><b>🏗 New Builds</b><br>No new builds yet — add one below, or tell Jarvis <i>"Add new build at Lot 4, $250k budget"</i>.</div>`;
    body.innerHTML = reAddBar('build') + head + builds.map((b) => `<div class="re-card">
      <div class="re-card-head"><div class="re-card-addr">${esc(b.address || b.id)}</div><div class="re-card-type">${esc(b.status || 'planning')}</div></div>
      ${b.budget ? `<div class="re-row">Budget <span>$${(b.budget || 0).toLocaleString()}</span></div>` : ''}
      ${b.notes ? `<div class="re-row">Notes <span>${esc(b.notes)}</span></div>` : ''}
    </div>`).join('');
  }

  function renderRentals() {
    if (!reData) { loadRE(); return; }
    const rentals = reData.rentals || [];
    const rentOf = (r) => Number(r.rent || r.rent_monthly || 0);   // tolerate both field names
    const total = rentals.reduce((s, r) => s + rentOf(r), 0);
    const head = rentals.length
      ? `<div class="ops-explain" style="margin-bottom:12px"><b>🔑 Market Rentals</b> — ${rentals.length} units · Monthly: <b style="color:var(--teal)">$${total.toLocaleString()}</b></div>`
      : `<div class="ops-explain" style="margin-bottom:12px"><b>🔑 Market Rentals</b><br>No market-rate rentals yet — add one below, or tell Jarvis <i>"Add rental at 789 Pine St, rent $1500/mo"</i>.</div>`;
    body.innerHTML = reAddBar('rental') + head +
      rentals.map((r) => `<div class="re-card">
        <div class="re-card-head"><div class="re-card-addr">${esc(r.address || r.id)}</div><div class="re-card-type">rental</div></div>
        <div class="re-row">Rent <span>$${rentOf(r).toLocaleString()}/mo</span></div>
        ${r.tenant ? `<div class="re-row">Tenant <span>${esc(r.tenant)}</span></div>` : ''}
        ${r.notes ? `<div class="re-row">Notes <span>${esc(r.notes)}</span></div>` : ''}
      </div>`).join('');
  }

  // ── TRADING ──────────────────────────────────────────────────────────────────
  let tradeData = null;
  async function loadTrading() {
    if (biz !== 'trading') return;
    body.innerHTML = '<div class="ops-empty">fetching live quotes…</div>';
    try {
      const [wl, pos] = await Promise.all([
        fetch('/api/market/watchlist').then((r) => r.json()),
        fetch('/api/market/positions').then((r) => r.json()),
      ]);
      tradeData = { wl, pos };
      render();
    } catch (e) { body.innerHTML = `<div class="ops-empty">market data offline — ${esc(e.message)}</div>`; }
  }

  function renderWatchlist() {
    if (!tradeData) { loadTrading(); return; }
    const { wl } = tradeData;
    const quotes = wl.quotes || [];
    if (!quotes.length) {
      body.innerHTML = `<div class="ops-explain"><b>📊 Watchlist</b><br>No tickers on your watchlist yet.<br>Tell Jarvis: <i>"Add NVDA to my watchlist"</i> or <i>"Set an alert when SPY drops to $520"</i></div>`; return;
    }
    const alerts = wl.alerts || [];
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>📊 Live Watchlist</b> — ${quotes.length} tickers${alerts.length ? ` · ${alerts.length} alerts set` : ''}</div>` +
      quotes.map((q) => {
        if (q.error) return `<div class="trade-card"><div class="trade-ticker">${esc(q.ticker)}</div><div style="color:var(--err);font-size:12px">${esc(q.error)}</div></div>`;
        const up = q.change >= 0;
        const al = alerts.find((a) => a.ticker === q.ticker);
        const alTriggered = al && ((al.direction === 'below' && q.price <= al.price) || (al.direction === 'above' && q.price >= al.price));
        return `<div class="trade-card${alTriggered ? '" style="border-color:var(--warn)' : ''}">
          <div><div class="trade-ticker">${esc(q.ticker)}</div><div class="trade-meta">${esc(q.name || '')}</div></div>
          <div><div class="trade-price">$${q.price.toFixed(2)}</div><div class="trade-chg ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'}${Math.abs(q.change).toFixed(2)} (${Math.abs(q.changePct).toFixed(2)}%)</div><div class="trade-meta">Range ${(q.low||0).toFixed(2)}–${(q.high||0).toFixed(2)}</div></div>
          <div class="trade-actions">
            ${al ? `<span style="font-size:11px;color:${alTriggered?'var(--warn)':'var(--dim)'}">🔔 $${al.price}</span>` : ''}
            <button class="btn ghost" style="font-size:11px;padding:4px 9px" data-rm-ticker="${esc(q.ticker)}" title="Remove from watchlist">✕</button>
          </div>
        </div>`;
      }).join('');
  }

  function renderPositions() {
    if (!tradeData) { loadTrading(); return; }
    const positions = (tradeData.pos && tradeData.pos.positions) || [];
    if (!positions.length) {
      body.innerHTML = `<div class="ops-explain"><b>📋 Options Positions</b><br>No open positions tracked yet.<br>Tell Jarvis: <i>"I opened a NVDA call $130 strike expiring July 18, 2 contracts at $3.50"</i></div>`; return;
    }
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>📋 Open Positions</b> — ${positions.length} trades</div>` +
      positions.map((p) => `<div class="pos-card">
        <div class="pos-head"><div class="pos-ticker">${esc(p.ticker)}</div><div class="pos-type pos-${esc(p.type || 'stock')}">${esc((p.type || 'stock').toUpperCase())}</div>${p.strike ? `<span style="font-size:12px;color:var(--dim)">$${p.strike} strike</span>` : ''}</div>
        ${p.expiry ? `<div class="pos-row">Expiry: <b>${esc(p.expiry)}</b></div>` : ''}
        <div class="pos-row">Qty: ${p.qty || '?'} · Cost basis: ${p.cost_basis ? '$' + p.cost_basis : '?'}/contract</div>
        ${p.alert_price ? `<div class="pos-row" style="color:var(--warn)">Alert at: $${p.alert_price}</div>` : ''}
        ${p.notes ? `<div class="pos-row" style="color:var(--dim)">${esc(p.notes)}</div>` : ''}
        <div style="margin-top:8px"><button class="btn ghost" style="font-size:11px;padding:4px 9px" data-close-pos="${esc(p.id)}">Close position</button></div>
      </div>`).join('');
  }

  // ── PAPER TRADING (simulation only — no real money, not financial advice) ──
  let paperData = null;
  async function loadPaper() {
    body.innerHTML = '<div class="ops-empty">loading paper sandbox…</div>';
    try { paperData = await fetch('/api/market/paper').then((r) => r.json()); render(); }
    catch (e) { body.innerHTML = `<div class="ops-empty">paper offline — ${esc(e.message)}</div>`; }
  }
  function renderPredictions() {
    if (!paperData) { loadPaper(); return; }
    const preds = paperData.predictions || [];
    const head = `<div class="ops-explain" style="margin-bottom:12px"><b>🔮 Predictions</b> — the bot's calls on your watchlist. <b>Simulation only, not financial advice.</b>
      <div style="margin-top:8px"><button class="btn sm go" data-predict-all="1">Predict watchlist →</button></div></div>`;
    if (!preds.length) { body.innerHTML = head + `<div class="ops-empty">No predictions yet — add tickers to your Watchlist, then tap “Predict watchlist”.</div>`; return; }
    body.innerHTML = head + preds.map((p) => {
      const up = p.direction === 'up';
      return `<div class="trade-card">
        <div><div class="trade-ticker">${esc(p.ticker)}</div><div class="trade-meta">@ $${(p.price||0).toFixed(2)} · ${esc(p.horizon||'')}</div></div>
        <div><div class="trade-chg ${up ? 'up' : 'dn'}">${up ? '▲ UP' : '▼ DOWN'}</div><div class="trade-meta">conf ${Math.round(p.confidence||0)}%</div></div>
        <div style="flex:1;font-size:12px;color:var(--dim);min-width:0">${esc(p.rationale || '')}</div>
        <div class="trade-actions"><button class="btn sm" data-paper-from="${esc(p.id)}:${esc(p.ticker)}:${up ? 'long' : 'short'}">Paper ${up ? 'buy' : 'short'}</button></div>
      </div>`;
    }).join('');
  }
  function renderPaper() {
    if (!paperData) { loadPaper(); return; }
    const s = paperData.summary || {};
    const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pnlCls = (s.totalPnl || 0) >= 0 ? 'up' : 'dn';
    const open = paperData.open || [], closed = paperData.closed || [];
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>🧪 Paper P&amp;L</b> — simulated account, no real money. Real trades stay disabled.</div>
      <div class="re-card"><div class="dash-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div class="trade-meta">Equity</div><div class="trade-price">${money(s.equity)}</div></div>
        <div><div class="trade-meta">Total P&amp;L</div><div class="trade-price trade-chg ${pnlCls}">${money(s.totalPnl)}</div></div>
        <div><div class="trade-meta">Cash</div><div class="trade-meta" style="font-size:14px;color:var(--cream)">${money(s.cash)}</div></div>
        <div><div class="trade-meta">Realized / Unreal.</div><div class="trade-meta" style="font-size:13px;color:var(--cream)">${money(s.realized)} / ${money(s.unrealized)}</div></div>
      </div></div>
      <div class="ag-task-title" style="margin:14px 0 8px">Open (${open.length})</div>
      ${open.length ? open.map((t) => {
        const up = (t.unrealized || 0) >= 0;
        return `<div class="trade-card">
          <div><div class="trade-ticker">${esc(t.ticker)}</div><div class="trade-meta">${esc(t.side)} ${t.qty} @ $${t.entry.toFixed(2)}${t.cur != null ? ' → $' + t.cur.toFixed(2) : ''}</div></div>
          <div><div class="trade-chg ${up ? 'up' : 'dn'}">${money(t.unrealized)}</div></div>
          <div class="trade-actions"><button class="btn sm" data-paper-close="${esc(t.id)}">Close</button></div>
        </div>`;
      }).join('') : '<div class="ops-empty">No open paper trades.</div>'}
      ${closed.length ? `<div class="ag-task-title" style="margin:14px 0 8px">Closed (${closed.length})</div>` + closed.map((t) => {
        const up = (t.realized || 0) >= 0;
        return `<div class="trade-card"><div><div class="trade-ticker">${esc(t.ticker)}</div><div class="trade-meta">${esc(t.side)} ${t.qty} · $${t.entry.toFixed(2)}→$${(t.exit||0).toFixed(2)}</div></div><div><div class="trade-chg ${up ? 'up' : 'dn'}">${money(t.realized)}</div></div></div>`;
      }).join('') : ''}`;
  }

  function renderLeads() {
    const items = leadsFor(curBiz());
    if (!items.length) {
      body.innerHTML = `<div class="ops-explain">
        <b>⚑ Leads — Needs You</b><br>
        When Jarvis or any agent needs your go-ahead, it shows up here.
        <b>Review</b> the draft first, then <b>Approve</b> to execute or <b>Pass</b> to skip.
        Nothing runs without your approval.
      </div>
      <div class="ops-empty">Nothing waiting for you right now — check back after the next agent run.</div>`;
      return;
    }
    body.innerHTML = `<div class="ops-explain">
      <b>⚑ Needs you (${items.length})</b> — Review each item, then Approve to run it or Pass to skip.
      Approving sends the action to the executor. Nothing is sent, submitted, or spent without your go-ahead.
    </div>` + items.map((l) => {
      const canReview = !!(l.file || l.noticeId);
      return `
      <div class="ops-card lead" data-id="${esc(l.id)}">
        <div class="ops-row">
          <span class="tag tag-${esc((l.pod || '').toLowerCase())}">${esc(l.pod || 'system')}</span>
          <span class="tag tag-act">${esc(l.action || '')}</span>
        </div>
        <div class="ops-title">${esc(l.rationale || '(no detail)')}</div>
        ${l.file ? `<div class="ops-sub">📄 ${esc(l.file)}</div>` : ''}
        <div class="ops-actions">
          ${canReview ? `<button class="btn" data-review="${esc(l.id)}">🔍 Review</button>` : ''}
          <button class="btn go" data-approve="${esc(l.id)}">✓ Approve</button>
          <button class="btn ghost" data-pass="${esc(l.id)}">Pass</button>
          <span class="ops-result" id="res-${esc(l.id)}"></span>
        </div>
      </div>`;
    }).join('');
  }

  function renderOpps() {
    const items = data.opportunities || [];
    if (!items.length) {
      body.innerHTML = `<div class="ops-explain">
        <b>◎ Opportunities</b> — These are government contracts (RFPs) that Jarvis has scored for us on SAM.gov.<br>
        <b>Score</b> = how well it fits Rodgate (0-100). Click any opportunity to see the full RFP, documents, and CO contact.
        If it looks good, hit <b>🎯 Pursue</b> to have Patricia draft the proposal.<br>
        To find new ones: say <em>"Hey Jarvis, scan SAM.gov for janitorial contracts in Pennsylvania."</em>
      </div>
      <div class="ops-empty">No scored opportunities yet. Tell Jarvis "scan SAM.gov for janitorial work."</div>`;
      return;
    }
    const fmtVal = (v) => v ? '$' + Math.round(Number(v)).toLocaleString('en-US') : null;
    body.innerHTML = `<div class="ops-explain">
      <b>◎ ${items.length} Opportunities scored</b> — sorted by fit. Click any card to read the full RFP.
      BID = pursue it. WATCH = monitor. NO = skip.
      Look for the 💰 to see the contract value before deciding.
    </div>` + items.map((o) => {
      const val = fmtVal(o.estimatedValue);
      return `
      <div class="ops-card opp${o.noticeId ? ' clickable' : ''}" ${o.noticeId ? `data-opp="${esc(o.noticeId)}"` : ''}>
        <div class="ops-row">
          <span class="score ${scoreClass(o.score)}">${o.score != null ? esc(o.score) : '—'}<small>/100</small></span>
          <span class="rec ${recClass(o.recommendation)}">${esc((o.recommendation || '').toUpperCase() || 'SCORED')}</span>
          ${val ? `<span class="tag tag-val">💰 ${esc(val)}</span>` : ''}
          ${o.subNeeded ? '<span class="tag tag-act">needs a sub</span>' : ''}
          ${o.proposalFile ? '<span class="tag tag-act">📝 drafted</span>' : ''}
        </div>
        <div class="ops-title">${esc(o.title || 'Untitled opportunity')}</div>
        <div class="ops-meta">
          ${o.setAside ? `<span>🏷 ${esc(o.setAside)}</span>` : ''}
          ${(o.place || o.placeState) ? `<span>📍 ${esc([o.place, o.placeState].filter(Boolean).join(', '))}</span>` : ''}
          ${dueChip(o.deadline)}
          ${o.agency ? `<span>🏛 ${esc(o.agency)}</span>` : ''}
        </div>
        <div class="ops-actions">
          ${o.noticeId ? `<button class="btn go" data-opp-btn="${esc(o.noticeId)}">Details &amp; RFP →</button>` : ''}
          ${o.url ? `<a class="btn ghost" href="${esc(o.url)}" target="_blank" rel="noreferrer">SAM.gov ↗</a>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderProps() {
    const items = data.proposals || [];
    if (!items.length) {
      body.innerHTML = `<div class="ops-explain">
        <b>▤ Proposals</b> — When you click "🎯 Pursue" on an opportunity, Patricia drafts a proposal here.<br>
        <b>Workflow (A → B → C):</b><br>
        A. Open the proposal and read it.<br>
        B. Click "📎 RFP &amp; files" → "🛡 Compliance check" to verify we meet all requirements.<br>
        C. Click "📧 Email" to prepare the submission email, or submit directly on SAM.gov if the RFP requires portal submission.
      </div>
      <div class="ops-empty">No proposals drafted yet. Go to Opportunities, open one, then tap "🎯 Pursue".</div>`;
      return;
    }
    const fmtVal = (v) => v ? '$' + Math.round(Number(v)).toLocaleString('en-US') : null;
    body.innerHTML = `<div class="ops-explain">
      <b>▤ ${items.length} Proposal${items.length > 1 ? 's' : ''} drafted</b> —
      Read each one, run the compliance check, then email or submit.<br>
      💰 = estimated contract value. Always confirm submission method in the RFP (email vs SAM.gov portal).
    </div>` + items.map((p) => {
      const opp = p.noticeId ? oppByNotice[p.noticeId] : null;
      const val = fmtVal(opp && opp.estimatedValue);
      return `
      <div class="ops-card">
        <div class="ops-row">
          ${val ? `<span class="tag tag-val">💰 ${esc(val)}</span>` : ''}
          ${p.noticeId ? `<span class="tag tag-act">RFP linked</span>` : ''}
        </div>
        <div class="ops-title">${esc(p.rationale || p.file)}</div>
        <div class="ops-sub">📄 ${esc(p.file)}</div>
        <div class="ops-actions">
          <button class="btn go" data-open="${esc(p.file)}">Open &amp; read →</button>
          ${p.noticeId ? `<button class="btn" data-docs="${esc(p.noticeId)}">📎 RFP &amp; files</button>` : ''}
          <button class="btn" data-email-prop="${esc(p.file)}" data-email-notice="${esc(p.noticeId || '')}">📧 Email</button>
          ${p.approvalId ? `<button class="btn" data-approve="${esc(p.approvalId)}">✓ Approve</button><span class="ops-result" id="res-${esc(p.approvalId)}"></span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderCrm() {
    const items = data.crm || [];
    const banner = `<div class="ops-explain">
      <b>⚇ Subcontractor CRM</b> — Companies we can team with on government contracts. Rodgate is the prime; subs provide the labor (must stay under the 50% subcontracting limit).<br>
      <b>A.</b> Open a sub to see their Google reviews, fit verdict, and contact info.<br>
      <b>B.</b> Click <b>Preview &amp; send outreach</b> — review Hector's email draft before anything goes out.<br>
      <b>C.</b> Confirm → lead appears in ⚑ Leads for your approval. You approve → email sends.<br>
      <em>Say "Hey Jarvis, find janitorial subs near Wilkes-Barre" to add more prospects.</em>
    </div>`;
    if (!items.length) { body.innerHTML = banner + '<div class="ops-empty">CRM empty — tell Jarvis to find subs, or add one manually.</div>'; return; }
    body.innerHTML = banner + items.map((s) => `
      <div class="ops-card opp clickable" data-sub="${esc(s.id || '')}">
        <div class="ops-row">
          <span class="ops-title-sm">${esc(s.name || 'unnamed')}</span>
          <span class="tag tag-act">${esc(s.status || 'prospect')}</span>
        </div>
        <div class="ops-meta">
          ${s.trade ? `<span>🧰 ${esc(s.trade)}</span>` : ''}
          ${s.location ? `<span>📍 ${esc(s.location)}</span>` : ''}
          <span class="${s.contact_email ? 'em-ok' : 'em-no'}">✉ ${esc(s.contact_email || 'no email — open to find one')}</span>
          ${s.phone ? `<span>☎ ${esc(s.phone)}</span>` : ''}
        </div>
        <div class="ops-actions"><button class="btn go" data-sub-open="${esc(s.id || '')}">Open profile &amp; fit →</button></div>
      </div>`).join('');
  }

  async function openSubDetail(id) {
    if (!id) return;
    el('oppDetailCap').textContent = 'Subcontractor';
    el('oppDetailBody').innerHTML = '<div class="ops-empty">loading profile, reviews &amp; fit…</div>';
    el('oppDetail').hidden = false;
    let d; try { d = await (await fetch('/api/sub-info?id=' + encodeURIComponent(id))).json(); } catch (e) { el('oppDetailBody').innerHTML = `<div class="ops-empty">couldn't load: ${esc(e.message)}</div>`; return; }
    if (d.error) { el('oppDetailBody').innerHTML = `<div class="ops-empty">${esc(d.error)}</div>`; return; }
    const s = d.sub || {}, pl = d.places, fit = d.fit;
    el('oppDetailCap').textContent = String(s.name || 'Subcontractor').slice(0, 70);
    const fitClass = fit && /GREAT/.test(fit.verdict) ? 'go' : fit && /POOR/.test(fit.verdict) ? 'no' : 'mid';
    let h = `<div class="od-title">${esc(s.name || 'Subcontractor')}</div>
      <div class="ops-meta">
        ${s.trade ? `<span>🧰 ${esc(s.trade)}</span>` : ''}
        ${s.location ? `<span>📍 ${esc(s.location)}</span>` : ''}
        ${pl && pl.rating ? `<span>⭐ ${esc(pl.rating)} (${esc(pl.total)} reviews)</span>` : ''}
        <span class="rec ${fitClass}">${esc((fit && fit.verdict) || 'PROSPECT')}</span>
      </div>
      <div class="ops-actions">
        ${s.website ? `<a class="btn ghost" href="${esc(s.website)}" target="_blank" rel="noreferrer">Website ↗</a>` : ''}
        <button class="btn go" data-reach="${esc(s.id)}">📧 Preview &amp; send outreach</button>
        <span class="od-act-result" id="odActResult"></span>
      </div>
      <div class="od-sec"><div class="od-sec-h">Contact</div>
        <div class="od-contact">${s.contact_email ? `✉ <a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>` : '✉ no email yet — “reach out” will try to find one'}${s.phone ? ' · ☎ ' + esc(s.phone) : ''}</div>
      </div>`;
    if (fit && fit.why) h += `<div class="od-sec"><div class="od-sec-h">Our fit assessment (Hector)</div><div class="od-desc">${esc(fit.why)}</div></div>`;
    if (pl && pl.reviews && pl.reviews.length) h += `<div class="od-sec"><div class="od-sec-h">Reviews (Google)</div>${pl.reviews.map((rv) => `<div class="od-review">${rv.rating ? '★'.repeat(Math.round(rv.rating)) + ' ' : ''}${esc(rv.author)}<div class="od-review-t">${esc(String(rv.text).slice(0, 300))}</div></div>`).join('')}</div>`;
    else if (pl) h += '<div class="od-sec"><div class="od-sec-h">Reviews (Google)</div><div class="ops-empty">No reviews returned for this business.</div></div>';
    if (s.notes) h += `<div class="od-sec"><div class="od-sec-h">Notes</div><div class="od-desc">${esc(s.notes)}</div></div>`;
    el('oppDetailBody').innerHTML = h;
  }
  async function runCompliance(file) {
    const sec = el('odComplianceSec'), box = el('odCompliance'); if (!sec) return;
    sec.hidden = false; box.innerHTML = '<div class="ops-empty">reading the RFP requirements + checking the proposal…</div>';
    try {
      const d = await (await fetch('/api/compliance-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: curDetail.noticeId, file }) })).json();
      if (d.error) { box.innerHTML = `<div class="ops-empty">${esc(d.error)}</div>`; return; }
      const vc = d.verdict === 'PASS' ? 'go' : d.verdict === 'FAIL' ? 'no' : 'mid';
      let h = `<div class="cmp-line"><span class="rec ${vc}">${esc(d.verdict || '?')}</span><span class="cmp-summary">${esc(d.summary || '')}</span></div>`;
      if ((d.items || []).length) h += '<div class="cmp-items">' + d.items.map((it) => `<div class="cmp-item ${it.ok ? 'ok' : 'bad'}">${it.ok ? '✓' : '✗'} <b>${esc(it.req)}</b>${it.note ? ' — ' + esc(it.note) : ''}</div>`).join('') + '</div>';
      if ((d.gaps || []).length) h += '<div class="cmp-gaps"><b>Fix before submitting:</b><ul>' + d.gaps.map((g) => `<li>${esc(g)}</li>`).join('') + '</ul></div>';
      if (d.needs_sub_past_performance) h += '<div class="cmp-gaps">⚠ Needs a subcontractor\'s past performance — use a CRM prospect\'s “reach out” to request it.</div>';
      box.innerHTML = h;
    } catch (e) { box.innerHTML = `<div class="ops-empty">error: ${esc(e.message)}</div>`; }
  }
  async function reachSub(id) {
    const r = el('odActResult'); if (r) r.textContent = 'Hector is drafting the outreach email…';
    try {
      const prev = await (await fetch('/api/sub-reach-preview?' + new URLSearchParams({ id }))).json();
      if (!prev.ok) {
        if (r) r.innerHTML = prev.error === 'not found' || /not found/i.test(prev.error || '')
          ? '⚠ Sub not in CRM yet — say <em>Hey Jarvis, add [company name] to the CRM</em> then try again.'
          : 'could not draft: ' + esc(prev.error || 'try again');
        return;
      }
      // show preview in the email panel
      el('emailPanelCap').textContent = 'Outreach to ' + (prev.sub && prev.sub.name ? prev.sub.name : 'sub');
      const toLine = prev.to ? `<b>To:</b> ${esc(prev.toName)} &lt;${esc(prev.to)}&gt;` : '<b>To:</b> <em>no email on file — add one in CRM then retry</em>';
      el('emailCompose').innerHTML = `
        <div class="ec-note" style="background:rgba(var(--teal-rgb),.06);border:1px solid rgba(var(--teal-rgb),.18);border-radius:8px;padding:11px 14px;font-size:12px;color:var(--cream);line-height:1.6">
          <b>Review before sending to Leads</b><br>This email will go to Leads for your approval — nothing is sent until you tap Approve there.
        </div>
        <div class="ec-field"><span class="ec-lbl">To</span><span class="ec-val">${toLine}</span></div>
        <div class="ec-field"><span class="ec-lbl">Subject</span><span class="ec-val">${esc(prev.subject)}</span></div>
        <div class="ec-body"><pre style="white-space:pre-wrap;font-size:12.5px;font-family:inherit;margin:0">${esc(prev.body)}</pre></div>
        <div class="ec-actions">
          <button class="btn go" id="reachConfirmBtn">✅ Send to Leads for approval</button>
          <button class="btn ghost" id="reachCopyBtn">📋 Copy</button>
          <span id="reachResult" style="font-size:12px;color:var(--teal)"></span>
        </div>`;
      el('emailPanel').hidden = false;
      if (r) r.textContent = '';
      el('reachCopyBtn').addEventListener('click', () => {
        const doCopy = () => { el('reachResult').textContent = '✓ copied'; setTimeout(() => { if (el('reachResult')) el('reachResult').textContent = ''; }, 2000); };
        if (navigator.clipboard) {
          navigator.clipboard.writeText(prev.body).then(doCopy).catch(() => { el('reachResult').textContent = 'Select text above and copy manually'; });
        } else { el('reachResult').textContent = 'Select text above and copy manually'; }
      });
      el('reachConfirmBtn').addEventListener('click', async () => {
        el('reachConfirmBtn').disabled = true; el('reachResult').textContent = 'sending to Leads…';
        try {
          const cr = await (await fetch('/api/sub-reach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })).json();
          if (cr.ok) {
            el('reachResult').innerHTML = `✅ In Leads — <button class="btn go" style="padding:3px 10px;font-size:11px" id="goLeadsBtn2">Review &amp; approve →</button>`;
            const gb = el('goLeadsBtn2');
            if (gb) gb.addEventListener('click', () => { el('emailPanel').hidden = true; el('oppDetail').hidden = true; biz = 'gov'; tab = 'leads'; renderBizBar(); renderTabs(); load(); });
          } else {
            el('reachResult').textContent = 'could not send: ' + (cr.error || 'try again');
            el('reachConfirmBtn').disabled = false;
          }
        } catch (e) { el('reachResult').textContent = 'error: ' + e.message; el('reachConfirmBtn').disabled = false; }
      });
    } catch (e) { if (r) r.textContent = 'error: ' + e.message; }
  }

  async function openEmail(file, noticeId) {
    el('emailPanelCap').textContent = 'Prepare email — ' + file;
    el('emailCompose').innerHTML = '<div class="ops-empty">composing email…</div>';
    el('emailPanel').hidden = false;
    try {
      const params = new URLSearchParams({ file }); if (noticeId) params.set('noticeId', noticeId);
      const d = await (await fetch('/api/email-proposal?' + params)).json();
      if (d.error) { el('emailCompose').innerHTML = `<div class="ops-empty">${esc(d.error)}</div>`; return; }
      const submitNote = d.submitViaPortal
        ? `<div class="ec-warn">⚠ This RFP may require submission through the SAM.gov portal (not email). Verify in the RFP document before sending an email.</div>`
        : `<div class="ec-note">If the RFP says "submit via SAM.gov portal," use that instead. Otherwise email this directly to the CO.</div>`;
      el('emailCompose').innerHTML = `
        ${submitNote}
        <div class="ec-field"><span class="ec-lbl">To</span>
          ${d.to
            ? `<span class="ec-val teal">${esc(d.to)}</span>`
            : `<span class="ec-val warn">⚠ No email found — look up the contracting officer's email in the RFP documents or on SAM.gov, then add it here before sending.</span>`}
        </div>
        <div class="ec-field"><span class="ec-lbl">Subject</span><span class="ec-val">${esc(d.subject)}</span></div>
        <div class="ec-body" id="ecBody"><pre>${esc(d.body)}</pre></div>
        <div class="ec-actions">
          <button class="btn go" id="ecCopy">📋 Copy to clipboard</button>
          ${d.to ? `<a class="btn" href="mailto:${esc(d.to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body.slice(0, 1800))}" target="_blank">📧 Open in email client</a>` : ''}
          <span class="ec-result" id="ecResult"></span>
        </div>`;
      const copyBtn = el('ecCopy');
      if (copyBtn) copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(`To: ${d.to || '(add recipient)'}\nSubject: ${d.subject}\n\n${d.body}`);
          el('ecResult').textContent = '✅ Copied — paste into Gmail or your email client';
          setTimeout(() => { const r = el('ecResult'); if (r) r.textContent = ''; }, 3500);
        } catch { el('ecResult').textContent = 'Select the text above and copy manually'; }
      });
    } catch (e) { el('emailCompose').innerHTML = `<div class="ops-empty">error: ${esc(e.message)}</div>`; }
  }

  // ── 🎨 FIVERR STUDIO — bring a client brief, get a real deliverable (thumbnail / cover / logo / product) ──
  let lastStudio = null;        // { kind, svg, spec, before? }
  let studioKind = 'thumbnail';
  let productStyle = 'studio';
  const STUDIO_KINDS = [
    { id: 'thumbnail', label: '▶ Thumbnail' }, { id: 'cover', label: '📕 Book cover' },
    { id: 'logo', label: '✦ Logo' }, { id: 'product', label: '📦 Product edit' },
  ];
  const STUDIO_EG = {
    thumbnail: ['I survived 50 hours in the ocean — extreme survival challenge, fear', 'How I made $100,000 in 30 days — shocked reaction, cash everywhere', 'I got shredded in 90 days — body transformation, flexing'],
    cover: ['a thriller novel "The Last Signal" about a lighthouse keeper who hears the dead', 'a nonfiction book "The Quiet Compound" on building wealth slowly', 'a fantasy epic "Emberfall" about a lone warrior and a dying flame'],
    logo: ['Northwind Coffee Roasters — warm, artisanal, small-batch', 'Apex Legal — corporate law firm, trustworthy and modern', 'Pixel Forge — indie game studio, playful and techy'],
  };
  const PLACEHOLDER = {
    thumbnail: "e.g. 'I survived 50 hours in the ocean — extreme survival challenge, fear'",
    cover: "e.g. 'a thriller novel called The Last Signal about a lighthouse keeper who hears the dead'",
    logo: "e.g. 'a logo for Northwind Coffee Roasters — warm, artisanal, small-batch'",
  };
  const VERB = { thumbnail: 'thumbnail', cover: 'cover', logo: 'logo', product: 'product image' };
  const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  function renderStudio() {
    const tabs = STUDIO_KINDS.map((k) => `<button class="studio-kind${k.id === studioKind ? ' on' : ''}" data-kind="${k.id}">${k.label}</button>`).join('');
    const isProduct = studioKind === 'product';
    const input = isProduct
      ? `<div class="studio-drop" id="stDrop"><input type="file" id="stFile" accept="image/*" hidden>
           <div class="studio-drop-in">📦 <b>Drop a product photo</b> (or click to choose). Jarvis removes the background and drops it on a clean studio backdrop.</div></div>
         <div class="studio-row"><span class="studio-egs">Backdrop:
           <button class="studio-chip${productStyle === 'studio' ? ' on' : ''}" data-style="studio">Studio + soft shadow</button>
           <button class="studio-chip${productStyle === 'white' ? ' on' : ''}" data-style="white">Pure white (Amazon)</button></span></div>`
      : `<textarea id="stBrief" rows="2" placeholder="${esc(PLACEHOLDER[studioKind])}"></textarea>
         <div class="studio-row">
           <button class="btn go" id="stGo">✨ Design ${VERB[studioKind]}</button>
           <span class="studio-egs">${(STUDIO_EG[studioKind] || []).map((e, i) => `<button class="studio-chip" data-eg="${i}">${esc(e.split('—')[0].split(' about ')[0].replace(/^a(n)? /i, '').trim().slice(0, 28))}…</button>`).join('')}</span>
         </div>`;
    const emptyMsg = isProduct ? 'Drop a product photo to clean it up.' : `Describe it (or tap an example) and hit “Design ${VERB[studioKind]}”.`;
    body.innerHTML = `<div class="studio-wrap">
      <div class="ops-explain"><b>🎨 Fiverr Studio</b> — Pick a deliverable, describe what the client wants, and Jarvis builds it. Review, then <b>Download PNG</b>. You QC everything before it ships.</div>
      <div class="studio-kinds">${tabs}</div>
      <div class="studio-in">${input}</div>
      <div id="stResult" class="studio-result">${lastStudio && lastStudio.kind === studioKind ? '' : `<div class="ops-empty">${emptyMsg}</div>`}</div></div>`;
    body.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { studioKind = b.getAttribute('data-kind'); renderStudio(); }));
    if (isProduct) wireProduct();
    else {
      el('stGo').addEventListener('click', runStudio);
      el('stBrief').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runStudio(); } });
      body.querySelectorAll('[data-eg]').forEach((b) => b.addEventListener('click', () => { el('stBrief').value = STUDIO_EG[studioKind][+b.getAttribute('data-eg')]; el('stBrief').focus(); }));
    }
    if (lastStudio && lastStudio.kind === studioKind) renderStudioResult(lastStudio);
  }

  async function runStudio() {
    const brief = (el('stBrief').value || '').trim();
    if (!brief) return el('stBrief').focus();
    const out = el('stResult'), go = el('stGo'); go.disabled = true; const old = go.textContent; go.textContent = '🎨 Designing…';
    out.innerHTML = `<div class="studio-load"><div class="spin"></div><div>Designing your ${VERB[studioKind]}… <span class="dim">(usually 10–25s)</span></div></div>`;
    try {
      const r = await fetch('/api/studio/' + studioKind, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief }) });
      const d = await r.json();
      if (!d.ok) { out.innerHTML = `<div class="ops-empty">Couldn't design it: ${esc(d.error || 'try again')}</div>`; return; }
      lastStudio = { kind: studioKind, svg: d.svg, spec: d.spec || {}, subjectOk: d.subjectOk };
      renderStudioResult(lastStudio);
    } catch (e) { out.innerHTML = `<div class="ops-empty">error: ${esc(e.message)}</div>`; }
    finally { go.disabled = false; go.textContent = old; }
  }

  // ── product edit: read file → downscale client-side → POST data URI → before/after ──
  function wireProduct() {
    const drop = el('stDrop'), file = el('stFile');
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { if (file.files[0]) handleProduct(file.files[0]); });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) handleProduct(f); });
    body.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => { productStyle = b.getAttribute('data-style'); body.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('on', x === b)); }));
  }
  function downscale(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => { const im = new Image(); im.onload = () => { let w = im.naturalWidth, h = im.naturalHeight; if (w > max || h > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); } const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); resolve(c.toDataURL('image/jpeg', 0.9)); }; im.onerror = reject; im.src = fr.result; };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
  }
  async function handleProduct(file) {
    const out = el('stResult'); out.innerHTML = `<div class="studio-load"><div class="spin"></div><div>Removing background + relighting… <span class="dim">(usually 5–15s)</span></div></div>`;
    try {
      const imageDataUri = await downscale(file);
      const r = await fetch('/api/studio/product', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageDataUri, style: productStyle }) });
      const d = await r.json();
      if (!d.ok) { out.innerHTML = `<div class="ops-empty">Couldn't process it: ${esc(d.error || 'try again')}</div>`; return; }
      lastStudio = { kind: 'product', svg: d.svg, before: d.before || imageDataUri };
      renderStudioResult(lastStudio);
    } catch (e) { out.innerHTML = `<div class="ops-empty">error: ${esc(e.message)}</div>`; }
  }

  function actionsHtml(kind) {
    return `<div class="studio-actions"><button class="btn go" id="stDl">⬇ Download PNG</button>${kind !== 'product' ? '<button class="btn" id="stVar">↻ Variation</button>' : ''}<span class="studio-result-msg" id="stMsg"></span></div>`;
  }
  function dlName(s) {
    const base = s.kind === 'thumbnail' ? (s.spec && s.spec.videoTitle) : s.kind === 'cover' ? (s.spec && [].concat(s.spec.title || []).join(' ')) : s.kind === 'logo' ? (s.spec && s.spec.brand) : 'product-image';
    return (String(base || s.kind).replace(/[^\w]+/g, '-').slice(0, 40).toLowerCase() || s.kind) + '.png';
  }

  function renderStudioResult(s) {
    const out = el('stResult'); if (!out) return;
    const url = svgUrl(s.svg), sp = s.spec || {};
    if (s.kind === 'thumbnail') {
      const views = (Math.floor(Math.random() * 900) + 60) + 'K';
      const note = s.subjectOk === false ? '<div class="studio-warn">⚠ The photo model was busy — used a styled background. Hit “Variation” to retry.</div>' : '';
      out.innerHTML = `${note}<div class="studio-grid">
        <div><div class="studio-cap">As it looks in the YouTube feed</div>
          <div class="yt-card"><div class="yt-thumb"><img src="${url}"><span class="yt-dur">12:0${Math.floor(Math.random() * 9)}</span></div>
          <div class="yt-meta"><div class="yt-av"></div><div><div class="yt-title">${esc(sp.videoTitle || 'Your video title')}</div><div class="yt-ch">${esc(sp.channel || 'Your Channel')} · ${views} views · 2 days ago</div></div></div></div></div>
        <div><div class="studio-cap">Full deliverable — 1280×720</div><div class="studio-raw"><img src="${url}"></div>${actionsHtml('thumbnail')}</div></div>`;
    } else if (s.kind === 'cover') {
      out.innerHTML = `<div class="studio-grid">
        <div><div class="studio-cap">Cover preview</div><div class="cover-mock"><img src="${url}"></div></div>
        <div><div class="studio-cap">Deliverable — 1600×2400 (KDP-ready)</div>${actionsHtml('cover')}
          <div class="studio-spec">${esc(sp.title ? [].concat(sp.title).join(' ') : '')}${sp.author ? ' — ' + esc(sp.author) : ''}</div></div></div>`;
    } else if (s.kind === 'logo') {
      out.innerHTML = `<div class="studio-grid">
        <div><div class="studio-cap">Logo</div><div class="logo-mock"><img src="${url}"></div></div>
        <div><div class="studio-cap">On dark &amp; light</div>
          <div class="logo-swatches"><div class="sw dark"><img src="${url}"></div><div class="sw light"><img src="${url}"></div></div>
          ${actionsHtml('logo')}</div></div>`;
    } else {
      out.innerHTML = `<div class="studio-grid">
        <div><div class="studio-cap">Before</div><div class="prod-mock"><img src="${esc(s.before)}"></div></div>
        <div><div class="studio-cap">After — clean studio image</div><div class="prod-mock"><img src="${url}"></div>${actionsHtml('product')}</div></div>`;
    }
    const dl = el('stDl'); if (dl) dl.addEventListener('click', () => downloadPng(s.svg, dlName(s)));
    const v = el('stVar'); if (v) v.addEventListener('click', runStudio);
  }

  function downloadPng(svg, name) {
    const msg = el('stMsg'); if (msg) msg.textContent = 'rendering PNG…';
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1280, h = img.naturalHeight || 720;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try {
        c.toBlob((b) => {
          if (!b) { if (msg) msg.textContent = 'render failed — right-click the image to save'; return; }
          const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          if (msg) msg.textContent = '✅ saved ' + name;
        }, 'image/png');
      } catch (e) { if (msg) msg.textContent = 'export blocked: ' + e.message; }
    };
    img.onerror = () => { if (msg) msg.textContent = 'could not rasterize — right-click the image → Save image as'; };
    img.src = svgUrl(svg);
  }

  async function renderActivity(pod) {
    body.innerHTML = '<div class="ops-empty">loading activity…</div>';
    try {
      const d = await (await fetch('/api/pod-events?pod=' + encodeURIComponent(pod))).json();
      const evs = d.events || [];
      if (!evs.length) { body.innerHTML = '<div class="ops-empty">No activity logged for this business yet. Tell Jarvis to start a job (e.g. "make a YouTube thumbnail").</div>'; return; }
      body.innerHTML = evs.map((e) => `
        <div class="ops-card${e.status === 'error' ? ' lead' : ''}">
          <div class="ops-row">
            <span class="tag tag-act">${esc(e.action || '')}</span>
            <span class="ops-sub">${esc(when(e.ts))}${e.actor ? ' · ' + esc(e.actor) : ''}</span>
          </div>
          <div class="ops-title" style="font-size:13.5px">${esc(e.rationale || '')}</div>
        </div>`).join('');
    } catch (e) { body.innerHTML = `<div class="ops-empty">couldn't load activity: ${esc(e.message)}</div>`; }
  }

  // ── approve confirmation: tell the user EXACTLY what approving will do, before it happens ──
  let pendingApproveId = null;
  function moneyIn(text) { const m = String(text || '').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/); return m ? m[1] : null; }
  async function confirmApprove(id) {
    const l = leadById[id]; if (!l) return decide(id, 'approve');
    pendingApproveId = id;
    const act = String(l.action || '').toLowerCase();
    const bodyEl = el('opsConfirmBody');
    bodyEl.innerHTML = `<div class="ocf-what">${esc(l.rationale || l.action || 'this action')}</div><div class="ops-empty">checking what will happen…</div>`;
    el('opsConfirm').hidden = false;
    let html = '';
    if (/submit/.test(act)) {
      html = `<p>✅ <b>Marks this proposal ready to submit.</b></p>
        <p>Government proposals are <b>not emailed</b> — you submit them yourself on the <b>SAM.gov portal</b>. Approving logs it as ready and (optionally) notifies you; <b>nothing is auto-sent</b>.</p>
        <p class="ocf-tip">Tip: open the proposal + the real RFP documents first (Proposals tab → “RFP &amp; files”) to confirm we meet every requirement before you submit.</p>`;
    } else if (/send|email|outreach/.test(act)) {
      let to = null;
      if (l.file) { try { const d = await (await fetch('/api/proposal?file=' + encodeURIComponent(l.file))).json(); to = ((d.content || '').match(/^To:\s*(.+)$/m) || [])[1] || null; } catch { /* */ } }
      if (to) html = `<p>✉ <b>Emails this outreach</b> from the Rodgate mailbox to:</p><p class="ocf-to">${esc(to)}</p><p class="ocf-tip">It only actually sends if auto-send is on (GOV_AUTO_SEND); otherwise you'll get a preview of what would go out.</p>`;
      else html = `<p>⚠ <b>This won't send anything yet.</b></p><p>There's <b>no recipient email</b> for this subcontractor on file, so approving can't email it. First ask Hector to find the email (say <i>“find emails for the subs”</i>), then approve.</p>`;
    } else if (/invoice|payment|charge|bill/.test(act) || moneyIn(l.rationale)) {
      const amt = moneyIn(l.rationale);
      html = `<p>💲 <b>Creates a Stripe payment link${amt ? ' for $' + esc(amt) : ''}</b> and writes a ready-to-send invoice email.</p><p class="ocf-tip">Only creates a real link if auto-create is on (FINANCE_AUTO_INVOICE); otherwise you'll see a preview.</p>`;
    } else {
      html = `<p>Approving runs this action through the gated executor and logs the result. You'll see exactly what happened right after.</p>`;
    }
    bodyEl.innerHTML = `<div class="ocf-what">${esc(l.rationale || l.action || 'this action')}</div>${html}`;
  }

  // ── approve / pass ──
  async function decide(id, decision, btn) {
    const resEl = el('res-' + id);
    if (btn) btn.disabled = true; if (resEl) resEl.textContent = decision === 'approve' ? 'approving…' : 'passing…';
    try {
      const r = await fetch('/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision }) });
      const d = await r.json();
      const ex = d.executed;
      let msg = decision === 'pass' ? 'passed' : '✓ approved';
      if (ex && ex.sent) msg = '✅ sent to ' + (ex.to || 'recipient');
      else if (ex && ex.action === 'email.preview') msg = '✓ approved — auto-send OFF (set GOV_AUTO_SEND=1 to send)';
      else if (ex && ex.action === 'invoice.preview') msg = '✓ approved — auto-create OFF (set FINANCE_AUTO_INVOICE=1)';
      else if (ex && ex.action === 'invoice.created') msg = '✅ payment link created';
      else if (ex && ex.ok === false) msg = '✓ approved, but: ' + (ex.reason || 'action did not complete');
      if (resEl) resEl.textContent = msg;
      setTimeout(() => { data.leads = (data.leads || []).filter((l) => l.id !== id); renderBizBar(); renderTabs(); if (tab === 'leads') renderLeads(); }, 1400);
    } catch (e) { if (resEl) resEl.textContent = 'error: ' + e.message; if (btn) btn.disabled = false; }
  }

  function reviewLead(id) {
    const l = leadById[id]; if (!l) return;
    if (l.file) return openProposal(l.file);
    if (l.noticeId) return openOppDetail(l.noticeId);
  }

  async function openProposal(file) {
    el('opsReaderCap').textContent = file;
    el('opsReaderBody').textContent = 'loading…';
    el('opsReader').hidden = false;
    try {
      const r = await fetch('/api/proposal?file=' + encodeURIComponent(file));
      const d = await r.json();
      el('opsReaderBody').textContent = d.content || d.error || '(empty)';
    } catch (e) { el('opsReaderBody').textContent = 'error: ' + e.message; }
  }

  // ── opportunity / RFP detail ──
  function renderOppDetail(d) {
    const k = oppByNotice[d.noticeId] || {};
    // cache SAM.gov estimatedValue back into the local map so Proposals tab can show it
    if (d.estimatedValue && d.noticeId && oppByNotice[d.noticeId]) oppByNotice[d.noticeId].estimatedValue = d.estimatedValue;
    const title = d.title || k.title || 'Opportunity';
    const deadline = d.deadline || k.deadline, setAside = d.setAside || k.setAside, agency = d.agency || k.agency, samUrl = d.url || k.url;
    const val = d.estimatedValue || k.estimatedValue;
    const fmtVal = (v) => v ? '💰 $' + Math.round(Number(v)).toLocaleString('en-US') : null;
    let h = `<div class="od-title">${esc(title)}</div>
      <div class="ops-meta">
        ${k.score != null ? `<span class="score ${scoreClass(k.score)}">${esc(k.score)}<small>/100</small></span>` : ''}
        ${k.recommendation ? `<span class="rec ${recClass(k.recommendation)}">${esc(k.recommendation.toUpperCase())}</span>` : ''}
        ${val ? `<span class="tag tag-val" style="font-size:13px; padding:3px 9px">${fmtVal(val)}</span>` : ''}
        ${agency ? `<span>🏛 ${esc(agency)}</span>` : ''}
        ${setAside ? `<span>🏷 ${esc(setAside)}</span>` : ''}
        ${(k.place || k.placeState) ? `<span>📍 ${esc([k.place, k.placeState].filter(Boolean).join(', '))}</span>` : ''}
        ${d.naics ? `<span>NAICS ${esc(d.naics)}</span>` : ''}
        ${deadline ? dueChip(deadline) : ''}
      </div>
      <div class="ops-actions">
        ${samUrl ? `<a class="btn ghost" href="${esc(samUrl)}" target="_blank" rel="noreferrer">View on SAM.gov ↗</a>` : ''}
        ${k.proposalFile ? `<button class="btn go" data-open="${esc(k.proposalFile)}">Open our proposal draft →</button><button class="btn" data-redraft="${esc(k.proposalFile)}">✎ Apply redraft</button><button class="btn" data-compliance="${esc(k.proposalFile)}">🛡 Compliance check</button>` : `<button class="btn go" data-pursue="${esc(d.noticeId)}">🎯 Pursue — draft a proposal</button>`}
        <span class="od-act-result" id="odActResult"></span>
      </div>`;
    if (k.proposalFile) h += '<div class="od-sec" id="odComplianceSec" hidden><div class="od-sec-h">🛡 Compliance check — before you submit</div><div id="odCompliance"></div></div>';
    h += `<div class="od-sec"><div class="od-sec-h">📎 Solicitation documents (the real RFP)</div>`;
    if (d.error) h += `<div class="ops-empty">${esc(d.error)}</div>`;
    else if (!(d.documents || []).length) h += '<div class="ops-empty">No files attached to this notice — read the requirements below or open it on SAM.gov.</div>';
    else h += '<div class="od-docs">' + d.documents.map((doc) => `<a class="od-doc" href="${esc(doc.url)}" target="_blank" rel="noreferrer">⬇ ${esc(doc.name)}</a>`).join('') + '</div>';
    h += '</div>';
    if ((d.contact || []).length) {
      h += '<div class="od-sec"><div class="od-sec-h">☎ Contracting contact</div>' + d.contact.map((c) => `<div class="od-contact">${esc(c.name || 'contact')}${c.title ? ' · ' + esc(c.title) : ''}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</div>`).join('') + '</div>';
    }
    if (d.description) h += `<div class="od-sec"><div class="od-sec-h">📋 Description &amp; requirements</div><div class="od-desc">${esc(d.description)}</div></div>`;
    // chat with the bid analyst about THIS opportunity/proposal
    curDetail = { noticeId: d.noticeId, file: k.proposalFile || null };
    h += `<div class="od-sec"><div class="od-sec-h">💬 Discuss with Patricia (bid analyst)</div>
      <div class="ag-thread" id="agThread"></div>
      <div class="ag-input"><input id="agMsg" placeholder="Ask, give feedback, or point out what's missing…" autocomplete="off"><button class="btn go" id="agSend">Send</button></div>
      <div class="ag-hint">She knows this opportunity, the draft, and our subs. ${k.proposalFile ? 'Type your edits, then tap <b>✎ Apply redraft</b> above to have her revise the proposal.' : 'Tap <b>🎯 Pursue</b> above to have her draft the proposal.'}</div>
    </div>`;
    el('oppDetailBody').innerHTML = h;
    renderChatThread();
  }
  function renderChatThread() {
    const t = el('agThread'); if (!t) return;
    t.innerHTML = agentChat.length
      ? agentChat.map((m) => `<div class="ag-msg ag-${m.role === 'agent' ? 'a' : 'u'}">${esc(m.content)}</div>`).join('')
      : '<div class=”ag-empty”>Start a conversation — e.g. &quot;does this need a sub?&quot; or &quot;the sub\'s past performance is missing.&quot;</div>';
    t.scrollTop = t.scrollHeight;
  }
  async function sendChat() {
    const inp = el('agMsg'); if (!inp) return;
    const msg = inp.value.trim(); if (!msg) return;
    inp.value = ''; agentChat.push({ role: 'user', content: msg });
    agentChat.push({ role: 'agent', content: '…' }); renderChatThread();
    try {
      const r = await fetch('/api/agent-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: curDetail.file, history: agentChat.filter((m) => m.content !== '…') }) });
      const d = await r.json();
      agentChat[agentChat.length - 1] = { role: 'agent', content: d.reply || d.error || '(no reply)' };
    } catch (e) { agentChat[agentChat.length - 1] = { role: 'agent', content: 'error: ' + e.message }; }
    renderChatThread();
  }
  async function pursueOpp(noticeId) {
    const r = el('odActResult'); if (r) r.textContent = 'drafting… (Patricia is writing the proposal)';
    try {
      const res = await fetch('/api/pursue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId, op: oppByNotice[noticeId] || null }) });
      const d = await res.json();
      if (r) r.textContent = d.ok ? '✅ drafted — find it in Proposals (review & submit)' : 'could not draft: ' + (d.error || 'try again');
    } catch (e) { if (r) r.textContent = 'error: ' + e.message; }
  }
  async function applyRedraft(file) {
    const fb = (el('agMsg') && el('agMsg').value.trim()) || (agentChat.filter((m) => m.role === 'user').slice(-1)[0] || {}).content || '';
    const r = el('odActResult'); if (r) r.textContent = 'revising the proposal with your feedback…';
    try {
      const res = await fetch('/api/redraft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file, feedback: fb }) });
      const d = await res.json();
      if (r) r.textContent = d.ok && d.saved ? '✅ proposal revised — open it to read the new version' : 'redraft failed: ' + (d.error || 'try again');
    } catch (e) { if (r) r.textContent = 'error: ' + e.message; }
  }
  async function openOppDetail(noticeId) {
    if (!noticeId) return;
    agentChat = []; // fresh conversation per opportunity
    const k = oppByNotice[noticeId] || {};
    el('oppDetailCap').textContent = k.title ? String(k.title).slice(0, 70) : 'Opportunity';
    el('oppDetailBody').innerHTML = '<div class="ops-empty">pulling the RFP from SAM.gov…</div>';
    el('oppDetail').hidden = false;
    try {
      const d = await (await fetch('/api/opp-docs?noticeId=' + encodeURIComponent(noticeId))).json();
      d.noticeId = noticeId;
      renderOppDetail(d);
    } catch (e) { el('oppDetailBody').innerHTML = `<div class="ops-empty">couldn't load: ${esc(e.message)}</div>`; }
  }

  // ── events ──
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-approve]'); if (a) return confirmApprove(a.getAttribute('data-approve'));
    const p = e.target.closest('[data-pass]'); if (p) return decide(p.getAttribute('data-pass'), 'pass', p);
    const rv = e.target.closest('[data-review]'); if (rv) return reviewLead(rv.getAttribute('data-review'));
    const o = e.target.closest('[data-open]'); if (o) return openProposal(o.getAttribute('data-open'));
    const dc = e.target.closest('[data-docs]'); if (dc) return openOppDetail(dc.getAttribute('data-docs'));
    const ob = e.target.closest('[data-opp-btn]'); if (ob) return openOppDetail(ob.getAttribute('data-opp-btn'));
    const so = e.target.closest('[data-sub-open]'); if (so) return openSubDetail(so.getAttribute('data-sub-open'));
    const sub = e.target.closest('.ops-card[data-sub]'); if (sub) return openSubDetail(sub.getAttribute('data-sub'));
    const card = e.target.closest('.opp.clickable[data-opp]'); if (card) return openOppDetail(card.getAttribute('data-opp'));
    const ep = e.target.closest('[data-email-prop]'); if (ep) return openEmail(ep.getAttribute('data-email-prop'), ep.getAttribute('data-email-notice') || '');
    const rmTicker = e.target.closest('[data-rm-ticker]');
    if (rmTicker) {
      const ticker = rmTicker.getAttribute('data-rm-ticker');
      if (!confirm(`Remove ${ticker} from watchlist?`)) return;
      fetch('/api/market/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', ticker }) })
        .then((r) => r.json()).then(() => { tradeData = null; renderWatchlist(); }).catch(() => {});
      return;
    }
    const closePos = e.target.closest('[data-close-pos]');
    if (closePos) {
      const id = closePos.getAttribute('data-close-pos');
      if (!confirm('Mark this position as closed?')) return;
      fetch('/api/market/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close', position: { id } }) })
        .then((r) => r.json()).then(() => { tradeData = null; renderPositions(); }).catch(() => {});
      return;
    }
    const wsBtn = e.target.closest('[data-ws-status]');
    if (wsBtn) {
      const [id, status] = wsBtn.getAttribute('data-ws-status').split(':');
      fetch('/api/web-studio/project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
        .then((r) => r.json()).then(() => { wsData = null; render(); }).catch(() => {});
      return;
    }
    // ── real estate: add / save / cancel a property ──
    const reAdd = e.target.closest('[data-re-add]');
    if (reAdd) {
      const t = reAdd.getAttribute('data-re-add'); const f = el('reAddForm-' + t);
      if (f) { f.hidden = !f.hidden; if (!f.hidden) { const fi = f.querySelector('.re-f'); if (fi) fi.focus(); } }
      return;
    }
    const reCancel = e.target.closest('[data-re-cancel]');
    if (reCancel) { const f = el('reAddForm-' + reCancel.getAttribute('data-re-cancel')); if (f) f.hidden = true; return; }
    const reSave = e.target.closest('[data-re-save]');
    if (reSave) return submitRE(reSave.getAttribute('data-re-save'));
    // ── web studio: new 3D site ──
    const wsAdd = e.target.closest('[data-ws-add]');
    if (wsAdd) { const f = el('wsAddForm'); if (f) { f.hidden = !f.hidden; if (!f.hidden) { const fi = f.querySelector('.wsf'); if (fi) fi.focus(); } } return; }
    const wsCancel = e.target.closest('[data-ws-cancel]');
    if (wsCancel) { const f = el('wsAddForm'); if (f) f.hidden = true; return; }
    const wsSave = e.target.closest('[data-ws-save]');
    if (wsSave) return submitWS();
    // ── agents: run a task / approve-discard a gated draft ──
    const agRun = e.target.closest('[data-agent][data-task]');
    if (agRun) return runAgentTask(agRun.getAttribute('data-agent'), agRun.getAttribute('data-task'));
    const dApprove = e.target.closest('[data-draft-approve]');
    if (dApprove) {
      fetch('/api/agent/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: dApprove.getAttribute('data-draft-approve'), action: 'approve' }) })
        .then((r) => r.json()).then(() => renderAgentQueue()).catch(() => {});
      return;
    }
    const dDiscard = e.target.closest('[data-draft-discard]');
    if (dDiscard) {
      fetch('/api/agent/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: dDiscard.getAttribute('data-draft-discard'), action: 'discard' }) })
        .then((r) => r.json()).then(() => renderAgentQueue()).catch(() => {});
      return;
    }
    // ── paper trading: predict / open / close (simulation only) ──
    const predAll = e.target.closest('[data-predict-all]');
    if (predAll) {
      predAll.disabled = true; predAll.textContent = 'predicting…';
      fetch('/api/market/predict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
        .then((r) => r.json()).then(() => { paperData = null; loadPaper(); }).catch(() => { predAll.disabled = false; predAll.textContent = 'Predict watchlist →'; });
      return;
    }
    const pFrom = e.target.closest('[data-paper-from]');
    if (pFrom) {
      const [, ticker, side] = pFrom.getAttribute('data-paper-from').split(':');
      pFrom.disabled = true;
      fetch('/api/market/paper/trade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker, side, qty: 10 }) })
        .then((r) => r.json()).then(() => { tab = 'paper'; renderTabs(); paperData = null; loadPaper(); }).catch(() => { pFrom.disabled = false; });
      return;
    }
    const pClose = e.target.closest('[data-paper-close]');
    if (pClose) {
      pClose.disabled = true;
      fetch('/api/market/paper/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pClose.getAttribute('data-paper-close') }) })
        .then((r) => r.json()).then(() => { paperData = null; loadPaper(); }).catch(() => { pClose.disabled = false; });
      return;
    }
    // ── music: identity / generate / release (publishing gated) ──
    const msSave = e.target.closest('[data-ms-save]');
    if (msSave) {
      const data = {}; body.querySelectorAll('.ms-f').forEach((i) => { data[i.getAttribute('data-ms')] = i.value.trim(); });
      const msg = el('msIdMsg'); if (msg) msg.textContent = 'saving…';
      fetch('/api/music/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then((r) => r.json()).then(() => { if (msg) msg.textContent = 'saved'; musicData = null; }).catch(() => { if (msg) msg.textContent = 'error'; });
      return;
    }
    const msGen = e.target.closest('[data-ms-generate]');
    if (msGen) {
      const brief = (el('msBrief') || {}).value ? el('msBrief').value.trim() : '';
      const msg = el('msGenMsg');
      if (!brief) { if (msg) msg.textContent = 'write a brief first'; return; }
      msGen.disabled = true; if (msg) msg.textContent = 'writing…';
      fetch('/api/music/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: brief }) })
        .then((r) => r.json()).then((d) => { if (d.error) { if (msg) msg.textContent = d.error; msGen.disabled = false; return; } musicData = null; renderMusicStudio(); })
        .catch(() => { if (msg) msg.textContent = 'error'; msGen.disabled = false; });
      return;
    }
    const msRel = e.target.closest('[data-ms-release]');
    if (msRel) {
      fetch('/api/music/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: msRel.getAttribute('data-ms-release') }) })
        .then((r) => r.json()).then(() => { tab = 'releases'; renderTabs(); musicData = null; renderMusicReleases(); }).catch(() => {});
      return;
    }
    const msApprove = e.target.closest('[data-ms-rel-approve]');
    if (msApprove) {
      fetch('/api/music/release/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msApprove.getAttribute('data-ms-rel-approve'), action: 'approve' }) })
        .then((r) => r.json()).then(() => { musicData = null; renderMusicReleases(); }).catch(() => {});
      return;
    }
    const msDiscard = e.target.closest('[data-ms-rel-discard]');
    if (msDiscard) {
      fetch('/api/music/release/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: msDiscard.getAttribute('data-ms-rel-discard'), action: 'discard' }) })
        .then((r) => r.json()).then(() => { musicData = null; renderMusicReleases(); }).catch(() => {});
      return;
    }
  });
  // Enter inside an add-form field saves it
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('re-f')) return;
    const form = e.target.closest('.re-add-form'); if (!form) return;
    const saveBtn = form.querySelector('[data-re-save]'); if (saveBtn) { e.preventDefault(); submitRE(saveBtn.getAttribute('data-re-save')); }
  });
  // ── WEB STUDIO (Lovable + Vercel client projects) ────────────────────────────
  const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const WS_STATUS_COLOR = { scoping: 'mid', building: 'mid', review: 'warn', deployed: 'go', invoiced: 'warn', paid: 'go' };
  const WS_STATUS_LABEL = { scoping: 'Scoping', building: 'Building', review: 'Review', deployed: 'Live', invoiced: 'Invoiced', paid: 'Paid ✓' };
  let wsData = null;
  async function loadWS() {
    if (biz !== 'webstudio') return;
    body.innerHTML = '<div class="ops-empty">loading web studio…</div>';
    try { wsData = await fetch('/api/web-studio').then((r) => r.json()); render(); }
    catch (e) { body.innerHTML = `<div class="ops-empty">web studio offline — ${esc(e.message)}</div>`; }
  }
  function wsCard(p) {
    const sc = WS_STATUS_COLOR[p.status] || 'mid';
    const sl = WS_STATUS_LABEL[p.status] || p.status;
    const links = [
      p.lovableUrl ? `<a href="${esc(p.lovableUrl)}" target="_blank" class="ops-link">Lovable ↗</a>` : '',
      p.githubRepo ? `<a href="${esc(p.githubRepo)}" target="_blank" class="ops-link">GitHub ↗</a>` : '',
      p.vercelUrl  ? `<a href="${esc(p.vercelUrl)}"  target="_blank" class="ops-link">Vercel ↗</a>`  : '',
      p.customDomain ? `<a href="https://${esc(p.customDomain)}" target="_blank" class="ops-link">${esc(p.customDomain)} ↗</a>` : '',
    ].filter(Boolean).join(' ');
    const nextBtn = p.status === 'scoping'   ? `<button class="btn sm go" data-ws-status="${p.id}:building">Start Build</button>` :
                    p.status === 'building'  ? `<button class="btn sm go" data-ws-status="${p.id}:review">Send for Review</button>` :
                    p.status === 'review'    ? `<button class="btn sm go" data-ws-status="${p.id}:deployed">Mark Live</button>` :
                    p.status === 'deployed'  ? `<button class="btn sm go" data-ws-status="${p.id}:invoiced">Send Invoice</button>` :
                    p.status === 'invoiced'  ? `<button class="btn sm go" data-ws-status="${p.id}:paid">Mark Paid</button>` : '';
    return `<div class="re-card">
      <div class="re-card-head">
        <div class="re-card-addr">${esc(p.client)}</div>
        <div class="re-card-type"><span class="re-hap-${sc === 'go' ? 'ok' : 'pend'}">${sl}</span></div>
      </div>
      <div class="re-row">Type <span>${esc(p.type || '—')}</span></div>
      <div class="re-row">Price <span style="color:var(--teal);font-weight:600">${money(p.price || 0)}</span></div>
      ${p.deadline ? `<div class="re-row">Deadline <span>${esc(p.deadline)}</span></div>` : ''}
      ${links ? `<div class="re-row" style="gap:8px;flex-wrap:wrap">${links}</div>` : ''}
      ${p.notes ? `<div class="re-row">Notes <span style="color:var(--dim)">${esc(p.notes)}</span></div>` : ''}
      ${nextBtn ? `<div style="margin-top:10px">${nextBtn}</div>` : ''}
    </div>`;
  }
  // Every new site defaults to the fully-3D starter (prompts/web-studio-spec.md).
  function wsAddBar() {
    return `<div class="re-add">
      <button class="re-add-btn" data-ws-add="1">+ New 3D site</button>
      <div class="re-add-form" id="wsAddForm" hidden>
        <div class="re-add-grid">
          <input class="re-f wsf" data-wsf="client" placeholder="Client / project name" style="grid-column:1/-1">
          <input class="re-f wsf" data-wsf="price" type="number" placeholder="Price $">
          <input class="re-f wsf" data-wsf="deadline" placeholder="Deadline (optional)">
        </div>
        <div class="re-add-acts">
          <button class="re-save" data-ws-save="1">Create</button>
          <button class="re-cancel" data-ws-cancel="1">Cancel</button>
          <span class="re-add-msg" id="wsAddMsg">fully 3D · React Three Fiber starter</span>
        </div>
      </div>
    </div>`;
  }
  async function submitWS() {
    const f = el('wsAddForm'); if (!f) return;
    const get = (k) => { const i = f.querySelector(`[data-wsf="${k}"]`); return i ? i.value.trim() : ''; };
    const client = get('client');
    const msg = el('wsAddMsg');
    if (!client) { if (msg) msg.textContent = 'client / project name required'; return; }
    if (msg) msg.textContent = 'creating…';
    const data = {
      client,
      type: '3D immersive site',
      stack: 'React Three Fiber (web-templates/3d-starter)',
      price: Number(get('price')) || 0,
      deadline: get('deadline'),
      notes: 'Fully 3D — scaffold from web-templates/3d-starter per web-studio-spec.md',
    };
    try {
      const r = await fetch('/api/web-studio/project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error('create failed');
      wsData = null; loadWS();
    } catch (e) { if (msg) msg.textContent = 'error: ' + esc(e.message); }
  }
  function renderWSProjects() {
    if (!wsData) { loadWS(); return; }
    const active = (wsData.projects || []).filter((p) => !['paid'].includes(p.status));
    const head = active.length
      ? `<div class="ops-explain" style="margin-bottom:12px"><b>🌐 Web Studio</b> — ${active.length} active project${active.length !== 1 ? 's' : ''} · every site ships fully 3D</div>` + active.map(wsCard).join('')
      : `<div class="ops-explain" style="margin-bottom:12px"><b>🌐 Web Studio</b><br>No active projects yet. Every new site starts from the fully-3D starter — add one below.</div>`;
    body.innerHTML = wsAddBar() + head;
  }
  function renderWSSites() {
    if (!wsData) { loadWS(); return; }
    const sites = (wsData.projects || []).filter((p) => ['deployed', 'invoiced', 'paid'].includes(p.status));
    if (!sites.length) { body.innerHTML = `<div class="ops-explain"><b>🌐 Live Sites</b><br>No deployed sites yet — move a project to Live to see it here.</div>`; return; }
    body.innerHTML = `<div class="ops-explain" style="margin-bottom:12px"><b>🌐 Live Sites</b> — ${sites.length} site${sites.length !== 1 ? 's' : ''}</div>` + sites.map(wsCard).join('');
  }
  function renderWSClients() {
    if (!wsData) { loadWS(); return; }
    const projects = wsData.projects || [];
    const map = {};
    projects.forEach((p) => {
      if (!map[p.client]) map[p.client] = { name: p.client, projects: [], total: 0, paid: 0 };
      map[p.client].projects.push(p);
      map[p.client].total += (p.price || 0);
      if (p.status === 'paid') map[p.client].paid += (p.price || 0);
    });
    const clients = Object.values(map);
    if (!clients.length) { body.innerHTML = `<div class="ops-explain"><b>👥 Clients</b><br>No clients yet.</div>`; return; }
    body.innerHTML = clients.map((c) => `<div class="re-card">
      <div class="re-card-head"><div class="re-card-addr">${esc(c.name)}</div><div class="re-card-type">${c.projects.length} project${c.projects.length !== 1 ? 's' : ''}</div></div>
      <div class="re-row">Total billed <span style="color:var(--teal);font-weight:600">${money(c.total)}</span></div>
      <div class="re-row">Collected <span style="color:var(--teal)">${money(c.paid)}</span></div>
      <div class="re-row" style="gap:6px;flex-wrap:wrap">${c.projects.map((p) => `<span class="re-hap-${['go'].includes(WS_STATUS_COLOR[p.status]) ? 'ok' : 'pend'}">${esc(p.type || p.status)}</span>`).join('')}</div>
    </div>`).join('');
  }
  function renderWSPipeline() {
    if (!wsData) { loadWS(); return; }
    const ps = wsData.projects || [];
    const total      = ps.reduce((s, p) => s + (p.price || 0), 0);
    const collected  = ps.filter((p) => p.status === 'paid').reduce((s, p) => s + (p.price || 0), 0);
    const outstanding = ps.filter((p) => p.status === 'invoiced').reduce((s, p) => s + (p.price || 0), 0);
    const inProgress = ps.filter((p) => ['scoping', 'building', 'review', 'deployed'].includes(p.status)).reduce((s, p) => s + (p.price || 0), 0);
    body.innerHTML = `<div class="re-card">
      <div class="re-card-head"><div class="re-card-addr">💰 Revenue Pipeline</div></div>
      <div class="re-row">Total billed <span style="color:var(--teal);font-weight:600">${money(total)}</span></div>
      <div class="re-row">Collected <span style="color:var(--teal)">${money(collected)}</span></div>
      <div class="re-row">Outstanding <span style="color:var(--warn)">${money(outstanding)}</span></div>
      <div class="re-row">In progress <span>${money(inProgress)}</span></div>
    </div>` + (ps.length ? `<div class="re-card"><div class="re-card-head"><div class="re-card-addr">All Projects</div></div>` +
      ps.map((p) => `<div class="re-row"><span class="re-hap-${WS_STATUS_COLOR[p.status] === 'go' ? 'ok' : 'pend'}">${WS_STATUS_LABEL[p.status] || p.status}</span><span style="flex:1;margin:0 8px">${esc(p.client)} · ${esc(p.type || '')}</span><b style="color:var(--teal)">${money(p.price || 0)}</b></div>`).join('') + `</div>` : '');
  }

  el('oppDetailBody').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o) return openProposal(o.getAttribute('data-open'));
    const pu = e.target.closest('[data-pursue]'); if (pu) return pursueOpp(pu.getAttribute('data-pursue'));
    const rd = e.target.closest('[data-redraft]'); if (rd) return applyRedraft(rd.getAttribute('data-redraft'));
    const cc = e.target.closest('[data-compliance]'); if (cc) return runCompliance(cc.getAttribute('data-compliance'));
    const rs = e.target.closest('[data-reach]'); if (rs) return reachSub(rs.getAttribute('data-reach'));
    if (e.target.closest('#agSend')) return sendChat();
  });
  el('oppDetailBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'agMsg') { e.preventDefault(); sendChat(); } });
  // business switcher + tabs (delegated, since both bars are re-rendered)
  el('opsBiz').addEventListener('click', (e) => {
    const b = e.target.closest('[data-biz]'); if (!b) return;
    biz = b.getAttribute('data-biz'); tab = curBiz().tabs[0];
    renderBizBar(); renderTabs(); render();
  });
  el('opsTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    tab = t.getAttribute('data-tab'); renderTabs(); render();
  });

  function open() { ops.hidden = false; load(); }
  function close() { ops.hidden = true; }
  // Exposed so the Map view can drill straight into an opportunity's full detail (RFP docs + actions).
  window.JarvisOps = {
    async openOpportunity(noticeId) {
      if (!noticeId) return;
      const mv = el('mapView'); if (mv) mv.hidden = true;
      ops.hidden = false;
      if (!Object.keys(oppByNotice).length) { try { await load(); } catch { /* */ } }
      biz = 'gov'; tab = 'opps'; renderBizBar(); renderTabs(); render();
      openOppDetail(noticeId);
    },
  };
  el('opsBtn').addEventListener('click', open);
  el('opsX').addEventListener('click', close);
  el('opsRefresh').addEventListener('click', load);
  el('opsReaderX').addEventListener('click', () => { el('opsReader').hidden = true; });
  el('oppDetailX').addEventListener('click', () => { el('oppDetail').hidden = true; });
  el('emailPanelX').addEventListener('click', () => { el('emailPanel').hidden = true; el('emailCompose').innerHTML = ''; });
  el('opsConfirmCancel').addEventListener('click', () => { el('opsConfirm').hidden = true; pendingApproveId = null; });
  el('opsConfirmGo').addEventListener('click', () => { const id = pendingApproveId; el('opsConfirm').hidden = true; pendingApproveId = null; if (id) decide(id, 'approve'); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || ops.hidden) return;
    if (!el('opsConfirm').hidden) { el('opsConfirm').hidden = true; pendingApproveId = null; }
    else if (!el('emailPanel').hidden) el('emailPanel').hidden = true;
    else if (!el('opsReader').hidden) el('opsReader').hidden = true;
    else if (!el('oppDetail').hidden) el('oppDetail').hidden = true;
    else close();
  });
})();
