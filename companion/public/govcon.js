/* govcon.js — fills the GovCon OS preview from LIVE Jarvis data. No fabricated numbers:
   /api/gov-board (pipeline, fit, whose-move, your next move), /api/cockpit (today's priorities +
   open gates), /api/business?id=finance (MTD income vs the $10k goal). Pure read — changes nothing. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const stars = (n, max = 5, cls = '') => { n = clamp(Math.round(n), 0, max); let s = ''; for (let i = 0; i < max; i++) s += `<span class="${i < n ? '' : 'off'}">★</span>`; return `<span class="${cls}">${s}</span>`; };
  const daysTo = (d) => { if (!d) return null; const t = new Date(d).getTime(); if (isNaN(t)) return null; return Math.round((t - Date.now()) / 864e5); };

  function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.'; }
  function fmtDate() { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }
  function fmtMoney(n) { n = Number(n) || 0; return '$' + Math.round(n).toLocaleString(); }

  function countUp(el, target, suffix = '', dur = 700) {
    target = Number(target) || 0; const t0 = performance.now();
    const tick = (t) => { const p = clamp((t - t0) / dur, 0, 1); const e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(target * e).toLocaleString() + suffix; if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function ring(el, pct) { el.style.setProperty('--p', clamp(pct, 0, 100) + '%'); }

  async function getJSON(url) { try { const r = await fetch(url); return await r.json(); } catch { return null; } }

  // ── focus opportunity + win estimate (transparent, deterministic) ──────────────────────────────
  function allCards(board) { return (board.columns || []).flatMap((c) => c.cards || []); }
  function pickFocus(board) {
    const cards = allCards(board);
    if (board.yourNextAction) { const m = cards.find((c) => c.noticeId === board.yourNextAction.noticeId); if (m) return m; }
    const inLane = cards.filter((c) => c.inLane && c.stage !== 'closed').sort((a, b) => b.fit - a.fit || b.score - a.score);
    return inLane[0] || cards.sort((a, b) => b.fit - a.fit)[0] || null;
  }
  function winEstimate(c) {
    if (!c) return { pct: 0, why: [] };
    let pct = c.fit * 14 + (c.inLane ? 14 : -30);
    if (c.stage === 'responding' || c.stage === 'submitted') pct += 10;
    else if (c.stage === 'reviewing') pct += 5;
    pct = clamp(Math.round(pct), 4, 92);
    const why = [];
    why.push(`Fit ${c.fit}/5${c.score ? ` (${c.score}/100 scout score)` : ''}`);
    why.push(c.inLane ? 'In your set-aside lane — you can prime' : `Out of lane (${esc(c.setAside || '—')}) — subcontract only`);
    if (c.trade) why.push(`Trade: ${esc(c.trade)}${c.naics ? ` · NAICS ${esc(c.naics)}` : ''}`);
    const dd = daysTo(c.deadline); if (dd != null) why.push(dd >= 0 ? `${dd} day${dd === 1 ? '' : 's'} to deadline` : 'Deadline passed');
    return { pct, why };
  }
  function dna(c) {
    if (!c) return [];
    const dd = daysTo(c.deadline);
    const core = /janitorial|grounds|facilities|custodial/i.test(c.trade || '') ? 4 : (c.trade ? 3 : 2);
    const urgency = dd == null ? 2 : dd <= 7 ? 5 : dd <= 14 ? 4 : dd <= 30 ? 3 : 2;
    return [
      ['Fit', c.fit],
      ['Lane match', c.inLane ? 5 : 1],
      ['Past-perf fit', core],
      ['Time pressure', urgency],
      ['Value', clamp(Math.round((c.score || 0) / 20), 1, 5)],
    ];
  }

  function whoChip(next) { const who = (next && next.who) || 'jarvis'; return `<span class="gc-who ${who === 'you' ? 'you' : 'jarvis'}">${who === 'you' ? 'YOUR MOVE' : 'Jarvis'}</span>`; }

  let lastBoard = null; // shared with the ⌘K palette so search reflects current data
  let focusOpp = null;  // the opportunity the genome + simulation act on

  // extract a 2-letter state from a card's "place" (e.g. "Malmstrom AFB, MT" → MT)
  function stateOf(card) {
    const p = String(card.place || '').toUpperCase();
    const m = p.match(/,\s*([A-Z]{2})\b/) || p.match(/\b([A-Z]{2})\b/);
    return m ? m[1] : null;
  }

  // ── Living US opportunity map (reuses window.US_GEO baked geometry — offline, no projection math) ──
  function renderMap(board) {
    const el = $('gcMap'); if (!el) return;
    const G = window.US_GEO;
    if (!G || !G.statesPath || !G.pins) { el.innerHTML = '<div class="gc-map-empty">Map geometry didn’t load.</div>'; return; }
    const W = G.W || 640, H = G.H || 388;
    const byState = {};
    allCards(board).filter((c) => c.stage !== 'closed').forEach((c) => { const s = stateOf(c); if (s && G.pins[s]) (byState[s] = byState[s] || []).push(c); });
    const labels = Object.entries(G.pins).map(([code, xy]) => `<text class="us-lbl" x="${xy[0].toFixed(1)}" y="${(xy[1] + 3).toFixed(1)}">${code}</text>`).join('');
    const pins = Object.entries(byState).map(([s, list]) => {
      const xy = G.pins[s];
      const soon = list.some((c) => { const d = daysTo(c.deadline); return d != null && d >= 0 && d <= 7; });
      const good = list.some((c) => c.inLane && c.fit >= 4);
      const color = soon ? 'var(--warn)' : good ? 'var(--ok)' : 'var(--accent)';
      const top = list.slice().sort((a, b) => b.fit - a.fit)[0];
      const r = Math.min(5 + list.length * 1.4, 11);
      return `<g class="pin" data-url="${esc(top.url || '')}" tabindex="0" role="button">`
        + `<circle class="pin-glow" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${(r + 5).toFixed(1)}" style="fill:${color}"/>`
        + `<circle class="pin-dot" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${r.toFixed(1)}" style="fill:${color}"><title>${esc(s)}: ${list.length} opportunit${list.length > 1 ? 'ies' : 'y'} — top: ${esc(top.title)}</title></circle></g>`;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><path class="us-state" d="${G.statesPath}"/>${G.meshPath ? `<path class="us-mesh" d="${G.meshPath}"/>` : ''}${labels}${pins}</svg>`;
    const stat = $('gcMapStat'); if (stat) { const n = Object.values(byState).reduce((a, l) => a + l.length, 0); const st = Object.keys(byState).length; stat.textContent = n ? `${n} live across ${st} state${st === 1 ? '' : 's'}` : 'no live opportunities to map'; }
    el.querySelectorAll('.pin').forEach((g) => { const open = () => { const u = g.getAttribute('data-url'); if (u) window.open(u, '_blank', 'noopener'); }; g.onclick = open; g.onkeydown = (e) => { if (e.key === 'Enter') open(); }; });
  }

  // ── ⌘K command palette: search opportunities / agencies / codes / sections, jump to any ───────────
  let palItems = [], palSel = 0;
  function buildIndex() {
    const out = [];
    (lastBoard ? allCards(lastBoard) : []).forEach((c) => out.push({ kind: 'Opp', t: c.title, sub: [c.agency, stateOf(c)].filter(Boolean).join(' · '), url: c.url, hay: `${c.title} ${c.agency} ${c.trade} ${c.naics} ${c.setAside} ${stateOf(c) || ''}`.toLowerCase() }));
    [['Mission today', 'gcMission'], ['Pipeline', 'gcFunnel'], ['Board', 'gcBoard'], ['Opportunity map', 'gcMap'], ['Your gov team', 'gcAgents'], ['Opportunity Genome', 'gcDna']].forEach(([t, id]) => out.push({ kind: 'Go', t, sub: 'jump to section', anchor: id, hay: t.toLowerCase() }));
    return out;
  }
  function renderPalette(q) {
    q = String(q || '').trim().toLowerCase();
    const idx = buildIndex();
    palItems = (q ? idx.filter((x) => x.hay.includes(q)) : idx).slice(0, 40); palSel = 0;
    const res = $('gcPaletteResults');
    res.innerHTML = palItems.length
      ? palItems.map((x, i) => `<div class="gc-pr${i === 0 ? ' sel' : ''}" data-i="${i}"><span class="pr-kind">${x.kind}</span><span class="pr-t">${esc(x.t)}</span>${x.sub ? `<span class="pr-sub">${esc(x.sub)}</span>` : ''}</div>`).join('')
      : '<div class="gc-palette-empty">No matches.</div>';
    res.querySelectorAll('.gc-pr').forEach((d) => { d.onclick = () => choosePalette(Number(d.dataset.i)); });
  }
  function paintSel() { const res = $('gcPaletteResults'); [...res.querySelectorAll('.gc-pr')].forEach((d, i) => d.classList.toggle('sel', i === palSel)); const s = res.querySelector('.gc-pr.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); }
  function choosePalette(i) { const x = palItems[i]; if (!x) return; closePalette(); if (x.url) window.open(x.url, '_blank', 'noopener'); else if (x.anchor) { const t = document.getElementById(x.anchor); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
  function openPalette() { const p = $('gcPalette'); if (!p) return; p.hidden = false; const i = $('gcPaletteInput'); i.value = ''; renderPalette(''); i.focus(); }
  function closePalette() { const p = $('gcPalette'); if (p) p.hidden = true; }
  function initPalette() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); const p = $('gcPalette'); p && p.hidden ? openPalette() : closePalette(); return; }
      const p = $('gcPalette'); if (!p || p.hidden) return;
      if (e.key === 'Escape') closePalette();
      else if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); paintSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); paintSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); choosePalette(palSel); }
    });
    const inp = $('gcPaletteInput'); if (inp) inp.addEventListener('input', () => renderPalette(inp.value));
    const p = $('gcPalette'); if (p) p.addEventListener('click', (e) => { if (e.target === p) closePalette(); });
  }

  // ── Mission Today: the concrete things that need YOU (gates + your-move cards + due tasks) ────────
  function renderMission(board, cockpit) {
    const el = $('gcMission'); if (!el) return;
    const cards = allCards(board);
    const items = [];
    (cockpit && cockpit.approvals || []).forEach((a) => items.push(`Approve: ${a.title || a.action}`));
    cards.filter((c) => c.next && c.next.who === 'you' && c.inLane && c.stage !== 'closed').forEach((c) => items.push(`${c.next.text} — ${c.title}`));
    (cockpit && cockpit.tasks && cockpit.tasks.dueToday || []).forEach((t) => items.push(t.text));
    const seen = new Set(); const uniq = items.filter((t) => { const k = String(t).slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 7);
    el.innerHTML = uniq.length
      ? uniq.map((t) => `<div class="gc-mission-item you"><span class="box">▢</span><span>${esc(t)}</span><span class="who you">your move</span></div>`).join('')
      : `<div class="gc-mission-empty">✓ Nothing needs you right now — Jarvis has the board.</div>`;
    const active = cards.filter((c) => c.stage !== 'closed');
    const handled = active.filter((c) => c.next && c.next.who === 'jarvis').length;
    const pct = active.length ? Math.round(handled / active.length * 100) : 100;
    const bar = $('gcMissionBar'); if (bar) requestAnimationFrame(() => { bar.style.width = pct + '%'; });
  }

  // ── Your gov team: the pod agents, focus derived from the live board (real, not fabricated) ───────
  function renderAgents(board, counts, total) {
    const el = $('gcAgents'); if (!el) return;
    const won = allCards(board).filter((c) => c.stage === 'closed' && /^won/i.test(c.next && c.next.text || '')).length;
    const team = [
      { i: 'G', nm: 'Gideon', role: 'Gov Scout', focus: `Scanning SAM + state portals · ${total} tracked`, on: total > 0 },
      { i: 'P', nm: 'Patricia', role: 'Bid Analyst', focus: `${counts.reviewing || 0} to review · ${counts.responding || 0} drafting`, on: (counts.reviewing || 0) + (counts.responding || 0) > 0 },
      { i: 'H', nm: 'Hector', role: 'Procurement', focus: (counts.responding || 0) > 0 ? 'Sourcing subs for active bids' : 'Standing by for the next bid', on: (counts.responding || 0) > 0 },
      { i: 'S', nm: 'Sloane', role: 'Project Ops', focus: won > 0 ? `${won} award(s) in performance` : 'Ready when you win the first', on: won > 0 },
    ];
    el.innerHTML = team.map((a) => `<div class="gc-agent"><div class="top"><span class="av">${a.i}</span><div><div class="nm">${a.nm}</div><div class="role">${a.role}</div></div><span class="dot ${a.on ? 'on' : 'idle'}"></span></div><div class="focus">${esc(a.focus)}</div></div>`).join('');
  }

  // ── light / dark theme toggle (persists; default dark) ────────────────────────────────────────────
  function initTheme() {
    const btn = $('gcTheme'); if (!btn) return;
    // Theme is shared with the whole Jarvis app via localStorage 'jarvis-theme'. GovCon's CSS only has
    // light/dark, so map: 'light' → light, any dark theme (mono/teal/dark/arc) → dark.
    const paint = (light) => { document.documentElement.dataset.theme = light ? 'light' : 'dark'; btn.textContent = light ? '☀' : '☾'; };
    let isLight = false; try { isLight = localStorage.getItem('jarvis-theme') === 'light'; } catch { /* */ }
    paint(isLight);
    btn.onclick = () => {
      const goLight = document.documentElement.dataset.theme !== 'light';
      try { if (goLight) localStorage.setItem('jarvis-theme', 'light'); else if (localStorage.getItem('jarvis-theme') === 'light') localStorage.setItem('jarvis-theme', 'mono'); } catch { /* */ }
      paint(goLight);
    };
  }

  // ── Simulation Mode: a source-selection panel red-teams the focus opportunity before submit ───────
  const scoreCls = (n) => (n >= 75 ? 'score-hi' : n >= 50 ? 'score-mid' : 'score-lo');
  function renderSim(r) {
    const el = $('gcSimResult'); if (!el) return;
    if (!r || !r.ok) { el.innerHTML = `<div class="gc-empty">Couldn’t run the panel: ${esc((r && r.reason) || 'unknown')}${r && /model/.test(r.reason || '') ? ' — the free local model may be loading / out of memory; works best with Claude available.' : ''}</div>`; return; }
    const evals = (r.evaluators || []).map((e) => `<div class="gc-eval"><div class="er-top"><span class="er-role">${esc(e.role)}</span><span class="er-score ${scoreCls(e.score)}">${e.score}</span></div><div class="er-concern">⚠ ${esc(e.concern)}</div><div class="er-fix"><b>Fix:</b> ${esc(e.fix)}</div></div>`).join('');
    const risks = (r.topRisks || []).map((x) => `<li>${esc(x)}</li>`).join('');
    el.innerHTML = `<div class="gc-sim-overall"><div class="gc-sim-ring" style="--p:${r.overall}%"><span>${r.overall}</span></div><div><div class="lbl">Panel score</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Win estimate ${r.pWin}% · via ${esc(r.provider || 'ai')}</div></div></div>`
      + evals
      + (risks ? `<div class="lbl" style="margin-top:14px">Top risks</div><ul class="gc-sim-risks">${risks}</ul>` : '')
      + (r.recommendation ? `<div class="gc-sim-rec">▸ ${esc(r.recommendation)}</div>` : '');
  }
  function initSim() {
    const ov = $('gcSim'); if (!ov) return;
    const close = () => { ov.hidden = true; };
    const btn = $('gcSimBtn'); if (btn) btn.onclick = () => { $('gcSimTitle').textContent = focusOpp ? `Red-team: ${focusOpp.title}` : 'Pre-submit simulation'; $('gcSimResult').innerHTML = ''; ov.hidden = false; };
    const x = $('gcSimClose'); if (x) x.onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    const valBtn = $('gcValBtn'); if (valBtn) valBtn.onclick = async () => {
      if (!focusOpp || !focusOpp.noticeId) { alert('No opportunity selected to value.'); return; }
      const input = window.prompt(`Estimated $ value for "${focusOpp.title}"\n(contract size — feeds Pipeline $ + Est. revenue):`, focusOpp.value || '');
      if (input == null) return;
      try { await fetch('/api/gov-board/estimate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: focusOpp.noticeId, value: input }) }); } catch { /* */ }
      load();
    };
    const run = $('gcSimRun'); if (run) run.onclick = async () => {
      run.disabled = true; const t = run.textContent; run.textContent = 'Convening the panel…';
      $('gcSimResult').innerHTML = '<div class="gc-empty">The panel is reviewing… (uses your best available brain; ~10–20s)</div>';
      let r; try { r = await (await fetch('/api/gov/simulate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opportunity: focusOpp || {}, text: $('gcSimText').value || '' }) })).json(); } catch (e) { r = { ok: false, reason: e.message }; }
      run.disabled = false; run.textContent = t; renderSim(r);
    };
  }

  function render(board, cockpit, finance) {
    $('gcDate').textContent = fmtDate();
    $('gcGreeting').textContent = greeting();

    const counts = board.counts || {};
    const cards = allCards(board);
    const closed = cards.filter((c) => c.stage === 'closed');
    const won = closed.filter((c) => /^won/i.test(c.next && c.next.text || '')).length;
    const lost = closed.filter((c) => /^lost/i.test(c.next && c.next.text || '')).length;
    const pendingGates = (cockpit && cockpit.approvals ? cockpit.approvals.length : 0);
    const total = board.total || cards.length;

    lastBoard = board;
    renderMission(board, cockpit);
    renderAgents(board, counts, total);
    renderMap(board);

    // ── briefing sub ──
    const bits = [`${total} opportunit${total === 1 ? 'y' : 'ies'} tracked`];
    if (counts.reviewing) bits.push(`${counts.reviewing} to review`);
    if (counts.responding) bits.push(`${counts.responding} in motion`);
    if (pendingGates) bits.push(`${pendingGates} awaiting your sign-off`);
    $('gcBriefSub').textContent = bits.join(' · ') + '.';

    // ── health (derived, labeled) ──
    const health = clamp(58 + won * 6 + (counts.submitted || 0) * 4 + (counts.responding || 0) * 3 + (counts.reviewing || 0) * 1 - (total === 0 ? 30 : 0), 30, 99);
    ring($('gcHealthRing'), health); countUp($('gcHealthScore'), health);

    // ── next move ──
    const na = board.yourNextAction;
    if (na) {
      $('gcNextText').textContent = `${na.text} — ${na.title}`;
      const dd = daysTo(na.deadline);
      $('gcNextMeta').textContent = dd != null ? (dd >= 0 ? `due in ${dd} day${dd === 1 ? '' : 's'}` : 'deadline passed') : '';
    } else if (cockpit && cockpit.oneThing) {
      $('gcNextText').textContent = cockpit.oneThing.text;
      $('gcNextMeta').textContent = '';
    } else { $('gcNextText').textContent = 'Nothing needs you right now — Jarvis is scanning.'; }

    // ── priorities (gates first, then due tasks) ──
    const pri = $('gcPriorities'); pri.innerHTML = '';
    const items = [];
    (cockpit && cockpit.approvals || []).slice(0, 3).forEach((a) => items.push({ text: `Approve: ${a.title || a.action}`, tag: a.pod || 'gate' }));
    (cockpit && cockpit.tasks && cockpit.tasks.dueToday || []).slice(0, 3).forEach((t) => items.push({ text: t.text, tag: 'due today' }));
    if (!items.length) items.push({ text: 'No approvals or due tasks today.', tag: '' });
    items.slice(0, 5).forEach((it) => { const li = document.createElement('li'); li.innerHTML = `<span class="gc-pri-dot"></span><span>${esc(it.text)}</span>${it.tag ? `<span class="gc-pri-tag">${esc(it.tag)}</span>` : ''}`; pri.appendChild(li); });

    // ── KPI cards ──
    const winRate = (won + lost) ? Math.round(won / (won + lost) * 100) : null;
    const mtd = finance && finance.money ? finance.money.mtd : null;
    const goal = finance && finance.money ? finance.money.goal : 10000;
    const kpis = [
      { v: total, label: 'Tracked', cls: '' },
      { v: counts.reviewing || 0, label: 'To review', cls: 'accent' },
      { v: counts.responding || 0, label: 'Responding', cls: '' },
      { v: counts.submitted || 0, label: 'Submitted', cls: '' },
      { v: won, label: 'Won', cls: 'ok' },
      winRate == null ? { v: '—', label: 'Win rate', sub: 'no decisions yet', raw: true } : { v: winRate, label: 'Win rate', suffix: '%', cls: 'ok' },
      { v: (board.money && board.money.pipeline) || 0, label: 'Pipeline $', money: true, cls: 'accent', sub: (board.money && board.money.withValue) ? `${board.money.withValue} valued` : 'set $ on a bid →' },
      { v: (board.money && board.money.estRevenue) || 0, label: 'Est. revenue', money: true, cls: 'ok', sub: '× win likelihood' },
      mtd == null ? { v: '—', label: 'Income MTD', sub: 'connect finance', raw: true } : { v: mtd, label: 'Income MTD', money: true, sub: `of ${fmtMoney(goal)} goal`, cls: 'warn' },
    ];
    const kEl = $('gcKpis'); kEl.innerHTML = '';
    kpis.forEach((k) => {
      const d = document.createElement('div'); d.className = 'gc-kpi ' + (k.cls || '');
      d.innerHTML = `<div class="gc-kpi-val"></div><div class="gc-kpi-label">${esc(k.label)}</div>${k.sub ? `<div class="gc-kpi-sub">${esc(k.sub)}</div>` : ''}`;
      kEl.appendChild(d);
      const val = d.querySelector('.gc-kpi-val');
      if (k.raw) val.textContent = k.v;
      else if (k.money) countUp(val, k.v, '', 900), val.dataset.m = 1, val.textContent = fmtMoney(0), animMoney(val, k.v);
      else countUp(val, k.v, k.suffix || '');
    });

    // ── funnel ──
    const order = [['found', 'Found'], ['reviewing', 'Reviewing'], ['responding', 'Responding'], ['submitted', 'Submitted'], ['closed', 'Won / Lost']];
    const max = Math.max(1, ...order.map(([k]) => counts[k] || 0));
    const fEl = $('gcFunnel'); fEl.innerHTML = '';
    order.forEach(([k, label]) => {
      const n = counts[k] || 0; const row = document.createElement('div'); row.className = 'gc-fbar';
      row.innerHTML = `<span class="gc-fbar-label">${label}</span><div class="gc-fbar-track"><div class="gc-fbar-fill s-${k}" style="width:2px"></div></div><span class="gc-fbar-num">${n}</span>`;
      fEl.appendChild(row);
      requestAnimationFrame(() => { row.querySelector('.gc-fbar-fill').style.width = (n / max * 100) + '%'; });
    });

    // ── board ──
    const bEl = $('gcBoard'); bEl.innerHTML = '';
    (board.columns || []).forEach((col) => {
      const c = document.createElement('div'); c.className = 'gc-col';
      c.innerHTML = `<div class="gc-col-head">${esc(col.label)}<span class="n">${(col.cards || []).length}</span></div>`;
      (col.cards || []).slice(0, 12).forEach((card) => {
        const el = document.createElement('div'); el.className = 'gc-card' + (card.inLane ? '' : ' out');
        const dd = daysTo(card.deadline);
        el.innerHTML = `<div class="gc-card-title">${esc(card.title)}</div>`
          + `<div class="gc-card-meta">${stars(card.fit, 5, 'gc-stars')}`
          + `${card.agency ? `<span>${esc(card.agency)}</span>` : ''}`
          + `${dd != null && dd >= 0 ? `<span>· ${dd}d</span>` : ''}`
          + `${whoChip(card.next)}</div>`;
        if (card.url) { el.style.cursor = 'pointer'; el.title = 'Open on SAM.gov'; el.onclick = () => window.open(card.url, '_blank', 'noopener'); }
        c.appendChild(el);
      });
      if (!(col.cards || []).length) c.innerHTML += `<div class="gc-empty">—</div>`;
      bEl.appendChild(c);
    });

    // ── genome ──
    const focus = pickFocus(board);
    focusOpp = focus;
    if (focus) {
      $('gcGenomeTitle').textContent = focus.title;
      const we = winEstimate(focus);
      ring($('gcWinRing'), we.pct); countUp($('gcWinPct'), we.pct, '%');
      $('gcWinWhy').innerHTML = we.why.map((w) => `<li>${w}</li>`).join('');
      $('gcDna').innerHTML = dna(focus).map(([lab, n]) => `<div class="gc-dna-row"><span class="lab">${esc(lab)}</span>${stars(n, 5, 'gc-dna-stars')}</div>`).join('');
    } else {
      $('gcGenomeTitle').textContent = 'No live opportunities yet.';
      $('gcWinWhy').innerHTML = '<li>Run a gov scan to populate the genome.</li>';
    }

    $('gcFootStatus').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function animMoney(el, target) {
    const t0 = performance.now(); target = Number(target) || 0;
    const tick = (t) => { const p = Math.min((t - t0) / 900, 1); const e = 1 - Math.pow(1 - p, 3); el.textContent = '$' + Math.round(target * e).toLocaleString(); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  async function load() {
    const [board, cockpit, finance] = await Promise.all([
      getJSON('/api/gov-board'),
      getJSON('/api/cockpit'),
      getJSON('/api/business?id=finance'),
    ]);
    if (!board) { $('gcBriefSub').textContent = 'Could not reach the gov board API.'; $('gcFootStatus').textContent = 'Offline'; return; }
    try { render(board, cockpit || {}, finance || {}); }
    catch (e) { $('gcFootStatus').textContent = 'Render error: ' + e.message; }
  }

  initTheme();
  initPalette();
  initSim();
  load();
  setInterval(load, 60000); // calm refresh
})();
