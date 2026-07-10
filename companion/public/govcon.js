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
  async function postJSON(url, body) { try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return await r.json(); } catch (e) { return { error: e.message }; } }

  // ── Opportunity detail drawer: click anything → full detail + the old Operations actions ──────────
  let opsData = null;
  async function loadOps(force) { if (opsData && !force) return opsData; opsData = await getJSON('/api/operations'); return opsData; }
  function oppFromAnywhere(noticeId) {
    const o = opsData && (opsData.opportunities || []).find((x) => x.noticeId === noticeId);
    if (o) return o;
    const c = lastBoard ? allCards(lastBoard).find((x) => x.noticeId === noticeId) : null;
    return c ? { noticeId: c.noticeId, title: c.title, agency: c.agency, score: c.score, setAside: c.setAside, deadline: c.deadline, url: c.url, place: c.place, estimatedValue: c.value } : null;
  }
  const leadForNotice = (n) => (opsData && (opsData.leads || []).find((l) => l.noticeId === n)) || null;
  function propForNotice(n) {
    if (!opsData) return null;
    const p = (opsData.proposals || []).find((x) => x.noticeId === n);
    const o = (opsData.opportunities || []).find((x) => x.noticeId === n);
    return p || (o && o.proposalFile ? { file: o.proposalFile, noticeId: n } : null);
  }
  function closeOpp() { const ov = $('gcOpp'); if (ov) ov.hidden = true; }
  function refreshSoon() { setTimeout(() => { opsData = null; load(); }, 700); }
  async function openOppDrawer(noticeId) {
    if (!noticeId) return;
    const ov = $('gcOpp'), body = $('gcOppBody'); if (!ov || !body) return;
    ov.hidden = false; body.innerHTML = '<div class="gc-empty">loading…</div>';
    await loadOps();
    const o = oppFromAnywhere(noticeId);
    if (!o) { body.innerHTML = '<div class="gc-empty">Couldn’t find that opportunity in the live data.</div>'; return; }
    $('gcOppTitle').textContent = o.title || 'Opportunity';
    const lead = leadForNotice(noticeId), prop = propForNotice(noticeId), dd = daysTo(o.deadline);
    const val = o.estimatedValue ? (typeof o.estimatedValue === 'number' ? fmtMoney(o.estimatedValue) : o.estimatedValue) : '';
    const meta = [o.agency, o.setAside, o.place, dd != null ? (dd >= 0 ? `due in ${dd}d` : 'closed') : '', val ? '💰 ' + val : ''].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('');
    body.innerHTML =
      `<div class="gc-opp-meta">${o.score != null ? `<span class="gc-opp-score">${o.score}/100</span>` : ''}${meta}</div>`
      + '<div class="gc-opp-actions">'
      + ((o.inLane !== false && (dd == null || dd >= 0) && window.SubmitWizard) ? '<button class="gc-btn primary" data-act="wizard">📋 Submit step-by-step</button>' : '')
      + `<button class="gc-btn" data-act="approve"${lead ? '' : ' disabled title="No pending approval gate for this one"'}>✓ Approve</button>`
      + '<button class="gc-btn ghost" data-act="pass">Pass</button>'
      + '<button class="gc-btn ghost" data-act="pursue">🎯 Pursue (draft)</button>'
      + '<button class="gc-btn ghost" data-act="email">📧 Email</button>'
      + '<button class="gc-btn ghost" data-act="value">💲 Set $</button>'
      + '<button class="gc-btn ghost" data-act="redteam">🛡 Red-team</button>'
      + (o.url ? `<a class="gc-btn ghost" href="${esc(o.url)}" target="_blank" rel="noopener">RFP on SAM ↗</a>` : '')
      + '</div><div class="gc-opp-result" id="gcOppResult"></div>'
      + '<div class="gc-opp-sec"><button class="gc-btn ghost" data-act="docs">📎 Load RFP documents + CO contact</button><div id="gcOppDocs"></div></div>'
      + (prop ? '<div class="gc-opp-sec"><button class="gc-btn ghost" data-act="readprop">📝 Read the drafted proposal</button><div id="gcOppProp"></div></div>' : '')
      + '<div class="gc-opp-sec"><div class="gc-h2">Ask Jarvis about this</div><form id="gcOppAsk"><input id="gcOppAskIn" placeholder="key requirements? do we qualify? competitors?"><button class="gc-btn" type="submit">Ask</button></form><div id="gcOppAskOut"></div></div>';
    body.querySelectorAll('button[data-act]').forEach((b) => { b.onclick = () => oppAction(b.dataset.act, o, lead, prop); });
    const f = $('gcOppAsk'); if (f) f.onsubmit = (e) => { e.preventDefault(); oppAction('ask', o, lead, prop); };
  }
  async function oppAction(act, o, lead, prop) {
    const res = $('gcOppResult'); const say = (m, ok) => { if (res) { res.textContent = m; res.style.color = ok === false ? 'var(--danger)' : 'var(--ok)'; } };
    try {
      if (act === 'wizard') {
        if (window.SubmitWizard) { closeOpp(); window.SubmitWizard.open(o.noticeId); } else { say('Wizard not loaded — reload the page.', false); }
      } else if (act === 'approve') {
        if (!lead) return say('No pending gate to approve for this one.', false);
        const r = await postJSON('/api/approve', { id: lead.id, decision: 'approve' });
        say(r && r.error ? 'Error: ' + r.error : '✓ Approved — the executor is running it.', !(r && r.error)); refreshSoon();
      } else if (act === 'pass') {
        await postJSON('/api/gov-board/disposition', { noticeId: o.noticeId, stage: 'passed' }); say('Passed — moved off the board.'); refreshSoon();
      } else if (act === 'pursue') {
        const r = await postJSON('/api/command', { text: `pursue the opportunity "${o.title}" — have Patricia draft the proposal` }); say((r && r.reply) || 'Sent to draft.');
      } else if (act === 'email') {
        const r = await postJSON('/api/command', { text: `draft the submission / outreach email for "${o.title}"` }); say((r && r.reply) || 'Drafting the email (gated before it sends).');
      } else if (act === 'value') {
        const v = window.prompt(`Estimated $ value for "${o.title}":`, o.estimatedValue || ''); if (v == null) return;
        await postJSON('/api/gov-board/estimate', { noticeId: o.noticeId, value: v }); say('Saved $ value.'); refreshSoon();
      } else if (act === 'redteam') {
        focusOpp = o; closeOpp(); const b = $('gcSimBtn'); if (b) b.click();
      } else if (act === 'docs') {
        const box = $('gcOppDocs'); box.innerHTML = '<div class="gc-empty">loading RFP documents…</div>';
        const d = await getJSON('/api/opp-docs?noticeId=' + encodeURIComponent(o.noticeId));
        const docs = (d && d.documents) || [], contact = (d && d.contact) || [];
        box.innerHTML = (docs.length ? docs.map((x) => `<div class="gc-opp-doc"><a href="${esc(x.url || x.link || '#')}" target="_blank" rel="noopener">${esc(x.name || x.title || x.url || 'document')}</a></div>`).join('') : `<div class="gc-empty">${esc((d && d.error) || 'No documents listed — open the RFP on SAM.')}</div>`)
          + (contact.length ? `<div class="gc-opp-doc">CO contact: ${contact.map((c) => esc(c.fullName || c.name || c.email || '')).filter(Boolean).join(', ')}</div>` : '');
      } else if (act === 'readprop') {
        const box = $('gcOppProp'); box.innerHTML = '<div class="gc-empty">loading the draft…</div>';
        const d = await getJSON('/api/proposal?file=' + encodeURIComponent(prop.file));
        box.innerHTML = `<div class="gc-opp-prop">${esc((d && (d.content || d.text || d.body)) || (d && d.error) || 'Could not read the draft.')}</div>`;
      } else if (act === 'ask') {
        const inp = $('gcOppAskIn'), out = $('gcOppAskOut'); const q = inp ? inp.value.trim() : ''; if (!q) return;
        out.textContent = 'Asking Jarvis…';
        const r = await postJSON('/api/command', { text: `${q} (about the gov opportunity "${o.title}")` });
        out.textContent = (r && r.reply) || 'Routed to the team.';
      }
    } catch (e) { say('Error: ' + e.message, false); }
  }
  function initOpp() {
    const oc = $('gcOppClose'); if (oc) oc.onclick = closeOpp;
    const ov = $('gcOpp'); if (ov) ov.addEventListener('click', (e) => { if (e.target === ov) closeOpp(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOpp(); });
  }

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
  let spendingData = null; // federal spending feed, merged into the opportunity map

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
    // MERGED federal-spending heat layer (faint bubbles behind the opportunity pins) from /api/gov/spending
    let spend = '';
    const sd = (spendingData && spendingData.results) || [];
    if (sd.length) {
      const smax = sd[0].amount || 0;
      spend = sd.filter((s) => G.pins[s.state]).map((s) => { const xy = G.pins[s.state]; const r = bubbleRClient(s.amount, smax, 6, 34); return `<circle class="spend-bubble" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${r}"><title>${esc(s.name || s.state)}: $${fmtShort(s.amount)} federal spend (${spendingData.period || ''})</title></circle>`; }).join('');
    }
    const pins = Object.entries(byState).map(([s, list]) => {
      const xy = G.pins[s];
      const soon = list.some((c) => { const d = daysTo(c.deadline); return d != null && d >= 0 && d <= 7; });
      const good = list.some((c) => c.inLane && c.fit >= 4);
      const color = soon ? 'var(--warn)' : good ? 'var(--ok)' : 'var(--accent)';
      const top = list.slice().sort((a, b) => b.fit - a.fit)[0];
      const r = Math.min(5 + list.length * 1.4, 11);
      return `<g class="pin" data-notice="${esc(top.noticeId || '')}" tabindex="0" role="button">`
        + `<circle class="pin-glow" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${(r + 5).toFixed(1)}" style="fill:${color}"/>`
        + `<circle class="pin-dot" cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${r.toFixed(1)}" style="fill:${color}"><title>${esc(s)}: ${list.length} opportunit${list.length > 1 ? 'ies' : 'y'} — top: ${esc(top.title)}</title></circle></g>`;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><path class="us-state" d="${G.statesPath}"/>${G.meshPath ? `<path class="us-mesh" d="${G.meshPath}"/>` : ''}${spend}${labels}${pins}</svg>`;
    const stat = $('gcMapStat'); if (stat) { const n = Object.values(byState).reduce((a, l) => a + l.length, 0); const st = Object.keys(byState).length; stat.textContent = n ? `${n} live across ${st} state${st === 1 ? '' : 's'}` : 'no live opportunities to map'; }
    el.querySelectorAll('.pin').forEach((g) => { const open = () => openOppDrawer(g.getAttribute('data-notice')); g.onclick = open; g.onkeydown = (e) => { if (e.key === 'Enter') open(); }; });
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
    // match an approval's title to a board card so "Approve: Range Maintenance" can open that opportunity
    const byTitle = {}; cards.forEach((c) => { byTitle[String(c.title || '').toLowerCase().slice(0, 40)] = c.noticeId; });
    (cockpit && cockpit.approvals || []).forEach((a) => { const ti = a.title || a.action; items.push({ text: `Approve: ${ti}`, notice: byTitle[String(ti).toLowerCase().slice(0, 40)] || null }); });
    cards.filter((c) => c.next && c.next.who === 'you' && c.inLane && c.stage !== 'closed').forEach((c) => items.push({ text: `${c.next.text} — ${c.title}`, notice: c.noticeId }));
    (cockpit && cockpit.tasks && cockpit.tasks.dueToday || []).forEach((t) => items.push({ text: t.text, notice: null }));
    const seen = new Set(); const uniq = items.filter((it) => { const k = it.text.slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 7);
    el.innerHTML = uniq.length
      ? uniq.map((it) => `<div class="gc-mission-item you"${it.notice ? ` data-notice="${esc(it.notice)}" style="cursor:pointer"` : ''}><span class="box">▢</span><span>${esc(it.text)}</span><span class="who you">your move</span></div>`).join('')
      : '<div class="gc-mission-empty">✓ Nothing needs you right now — Jarvis has the board.</div>';
    el.querySelectorAll('[data-notice]').forEach((d) => { d.onclick = () => openOppDrawer(d.getAttribute('data-notice')); });
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
    // light/dark, so map: 'white'/'light' → light, anything else (black/teal/arc/exec/dark/mono) → dark.
    // The toggle writes the app-wide theme names ('black'/'white') so the choice carries across Jarvis.
    const paint = (light) => { document.documentElement.dataset.theme = light ? 'light' : 'dark'; btn.textContent = light ? '☀' : '☾'; };
    let t = null; try { t = localStorage.getItem('jarvis-theme'); } catch { /* */ }
    paint(t === 'white' || t === 'light');
    btn.onclick = () => {
      const goLight = document.documentElement.dataset.theme !== 'light';
      try { localStorage.setItem('jarvis-theme', goLight ? 'white' : 'black'); } catch { /* */ }
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

  // ── Bid simulator: slide bid value / labor / overhead → live margin (pure client-side what-if) ────
  function initSimulator() {
    const vR = $('slValR'), lR = $('slLabR'), oR = $('slOhR'); if (!vR) return;
    const calc = () => {
      const v = Number(vR.value), lab = Number(lR.value) / 100, oh = Number(oR.value) / 100;
      $('slVal').textContent = fmtMoney(v); $('slLab').textContent = lR.value + '%'; $('slOh').textContent = oR.value + '%';
      const profit = Math.round(v * (1 - lab - oh)); const margin = v ? Math.round((profit / v) * 100) : 0;
      const cls = margin >= 20 ? 'score-hi' : margin >= 10 ? 'score-mid' : 'score-lo';
      const pf = $('slProfit'), mg = $('slMargin');
      pf.textContent = fmtMoney(profit); pf.className = cls; mg.textContent = margin + '%'; mg.className = cls;
    };
    [vR, lR, oR].forEach((s) => s.addEventListener('input', calc));
    calc();
  }

  // ── AI Coach: nudges derived from the live board (real signals, no fabrication) ───────────────────
  function renderCoach(board, cockpit) {
    const el = $('gcCoach'); if (!el) return;
    const cards = allCards(board); const money = board.money || {}; const counts = board.counts || {};
    const tips = [];
    const unrev = cards.filter((c) => c.stage === 'found' && c.inLane).length;
    if (unrev) tips.push({ t: `${unrev} in-lane opportunit${unrev > 1 ? 'ies' : 'y'} not reviewed yet`, s: 'warn', a: 'gcBoard' });
    const soon = cards.filter((c) => { const d = daysTo(c.deadline); return d != null && d >= 0 && d <= 7 && c.stage !== 'closed'; }).length;
    if (soon) tips.push({ t: `${soon} bid${soon > 1 ? 's' : ''} due within 7 days — prioritize`, s: 'warn', a: 'gcMap' });
    const gates = (cockpit && cockpit.approvals || []).length;
    if (gates) tips.push({ t: `${gates} item${gates > 1 ? 's' : ''} awaiting your sign-off`, s: 'warn', a: 'gcMission' });
    const outLane = cards.filter((c) => !c.inLane && c.stage !== 'closed').length;
    if (outLane) tips.push({ t: `${outLane} tracked ${outLane > 1 ? 'bids are' : 'bid is'} out of your lane — subcontract only`, s: 'info' });
    if ((money.withValue || 0) === 0) tips.push({ t: 'No $ estimates set — Pipeline $ is blank. Value a bid →', s: 'info', a: 'gcGenomeTitle' });
    if (counts.responding) tips.push({ t: `${counts.responding} in drafting — submit early; quality scores rise`, s: 'info', a: 'gcBoard' });
    if (!tips.length) tips.push({ t: "You're on top of it — nothing flagged right now.", s: 'good' });
    el.innerHTML = tips.slice(0, 5).map((x) => `<div class="gc-coach-item ${x.s}"${x.a ? ` data-anchor="${x.a}"` : ''}><span class="ci-dot"></span><span>${esc(x.t)}</span></div>`).join('');
    el.querySelectorAll('[data-anchor]').forEach((d) => { d.onclick = () => { const t = document.getElementById(d.dataset.anchor); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
  }

  // ── Decision journal: the gov pod's timeline from the control-plane event store ───────────────────
  async function loadJournal() {
    const el = $('gcJournal'); if (!el) return;
    const r = await getJSON('/api/gov/journal');
    const items = (r && r.items) || [];
    el.innerHTML = items.length
      ? items.map((i) => { const d = new Date(i.ts); const when = isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); return `<div class="gc-journal-item"><span class="ji-when">${when}</span><span class="ji-kind">${esc(i.kind)}</span><span class="ji-text">${esc(i.text)}</span></div>`; }).join('')
      : '<div class="gc-journal-empty">No gov activity logged yet — it fills as you scout, draft, value, and decide.</div>';
  }

  // ── Relationship graph / "company brain": radial network of Rodgate → agencies → opportunities ───
  function renderNetwork(board) {
    const el = $('gcNet'); if (!el) return;
    const cards = allCards(board).filter((c) => c.stage !== 'closed');
    if (!cards.length) { el.innerHTML = '<div class="gc-map-empty">No live opportunities to graph yet.</div>'; return; }
    const W = 1000, H = 540, cx = W / 2, cy = H / 2;
    const byAgency = {};
    cards.forEach((c) => { const a = c.agency || 'Other'; (byAgency[a] = byAgency[a] || []).push(c); });
    const agencies = Object.entries(byAgency).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    const R1 = Math.min(W, H) * 0.31;
    let links = '', nodes = '';
    agencies.forEach(([name, opps], i) => {
      const ang = (i / agencies.length) * Math.PI * 2 - Math.PI / 2;
      const ax = cx + R1 * Math.cos(ang), ay = cy + R1 * Math.sin(ang);
      links += `<line class="net-link" x1="${cx}" y1="${cy}" x2="${ax.toFixed(0)}" y2="${ay.toFixed(0)}"/>`;
      const shown = opps.slice(0, 8), R2 = 46 + Math.min(opps.length * 3, 38);
      shown.forEach((o, j) => {
        const oa = ang + (j - (shown.length - 1) / 2) * 0.34;
        const ox = ax + R2 * Math.cos(oa), oy = ay + R2 * Math.sin(oa);
        const col = o.inLane ? 'var(--ok)' : 'var(--faint)';
        links += `<line class="net-link faint" x1="${ax.toFixed(0)}" y1="${ay.toFixed(0)}" x2="${ox.toFixed(0)}" y2="${oy.toFixed(0)}"/>`;
        nodes += `<circle class="net-opp" cx="${ox.toFixed(0)}" cy="${oy.toFixed(0)}" r="5" style="fill:${col}" data-url="${esc(o.url || '')}"><title>${esc(o.title)} — ${esc(o.setAside)}</title></circle>`;
      });
      const r = 10 + Math.min(opps.length * 1.4, 14);
      nodes += `<circle class="net-agency" cx="${ax.toFixed(0)}" cy="${ay.toFixed(0)}" r="${r.toFixed(0)}"><title>${esc(name)} — ${opps.length} opportunit${opps.length > 1 ? 'ies' : 'y'}</title></circle>`;
      nodes += `<text class="net-lbl" x="${ax.toFixed(0)}" y="${(ay + r + 11).toFixed(0)}">${esc(name.slice(0, 20))}</text>`;
    });
    nodes += `<circle class="net-center" cx="${cx}" cy="${cy}" r="27"/><text class="net-center-lbl" x="${cx}" y="${(cy + 4).toFixed(0)}">RODGATE</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${links}${nodes}</svg>`;
    const stat = $('gcNetStat'); if (stat) stat.textContent = `${cards.length} live · ${agencies.length} agenc${agencies.length === 1 ? 'y' : 'ies'}`;
    el.querySelectorAll('.net-opp').forEach((c) => { c.onclick = () => { const u = c.getAttribute('data-url'); if (u) window.open(u, '_blank', 'noopener'); }; });
  }

  // ── Federal spending heatmap: real USASpending obligations by state in our NAICS ──────────────────
  const fmtShort = (n) => { n = Number(n) || 0; if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'; return '' + n; };
  const bubbleRClient = (amt, max, minR = 4, maxR = 26) => (!max || amt <= 0) ? 0 : +(minR + (maxR - minR) * Math.sqrt(amt / max)).toFixed(1);
  async function loadSpending() {
    const d = await getJSON('/api/gov/spending'); spendingData = d || null;
    const res = (d && d.results) || [];
    const top = $('gcSpendTop');
    if (top) top.textContent = res.length ? `· $ heat: ${res.slice(0, 3).map((s) => `${s.state} $${fmtShort(s.amount)}`).join(', ')}` : '';
    if (lastBoard) renderMap(lastBoard); // redraw the opportunity map with the merged spending heat layer
  }

  // ── ⚡ Quick wins: fast-close leads from the quick-wins radar (best-effort; page is fine without it) ─
  async function loadQuickwins() {
    const el = $('gcQuickwins'); if (!el) return;
    const r = await getJSON('/api/gov/quickwins?days=7');
    if (!r || !r.ok) { el.innerHTML = '<div class="gc-empty">Quick-wins feed unavailable right now.</div>'; return; }
    const leads = (r.leads || []).slice(0, 6);
    if (!leads.length) { el.innerHTML = '<div class="gc-empty">No quick wins flagged — the radar keeps scanning.</div>'; return; }
    el.innerHTML = leads.map((l) => {
      const dd = daysTo(l.due);
      const meta = [l.agency, dd != null ? (dd >= 0 ? `${dd}d left` : 'closed') : ''].filter(Boolean).join(' · ');
      return `<div class="gc-qw-item"><span class="gc-qw-score">${Number(l.score) || 0}</span><span class="gc-qw-t">${esc(l.title)}</span><span class="gc-qw-meta">${esc(meta)}</span>${l.link ? `<a class="gc-qw-open" href="${esc(l.link)}" target="_blank" rel="noopener">Open ↗</a>` : ''}</div>`;
    }).join('');
  }

  // ── 🤝 Teaming radar: primes winning nearby → gated intro letters (nothing sends itself) ──────────
  const fmtM = (n) => { n = Number(n) || 0; return n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n); };
  async function loadTeaming() {
    const el = $('gcTeaming'); if (!el) return;
    if (el.querySelector('.gc-team-letter:not([hidden])')) return; // don't wipe an open intro letter on refresh
    const r = await getJSON('/api/gov/teaming?days=120');
    if (!r || !r.ok) { el.innerHTML = '<div class="gc-empty">Teaming feed unavailable right now.</div>'; return; }
    const leads = (r.leads || []).slice(0, 5);
    if (!leads.length) { el.innerHTML = '<div class="gc-empty">No primes flagged yet — fills as nearby awards land.</div>'; return; }
    el.innerHTML = leads.map((l, i) => {
      const meta = [l.amount ? fmtM(l.amount) : '', l.agency, l.state].filter(Boolean).join(' · ');
      return `<div class="gc-team-item"><div class="gc-team-row"><span class="gc-team-prime" title="${esc(l.why || '')}">${esc(l.recipient)}</span><span class="gc-team-meta">${esc(meta)}</span><button class="gc-btn" data-i="${i}">✍ Intro</button></div><div class="gc-team-letter" id="gcTeamLetter${i}" hidden></div></div>`;
    }).join('');
    el.querySelectorAll('button[data-i]').forEach((b) => { b.onclick = () => teamIntro(leads[Number(b.dataset.i)], Number(b.dataset.i), b); });
  }
  async function teamIntro(lead, i, btn) {
    const box = $('gcTeamLetter' + i); if (!lead || !box) return;
    if (!box.hidden && box.dataset.done) { box.hidden = true; return; } // second click folds the expando
    box.hidden = false; box.innerHTML = '<div class="gc-empty">drafting the intro…</div>'; btn.disabled = true;
    const r = await postJSON('/api/gov/teaming/intro', { prime: lead, agency: lead.agency });
    btn.disabled = false;
    if (!r || !r.ok || !r.letter) { box.innerHTML = `<div class="gc-empty">Couldn’t draft it: ${esc((r && (r.error || r.reason)) || 'unavailable')}</div>`; return; }
    box.dataset.done = '1';
    box.innerHTML = '<div class="gc-team-note">Nothing sends automatically — you send it.</div><pre class="gc-team-text"></pre><button class="gc-btn" data-copy>Copy</button>';
    box.querySelector('.gc-team-text').textContent = r.letter;
    const cp = box.querySelector('[data-copy]');
    cp.onclick = async () => { try { await navigator.clipboard.writeText(r.letter); cp.textContent = '✓ Copied'; setTimeout(() => { cp.textContent = 'Copy'; }, 1400); } catch { /* */ } };
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
    renderCoach(board, cockpit);
    renderAgents(board, counts, total);
    renderMap(board);
    renderNetwork(board);

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
      const total = (col.cards || []).length;
      const limit = col.key === 'found' ? 5 : 12; // Found shows only the top 5 most relevant (already sorted: your-move → fit → score)
      const moreHint = (col.key === 'found' && total > 5) ? ` <span class="gc-col-more">top 5 of ${total}</span>` : '';
      c.innerHTML = `<div class="gc-col-head">${esc(col.label)}<span class="n">${total}</span></div>${moreHint ? `<div class="gc-col-sub">${moreHint}</div>` : ''}`;
      (col.cards || []).slice(0, limit).forEach((card) => {
        const el = document.createElement('div'); el.className = 'gc-card' + (card.inLane ? '' : ' out');
        const dd = daysTo(card.deadline);
        el.innerHTML = `<div class="gc-card-title">${esc(card.title)}</div>`
          + `<div class="gc-card-meta">${stars(card.fit, 5, 'gc-stars')}`
          + `${card.agency ? `<span>${esc(card.agency)}</span>` : ''}`
          + `${dd != null && dd >= 0 ? `<span>· ${dd}d</span>` : ''}`
          + `${whoChip(card.next)}</div>`;
        // EVERY card is clickable → opens the full detail drawer (RFP, proposal, approve/pass/pursue/email/ask)
        if (card.noticeId) { el.style.cursor = 'pointer'; el.title = 'Open details'; el.onclick = () => openOppDrawer(card.noticeId); }
        c.appendChild(el);
      });
      if (!(col.cards || []).length) c.innerHTML += `<div class="gc-empty">—</div>`;
      bEl.appendChild(c);
    });

    // ── genome ──
    const focus = pickFocus(board);
    focusOpp = focus;
    const _vR = $('slValR'); if (_vR && focus && focus.value > 0) { _vR.value = Math.max(25000, Math.min(1500000, focus.value)); _vR.dispatchEvent(new Event('input')); }
    if (focus) {
      const gt = $('gcGenomeTitle'); gt.textContent = focus.title; gt.style.cursor = 'pointer'; gt.title = 'Open full details'; gt.onclick = () => openOppDrawer(focus.noticeId);
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
    loadJournal();
    loadSpending();
    loadQuickwins();
    loadTeaming();
  }

  initTheme();
  initPalette();
  initSim();
  initSimulator();
  initOpp();
  load();
  setInterval(load, 60000); // calm refresh
})();
