// JARVIS — Command Center. The cinematic "wall display": an animated glowing CORE (particle sphere) at the
// center, live KPI tiles, the agent roster with live status, a connectors panel, a running clock, and a
// voice briefing — all wired to REAL data (/api/dashboard, /api/operations, /api/floor, /api/connectors).
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const stateColor = (st) => (/work|busy|scan|draft|need/i.test(st || '') ? 'var(--teal)' : /error/i.test(st || '') ? 'var(--err)' : 'var(--dim)');
  let raf = null, clockT = null, data = {};

  // ── the animated CORE (particle sphere) ──────────────────────────────────────────────
  function teal() { const v = getComputedStyle(document.documentElement).getPropertyValue('--teal-rgb').trim(); return v || '57,224,208'; }
  function startCore() {
    const cv = el('cmdCore'); if (!cv) return;
    const ctx = cv.getContext('2d');
    let W, H, DPR = Math.min(2, window.devicePixelRatio || 1);
    function size() { const r = cv.getBoundingClientRect(); W = cv.width = Math.max(120, r.width * DPR); H = cv.height = Math.max(120, r.height * DPR); }
    size();
    const N = 520, pts = [];
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2; const rad = Math.sqrt(1 - y * y); const th = i * 2.399963; pts.push([Math.cos(th) * rad, y, Math.sin(th) * rad]); }
    let a = 0;
    function frame() {
      const rgb = teal(); a += 0.0042; const t = Date.now() / 1000;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36;
      const pulse = 1 + Math.sin(t * 1.4) * 0.04;
      const cos = Math.cos(a), sin = Math.sin(a);
      // core glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, `rgba(${rgb},0.34)`); g.addColorStop(0.4, `rgba(${rgb},0.10)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, 7); ctx.fill();
      for (const p of pts) {
        const x = p[0] * cos - p[2] * sin, z = p[0] * sin + p[2] * cos, y = p[1];
        const depth = (z + 1) / 2; const px = cx + x * R * pulse, py = cy + y * R * pulse;
        const r = (0.6 + depth * 1.9) * DPR; const al = 0.18 + depth * 0.72;
        ctx.beginPath(); ctx.fillStyle = `rgba(${rgb},${al.toFixed(3)})`; ctx.arc(px, py, r, 0, 7); ctx.fill();
      }
      // bright center
      ctx.beginPath(); ctx.fillStyle = `rgba(${rgb},${(0.5 + Math.sin(t * 2) * 0.12).toFixed(3)})`; ctx.arc(cx, cy, 3 * DPR * pulse, 0, 7); ctx.fill();
      raf = requestAnimationFrame(frame);
    }
    window.addEventListener('resize', size);
    frame();
  }
  function stopCore() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function clock() {
    const c = el('cmdClock'); if (!c) return;
    const d = new Date();
    c.textContent = d.toLocaleTimeString('en-US', { hour12: false }) + '  ·  ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async function load() {
    const j = (p) => fetch(p).then((r) => r.json()).catch(() => ({}));
    const [dash, ops, floor, conn] = await Promise.all([j('/api/dashboard'), j('/api/operations'), j('/api/floor'), j('/api/connectors')]);
    data = { dash, ops, floor, conn };
    render();
  }

  function render() {
    const dash = data.dash || {}, ops = data.ops || {}, floor = data.floor || {}, conn = data.conn || {};
    const leads = (ops.leads || []).length, opps = (ops.opportunities || []).length, props = (ops.proposals || []).length, crm = (ops.crm || []).length;
    const tiles = [
      { k: 'Lifetime banked', v: money(dash.income || (dash.hq && dash.hq.earned) || 0) },
      { k: 'Net (income − AI)', v: money(dash.net || 0) },
      { k: 'AI spend', v: money(dash.spend || 0) },
      { k: 'Opportunities', v: opps },
      { k: 'Needs you', v: leads, warn: leads > 0 },
      { k: 'Proposals ready', v: props },
      { k: 'Subcontractors', v: crm },
      { k: 'Pipeline value', v: estPipeline(ops) },
    ];
    el('cmdKpis').innerHTML = tiles.map((t) => `<div class="cmd-tile"><div class="cmd-tile-k">${esc(t.k)}</div><div class="cmd-tile-v${t.warn ? ' warn' : ''}">${esc(t.v)}</div></div>`).join('');

    const people = [];
    for (const r of (floor.rooms || [])) for (const p of (r.people || [])) people.push({ ...p, pod: r.label });
    const active = people.filter((p) => p.state && p.state !== 'idle').length;
    el('cmdRoster').innerHTML = `<div class="cmd-panel-h">Agents <span class="cmd-dim">${active}/${people.length} active</span></div>` + (people.length ? people.map((p) => `
      <div class="cmd-agent"><span class="cmd-dot" style="background:${stateColor(p.state)}"></span><span class="cmd-ag-n">${esc(p.nickname || p.codename || '')}</span><span class="cmd-ag-t">${esc(p.title || p.pod || '')}</span></div>`).join('') : '<div class="cmd-dim">roster offline</div>');

    el('cmdConnectors').innerHTML = '<div class="cmd-panel-h">Connectors</div>' + (conn.connectors || []).map((c) => `<div class="cmd-conn"><span class="cmd-dot" style="background:${c.on ? 'var(--teal)' : 'var(--dim)'}"></span>${esc(c.name)}</div>`).join('');

    const feed = (dash.feed || (floor.feed || [])).slice(0, 8);
    el('cmdFeed').innerHTML = feed.length ? feed.map((f) => `<span class="cmd-feed-i">▸ ${esc(typeof f === 'string' ? f : (f.text || f.s || f.note || f.action || ''))}</span>`).join('') : '<span class="cmd-dim">no recent activity</span>';
  }

  function estPipeline(ops) {
    // rough order-of-magnitude pipeline from bid-recommended opps (gov margin target ~ $40k each)
    const bids = (ops.opportunities || []).filter((o) => /bid/i.test(o.recommendation || '')).length;
    return bids ? '~' + money(bids * 40000) : '$0';
  }

  function brief() {
    const dash = data.dash || {}, ops = data.ops || {};
    const h = new Date().getHours();
    const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    const leads = (ops.leads || []).length, opps = (ops.opportunities || []).length, props = (ops.proposals || []).length;
    const txt = `Good ${part}, Vinicio. ${opps} opportunities are scored, ${props} proposals are ready, and ${leads} ${leads === 1 ? 'item needs' : 'items need'} your approval. Net is ${money(dash.net || 0)}. Standing by.`;
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('commandView').hidden) close(); });
})();
