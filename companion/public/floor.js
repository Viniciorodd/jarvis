// JARVIS — Floor view, rendered as a cinematic facility CUTAWAY (Callisto-style): a command dome on top,
// a central shaft, and numbered decks — one per pod — with their agents, glowing when active. Data-driven
// from /api/floor (roster + live HQ state) and fully theme-aware (teal / mono / full-dark).
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stateColor = (st) => (/work|busy|scan|draft/i.test(st) ? 'var(--teal)' : /need/i.test(st) ? 'var(--warn)' : /error/i.test(st) ? 'var(--err)' : 'var(--dim)');

  function cutaway(rooms) {
    const W = 760, dome = 130, deckH = 80, N = rooms.length;
    const H = dome + N * deckH + 24, cx = W / 2;
    let s = `<svg class="cutaway" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="Facility cutaway of the agent floor">`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="var(--ink)"/>`;
    let stars = '';
    for (let i = 0; i < 46; i++) stars += `<circle cx="${Math.round(Math.random() * W)}" cy="${Math.round(Math.random() * H)}" r="${(Math.random() * 1.1 + 0.3).toFixed(1)}" fill="rgba(var(--teal-rgb),.16)"/>`;
    s += stars;
    // central shaft
    s += `<rect x="${cx - 15}" y="${dome - 14}" width="30" height="${N * deckH}" fill="rgba(var(--teal-rgb),.05)" stroke="rgba(var(--teal-rgb),.16)" stroke-width="0.8"/>`;
    // command dome + antenna
    s += `<path d="M ${cx - 118} ${dome} A 118 118 0 0 1 ${cx + 118} ${dome} Z" fill="rgba(var(--teal-rgb),.06)" stroke="rgba(var(--teal-rgb),.42)" stroke-width="1.2"/>`;
    s += `<path d="M ${cx - 70} ${dome - 60} A 70 70 0 0 1 ${cx + 70} ${dome - 60}" fill="none" stroke="rgba(var(--teal-rgb),.22)" stroke-width="0.7"/>`;
    s += `<line x1="${cx}" y1="${dome - 116}" x2="${cx}" y2="${dome - 150}" stroke="var(--teal)" stroke-width="1.4"/><circle cx="${cx}" cy="${dome - 152}" r="4" style="fill:var(--teal)" class="us-pin-glow"/>`;
    s += `<text x="${cx}" y="${dome - 48}" text-anchor="middle" class="cut-title">JARVIS</text>`;
    s += `<text x="${cx}" y="${dome - 30}" text-anchor="middle" class="cut-sub">command</text>`;
    // decks (one per pod) — each is a clickable group that drills into the pod
    rooms.forEach((r, i) => {
      const y = dome + i * deckH + 6, h = deckH - 14;
      const active = r.people.some((p) => p.state && p.state !== 'idle');
      s += `<g class="cut-deck" data-pod="${esc(r.pod)}" role="button" tabindex="0" aria-label="Open ${esc(r.label)}">`;
      s += `<rect x="56" y="${y}" width="${W - 112}" height="${h}" rx="10" class="cut-deck-rect${active ? ' active' : ''}" fill="rgba(var(--teal-rgb),${active ? 0.08 : 0.035})" stroke="rgba(var(--teal-rgb),${active ? 0.5 : 0.2})" stroke-width="${active ? 1.3 : 0.8}"/>`;
      s += `<text x="74" y="${y + 24}" class="cut-deck-n">${String(i + 1).padStart(2, '0')}</text>`;
      s += `<text x="100" y="${y + 24}" class="cut-deck-label">${esc(r.label)}</text>`;
      s += `<text x="${W - 70}" y="${y + 24}" class="cut-deck-open" text-anchor="end">open ›</text>`;
      r.people.forEach((p, j) => {
        const ax = 104 + (j % 4) * 158, ay = y + 46 + Math.floor(j / 4) * 18;
        const col = stateColor(p.state);
        const glow = p.state && p.state !== 'idle' ? ' class="us-pin-glow live"' : '';
        s += `<circle cx="${ax}" cy="${ay - 4}" r="5.5" style="fill:${col}"${glow}><title>${esc(p.nickname)} — ${esc(p.text || p.state)}</title></circle>`;
        s += `<text x="${ax + 11}" y="${ay}" class="cut-agent">${esc(p.nickname)}</text>`;
      });
      s += `</g>`;
    });
    s += `</svg>`;
    return s;
  }

  // drill-in: a pod's team (live state + current task) + its recent activity feed
  let roomsByPod = {};
  async function openPod(pod) {
    const r = roomsByPod[pod]; if (!r) return;
    el('podDetailCap').textContent = r.label;
    const people = (r.people || []).map((p) => {
      const c = stateColor(p.state);
      return `<div class="pd-person">
        <span class="pd-dot" style="background:${c}"></span>
        <span class="pd-who"><b>${esc(p.nickname)}</b> <span class="pd-role">${esc(p.title || '')}</span></span>
        <span class="pd-state">${esc(p.text || p.state || 'idle')}</span>
      </div>`;
    }).join('') || '<div class="ops-empty">No agents assigned.</div>';
    el('podDetailBody').innerHTML = `<div class="od-sec"><div class="od-sec-h">Team</div>${people}</div>
      <div class="od-sec"><div class="od-sec-h">Recent activity</div><div id="pdFeed"><div class="ops-empty">loading…</div></div></div>`;
    el('podDetail').hidden = false;
    try {
      const d = await (await fetch('/api/pod-events?pod=' + encodeURIComponent(pod))).json();
      const evs = d.events || [];
      el('pdFeed').innerHTML = evs.length ? evs.map((e) => `<div class="pd-ev${e.status === 'error' ? ' err' : ''}">
        <span class="pd-ev-t">${new Date(e.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <span class="pd-ev-a">${esc(e.action || '')}</span>
        <span class="pd-ev-r">${esc(e.rationale || '')}</span>
      </div>`).join('') : '<div class="ops-empty">No activity logged yet for this pod.</div>';
    } catch (e) { el('pdFeed').innerHTML = `<div class="ops-empty">couldn't load activity: ${esc(e.message)}</div>`; }
  }

  async function load() {
    const body = el('floorBody');
    body.innerHTML = '<div class="ops-empty">building the facility…</div>';
    let d; try { d = await (await fetch('/api/floor')).json(); } catch (e) { body.innerHTML = `<div class="ops-empty">${esc(e.message)}</div>`; return; }
    const rooms = d.rooms || [];
    roomsByPod = {}; for (const r of rooms) roomsByPod[r.pod] = r;
    if (!rooms.length) { body.innerHTML = `<div class="ops-empty">No roster reachable.${d.error ? ' (' + esc(d.error) + ')' : ''}</div>`; return; }
    const active = rooms.reduce((n, r) => n + r.people.filter((p) => p.state && p.state !== 'idle').length, 0);
    el('floorStat').textContent = `${rooms.length} decks · ${rooms.reduce((n, r) => n + r.people.length, 0)} agents · ${active} active`;
    body.innerHTML = `<div class="cutaway-wrap">${cutaway(rooms)}</div>`;
    const link = el('floorHqLink');
    if (link && d.hqUrl) { link.href = d.hqUrl; link.style.display = ''; }
  }

  function open() { el('floorView').hidden = false; load(); }
  function close() { el('floorView').hidden = true; }
  el('floorBtn').addEventListener('click', open);
  el('floorX').addEventListener('click', close);
  el('floorRefresh').addEventListener('click', load);
  // click a deck → drill into the pod
  el('floorBody').addEventListener('click', (e) => { const g = e.target.closest('.cut-deck'); if (g) openPod(g.getAttribute('data-pod')); });
  el('floorBody').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ')) { const g = e.target.closest('.cut-deck'); if (g) { e.preventDefault(); openPod(g.getAttribute('data-pod')); } } });
  el('podDetailX').addEventListener('click', () => { el('podDetail').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || el('floorView').hidden) return;
    if (!el('podDetail').hidden) el('podDetail').hidden = true; else close();
  });
})();
