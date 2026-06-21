// JARVIS — Command Center. Cinematic wall display: animated CORE, live KPI tiles (clickable),
// agent roster (clickable), connectors, running clock, voice briefing.
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const stateColor = (st) => (/work|busy|scan|draft|need/i.test(st || '') ? 'var(--teal)' : /error/i.test(st || '') ? 'var(--err)' : 'var(--dim)');
  let raf = null, clockT = null, data = {};

  // ── animated CORE (particle sphere) ─────────────────────────────────────────
  function teal() { const v = getComputedStyle(document.documentElement).getPropertyValue('--teal-rgb').trim(); return v || '57,224,208'; }
  function coreStyle() { try { return localStorage.getItem('jarvis-core') || 'sphere'; } catch { return 'sphere'; } }
  function startCore() {
    const cv = el('cmdCore'); if (!cv) return;
    const ctx = cv.getContext('2d');
    let W, H, DPR = Math.min(2, window.devicePixelRatio || 1);
    function size() { const r = cv.getBoundingClientRect(); W = cv.width = Math.max(120, r.width * DPR); H = cv.height = Math.max(120, r.height * DPR); }
    size();
    const N = 520, pts = [];
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2; const rad = Math.sqrt(1 - y * y); const th = i * 2.399963; pts.push([Math.cos(th) * rad, y, Math.sin(th) * rad]); }
    let a = 0;
    function sphere(rgb, t) {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
      const pulse = 1 + Math.sin(t * 1.4) * 0.04, cos = Math.cos(a), sin = Math.sin(a);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, `rgba(${rgb},0.34)`); g.addColorStop(0.4, `rgba(${rgb},0.10)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, 7); ctx.fill();
      for (const p of pts) {
        const x = p[0] * cos - p[2] * sin, z = p[0] * sin + p[2] * cos, y = p[1];
        const depth = (z + 1) / 2, px = cx + x * R * pulse, py = cy + y * R * pulse, r = (0.6 + depth * 1.9) * DPR, al = 0.18 + depth * 0.72;
        ctx.beginPath(); ctx.fillStyle = `rgba(${rgb},${al.toFixed(3)})`; ctx.arc(px, py, r, 0, 7); ctx.fill();
      }
      ctx.beginPath(); ctx.fillStyle = `rgba(${rgb},${(0.5 + Math.sin(t * 2) * 0.12).toFixed(3)})`; ctx.arc(cx, cy, 3 * DPR * pulse, 0, 7); ctx.fill();
    }
    function burst(t) {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42, bolts = 18;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < bolts; i++) {
        const ang = (i / bolts) * Math.PI * 2 + t * 0.12, hue = (i * 20 + t * 45) % 360;
        ctx.strokeStyle = `hsla(${hue},92%,62%,0.65)`; ctx.lineWidth = 1.4 * DPR; ctx.shadowBlur = 14 * DPR; ctx.shadowColor = `hsl(${hue},92%,60%)`;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        const segs = 9, len = R * (0.55 + 0.45 * Math.abs(Math.sin(t * 1.6 + i)));
        for (let s = 1; s <= segs; s++) { const f = s / segs, aa = ang + Math.sin(t * 8 + i * 3 + s) * 0.17; ctx.lineTo(cx + Math.cos(aa) * len * f, cy + Math.sin(aa) * len * f); }
        ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55);
      cg.addColorStop(0, `hsla(${(t * 60) % 360},92%,78%,0.9)`); cg.addColorStop(0.5, `hsla(${(t * 60 + 140) % 360},92%,62%,0.22)`); cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, 7); ctx.fill();
    }
    function frame() {
      const t = Date.now() / 1000; ctx.clearRect(0, 0, W, H);
      if (coreStyle() === 'burst') burst(t); else { a += 0.0042; sphere(teal(), t); }
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener('resize', size);
    frame();
  }
  function stopCore() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function clock12() { try { return localStorage.getItem('jarvis-clock') !== '24'; } catch { return true; } }
  function clock() {
    const c = el('cmdClock'); if (!c) return;
    const d = new Date();
    c.textContent = d.toLocaleTimeString('en-US', { hour12: clock12() }) + '  ·  ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async function load() {
    const j = (p) => fetch(p).then((r) => r.json()).catch(() => ({}));
    const [dash, ops, floor, conn] = await Promise.all([j('/api/dashboard'), j('/api/operations'), j('/api/floor'), j('/api/connectors')]);
    data = { dash, ops, floor, conn };
    render();
  }

  // ── navigate from a tile click — close command center, open the right view ──
  function navTo(btnId, tab) {
    close();
    setTimeout(() => {
      const b = document.getElementById(btnId);
      if (b) b.click();
      if (tab) setTimeout(() => {
        const t = document.querySelector(`[data-tab="${tab}"]`);
        if (t) t.click();
      }, 120);
    }, 80);
  }

  function render() {
    const dash = data.dash || {}, ops = data.ops || {}, floor = data.floor || {}, conn = data.conn || {};
    const leads = (ops.leads || []).length, opps = (ops.opportunities || []).length;
    const props = (ops.proposals || []).length, crm = (ops.crm || []).length;
    // FIX: dash.spend is an object {total, today} — extract correctly
    const aiSpend = (dash.spend && dash.spend.total) || 0;
    const aiToday = (dash.spend && dash.spend.today) || 0;
    const income = (dash.hq && dash.hq.earned) || 0;
    const net = income - aiSpend;

    const tiles = [
      { k: 'Lifetime banked', v: money(income), sub: 'from HQ floor', btnId: 'hqBtn' },
      { k: 'Net (income − AI)', v: money(net), sub: net < 0 ? 'AI running ahead of income' : 'income minus AI cost', btnId: 'hqBtn' },
      { k: 'AI spend', v: money(aiSpend), sub: `today ${money(aiToday)}`, btnId: 'dashBtn' },
      { k: 'Opportunities', v: opps, sub: 'scored on SAM.gov', btnId: 'opsBtn', tab: 'opps' },
      { k: 'Needs you', v: leads, warn: leads > 0, sub: leads > 0 ? 'waiting on approval' : 'queue clear', btnId: 'opsBtn', tab: 'leads' },
      { k: 'Proposals ready', v: props, sub: 'drafted & ready to send', btnId: 'opsBtn', tab: 'props' },
      { k: 'Subcontractors', v: crm, sub: 'in CRM', btnId: 'opsBtn', tab: 'crm' },
      { k: 'Pipeline value', v: estPipeline(ops), sub: 'bid-worthy opps × avg', btnId: 'opsBtn', tab: 'opps' },
    ];

    el('cmdKpis').innerHTML = tiles.map((t) => `
      <button class="cmd-tile${t.warn ? ' warn' : ''}" data-btn="${esc(t.btnId || '')}" data-tab="${esc(t.tab || '')}" title="Click to open ${esc(t.k)}">
        <div class="cmd-tile-k">${esc(t.k)}</div>
        <div class="cmd-tile-v">${esc(t.v)}</div>
        ${t.sub ? `<div class="cmd-tile-sub">${esc(t.sub)}</div>` : ''}
      </button>`).join('');

    // tile clicks
    el('cmdKpis').querySelectorAll('.cmd-tile[data-btn]').forEach((btn) => {
      btn.addEventListener('click', () => navTo(btn.dataset.btn, btn.dataset.tab || ''));
    });

    // agent roster — clickable, navigates to their pod in the floor view
    const people = [];
    for (const r of (floor.rooms || [])) for (const p of (r.people || [])) people.push({ ...p, pod: r.label, podId: r.id });
    const active = people.filter((p) => p.state && p.state !== 'idle').length;
    el('cmdRoster').innerHTML = `<div class="cmd-panel-h">Agents <span class="cmd-dim">${active}/${people.length} active</span></div>` +
      (people.length ? people.map((p) => `
        <button class="cmd-agent" data-pod="${esc(p.podId || '')}" title="${esc(p.title || p.pod || '')} — click to see floor">
          <span class="cmd-dot" style="background:${stateColor(p.state)}"></span>
          <span class="cmd-ag-n">${esc(p.nickname || p.codename || '')}</span>
          <span class="cmd-ag-t">${esc(p.title || p.pod || '')}</span>
        </button>`).join('') : '<div class="cmd-dim">roster offline</div>');

    // agent clicks → open floor view
    el('cmdRoster').querySelectorAll('.cmd-agent[data-pod]').forEach((btn) => {
      btn.addEventListener('click', () => {
        close();
        setTimeout(() => {
          const floorBtn = document.getElementById('floorBtn');
          if (floorBtn) floorBtn.click();
        }, 80);
      });
    });

    el('cmdConnectors').innerHTML = '<div class="cmd-panel-h">Connectors</div>' +
      (conn.connectors || []).map((c) => `<div class="cmd-conn"><span class="cmd-dot" style="background:${c.on ? 'var(--teal)' : 'var(--dim)'}"></span>${esc(c.name)}</div>`).join('');

    const feed = (dash.feed || (floor.feed || [])).slice(0, 8);
    el('cmdFeed').innerHTML = feed.length
      ? feed.map((f) => `<span class="cmd-feed-i">▸ ${esc(typeof f === 'string' ? f : (f.text || f.s || f.note || f.action || ''))}</span>`).join('')
      : '<span class="cmd-dim">no recent activity</span>';
  }

  function estPipeline(ops) {
    const bids = (ops.opportunities || []).filter((o) => /bid/i.test(o.recommendation || '')).length;
    return bids ? '~' + money(bids * 40000) : '$0';
  }

  async function brief() {
    if (!data.ops) { try { await load(); } catch { /* */ } }
    const dash = data.dash || {}, ops = data.ops || {};
    const h = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    const leads = (ops.leads || []).length, opps = (ops.opportunities || []).length, props = (ops.proposals || []).length;
    const aiSpend = (dash.spend && dash.spend.total) || 0;
    const income = (dash.hq && dash.hq.earned) || 0;
    const txt = `Good ${part}, sir. ${opps} opportunities are scored, ${props} proposals are ready, and ${leads} ${leads === 1 ? 'item needs' : 'items need'} your approval. Net is ${money(income - aiSpend)}. Standing by.`;
    speak(txt);
    const banner = el('cmdBriefText'); if (banner) banner.textContent = txt;
  }

  async function speak(text) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok && (r.headers.get('content-type') || '').includes('audio')) { const b = await r.blob(); const au = new Audio(URL.createObjectURL(b)); au.play(); return; }
    } catch { /* fall through */ }
    try { const u = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no voice */ }
  }

  function open() { el('commandView').hidden = false; startCore(); clock(); clockT = setInterval(clock, 1000); load(); }
  function close() { el('commandView').hidden = true; stopCore(); if (clockT) clearInterval(clockT); }

  el('commandBtn').addEventListener('click', open);
  el('commandX').addEventListener('click', close);
  el('commandRefresh').addEventListener('click', load);
  el('cmdBrief').addEventListener('click', brief);

  const full = el('cmdFull');
  if (full) full.addEventListener('click', () => { const v = el('commandView'); if (!document.fullscreenElement) { (v.requestFullscreen || v.webkitRequestFullscreen || function () {}).call(v); } else { (document.exitFullscreen || function () {}).call(document); } });

  const castBtn = el('cmdCast');
  if (castBtn) {
    castBtn.addEventListener('click', async () => {
      castBtn.textContent = '📡 Scanning...'; castBtn.disabled = true;
      try {
        const d = await fetch('/api/tv/discover').then((r) => r.json());
        if (!d.tvs || !d.tvs.length) { castBtn.textContent = '📺 No TV found'; setTimeout(() => { castBtn.textContent = '📺 Cast'; castBtn.disabled = false; }, 3500); return; }
        const tv = d.tvs[0];
        castBtn.textContent = `📡 Casting to ${tv.brand}...`;
        const castUrl = (d.serverUrl || window.location.origin) + '/';
        const r = await fetch('/api/tv/cast', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tv, url: castUrl }) }).then((r) => r.json());
        castBtn.textContent = r.ok ? `📺 Live on ${(tv.brand || '').toUpperCase()}` : '📺 Cast failed';
        setTimeout(() => { castBtn.textContent = '📺 Cast'; castBtn.disabled = false; }, 5000);
      } catch { castBtn.textContent = '📺 Cast failed'; setTimeout(() => { castBtn.textContent = '📺 Cast'; castBtn.disabled = false; }, 3500); }
    });
  }

  if (/[?&]cmd=1/.test(window.location.search)) open();
  window.JarvisCommand = { open, close, brief };

  setInterval(() => {
    try {
      if (localStorage.getItem('jarvis-brief-off') === '1') return;
      const hr = Number(localStorage.getItem('jarvis-brief-hour')); const want = isNaN(hr) ? 8 : hr;
      const now = new Date(), key = now.toISOString().slice(0, 10);
      if (now.getHours() === want && localStorage.getItem('jarvis-last-brief') !== key) { localStorage.setItem('jarvis-last-brief', key); open(); brief(); }
    } catch { /* */ }
  }, 60000);

  const coreBtn = el('coreStyleBtn');
  function paintCore() { if (coreBtn) coreBtn.textContent = '◉ Core: ' + (coreStyle() === 'burst' ? 'neural burst' : 'sphere'); }
  if (coreBtn) { paintCore(); coreBtn.addEventListener('click', () => { try { localStorage.setItem('jarvis-core', coreStyle() === 'burst' ? 'sphere' : 'burst'); } catch { /* */ } paintCore(); }); }
  const baBtn = el('briefAutoBtn');
  function paintBA() { if (baBtn) baBtn.textContent = '🔊 Morning briefing: ' + (localStorage.getItem('jarvis-brief-off') === '1' ? 'off' : 'on'); }
  if (baBtn) { paintBA(); baBtn.addEventListener('click', () => { try { localStorage.setItem('jarvis-brief-off', localStorage.getItem('jarvis-brief-off') === '1' ? '0' : '1'); } catch { /* */ } paintBA(); }); }
  const clkBtn = el('clockBtn');
  function paintClock() { if (clkBtn) clkBtn.textContent = '🕛 Clock: ' + (clock12() ? '12-hour' : '24-hour'); }
  if (clkBtn) { paintClock(); clkBtn.addEventListener('click', () => { try { localStorage.setItem('jarvis-clock', clock12() ? '24' : '12'); } catch { /* */ } paintClock(); clock(); }); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('commandView').hidden && !document.fullscreenElement) close(); });
})();
