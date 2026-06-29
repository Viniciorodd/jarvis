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

  load();
  setInterval(load, 60000); // calm refresh
})();
