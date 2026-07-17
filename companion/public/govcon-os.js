/* govcon-os.js — the UNIFIED GovCon OS board (U1a).
 *
 * WHY THIS FILE EXISTS: the 2026-07-17 audit found /api/gov-board rendered by FOUR different renderers
 * (govboard.js, govcon.js:533, a paste-in at govcon.html:224, and a client-derived list in home.js:299) —
 * four card layouts, four "whose move" definitions, and four stage vocabularies that disagreed with each
 * other. This is the ONE renderer that replaces all four.
 *
 * THE RULE THAT KILLS THE DRIFT: columns are whatever /api/gov-board returns — labels, order, hints and
 * all. We never hardcode a stage name here. The board is DERIVED from live truth (pods/gov/pipeline.mjs),
 * so the UI cannot invent a vocabulary the backend doesn't have. That's also why cards aren't draggable:
 * a card sits in a column because that's genuinely where the deal IS. Dragging would let the board lie.
 * State changes happen through real actions (Won/Lost/Pass → /api/gov-board/disposition).
 *
 * HONESTY: money.pipeline is often 0 (values aren't set on most notices). We print the real number or an
 * honest "not priced yet" — never a plausible-looking placeholder. Same for an empty column.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var DATA = null, FILTER = '';

  // ── PURE-ish view helpers ───────────────────────────────────────────────────────────────────────
  function daysLeft(deadline) {
    if (!deadline) return null;
    var t = Date.parse(deadline); if (isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
  }
  function dueChip(deadline) {
    var d = daysLeft(deadline);
    if (d == null) return '';
    if (d < 0) return '<span class="gos-chip due now"><i class="ti ti-clock-x"></i> closed</span>';
    if (d === 0) return '<span class="gos-chip due now"><i class="ti ti-clock-hour-4"></i> due today</span>';
    var cls = d <= 7 ? 'gos-chip due now' : d <= 21 ? 'gos-chip due' : 'gos-chip';
    return '<span class="' + cls + '"><i class="ti ti-clock-hour-4"></i> ' + d + 'd left</span>';
  }
  function stars(fit) {
    var n = Math.max(0, Math.min(5, Number(fit) || 0)), out = '';
    for (var i = 1; i <= 5; i++) out += '<i class="ti ti-star-filled' + (i > n ? ' off' : '') + '"></i>';
    return '<div class="gos-stars" title="Fit ' + n + '/5">' + out + '</div>';
  }
  function money(n) {
    var v = Number(n) || 0;
    if (!v) return null;
    return v >= 1000 ? '$' + Math.round(v / 1000) + 'k' : '$' + v.toLocaleString('en-US');
  }
  function matches(card, q) {
    if (!q) return true;
    var hay = (card.title + ' ' + card.agency + ' ' + card.place + ' ' + card.setAside + ' ' + card.naics).toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  }

  // ── the ONE card ────────────────────────────────────────────────────────────────────────────────
  function cardHtml(c) {
    var out = c.inLane === false;
    var d = daysLeft(c.deadline);
    var hot = !out && d != null && d >= 0 && d <= 7;
    var who = (c.next && c.next.who) === 'you' ? 'you' : 'jarvis';
    var val = money(c.value);

    var chips = '';
    if (out) chips += '<span class="gos-chip out"><i class="ti ti-ban"></i> out of lane</span>';
    if (c.setAside) chips += '<span class="gos-chip">' + esc(c.setAside) + '</span>';
    chips += dueChip(c.deadline);

    return '<article class="gos-card' + (out ? ' out' : '') + (hot ? ' hot' : '') + '" data-id="' + esc(c.noticeId) + '">' +
      '<div class="ttl">' + esc(c.title) + '</div>' +
      '<div class="meta"><i class="ti ti-building-bank"></i> ' + esc(c.agency || '—') +
        (c.place ? ' · ' + esc(c.place) : '') + '</div>' +
      stars(c.fit) +
      (chips ? '<div class="gos-chips">' + chips + '</div>' : '') +
      '<div class="gos-cardfoot">' +
        '<span class="gos-move">Whose move:' +
          '<span class="gos-av ' + who + '" title="' + esc((c.next && c.next.text) || '') + '">' + (who === 'you' ? 'Y' : 'J') + '</span>' +
        '</span>' +
        '<span class="gos-val">' + (val ? val : '<span title="No value on the notice yet">not priced</span>') + '</span>' +
      '</div>' +
      '<div class="gos-acts">' +
        '<button class="gos-act pri" data-act="wizard">Submit step-by-step</button>' +
        '<button class="gos-act" data-act="sam">SAM ↗</button>' +
        '<button class="gos-act won" data-act="won">Won</button>' +
        '<button class="gos-act lost" data-act="lost">Lost</button>' +
        '<button class="gos-act" data-act="passed">Pass</button>' +
      '</div>' +
    '</article>';
  }

  function render() {
    var d = DATA, board = $('gosBoard');
    if (!d || !Array.isArray(d.columns)) { board.innerHTML = '<div class="gos-loading">Could not load the board.</div>'; return; }

    // Columns come from the API — never hardcoded here. One vocabulary, one source.
    board.innerHTML = d.columns.map(function (col) {
      var cards = (col.cards || []).filter(function (c) { return matches(c, FILTER); });
      var body = cards.length
        ? cards.map(cardHtml).join('')
        : '<div class="gos-empty">' + (FILTER ? 'Nothing here matches “' + esc(FILTER) + '”.' : 'Nothing in this stage yet.') + '</div>';
      return '<section class="gos-col" data-col="' + esc(col.key) + '">' +
        '<div class="gos-colhead"><div class="n"><span class="gos-caps">' + esc(col.label) + '</span>' +
          '<span class="gos-count">' + cards.length + '</span></div></div>' +
        (col.hint ? '<div class="gos-colhint">' + esc(col.hint) + '</div>' : '') +
        '<div class="gos-cards">' + body + '</div>' +
      '</section>';
    }).join('');

    // Next move — the single accent element.
    var na = d.yourNextAction;
    if (na && na.title) {
      $('gosNext').hidden = false;
      var dl = daysLeft(na.deadline);
      var when = dl == null ? '' : dl < 0 ? ' — deadline passed' : dl === 0 ? ' — closes TODAY'
        : dl <= 7 ? ' — closes in ' + dl + (dl === 1 ? ' day' : ' days') : '';
      $('gosNextTitle').textContent = na.title + when;
      $('gosNextTitle').title = na.text || '';
      $('gosNextBtn').onclick = function () { openWizard(na.noticeId); };
    } else { $('gosNext').hidden = true; }

    // Money band — real numbers or an honest blank. Never a plausible placeholder.
    var m = d.money || {}, parts = [];
    parts.push(m.pipeline ? 'Pipeline value: <b>$' + Number(m.pipeline).toLocaleString('en-US') + '</b>'
                          : 'Pipeline value: <b>—</b> <span title="Most SAM notices carry no dollar value until pricing">not priced yet</span>');
    if (m.estRevenue) parts.push('Projected: <b>$' + Number(m.estRevenue).toLocaleString('en-US') + '</b>');
    var youCount = (d.columns || []).reduce(function (n, col) {
      return n + (col.cards || []).filter(function (c) { return c.next && c.next.who === 'you'; }).length;
    }, 0);
    $('gosMoney').innerHTML =
      '<div class="grp">' + parts.join('<span class="sep">·</span>') + '</div>' +
      '<div class="grp"><span><span class="dot"></span>Waiting on you: <b>' + youCount + '</b></span>' +
      '<span>Open: <b>' + (d.total || 0) + '</b></span></div>';
  }

  // ── actions ─────────────────────────────────────────────────────────────────────────────────────
  function openWizard(noticeId) {
    if (window.SubmitWizard && window.SubmitWizard.open) window.SubmitWizard.open(noticeId);
    else window.location.href = '/govcon?opp=' + encodeURIComponent(noticeId);
  }
  function findCard(id) {
    var all = (DATA && DATA.columns || []).reduce(function (a, c) { return a.concat(c.cards || []); }, []);
    return all.find(function (c) { return c.noticeId === id; }) || null;
  }
  function disposition(noticeId, stage, label) {
    var c = findCard(noticeId);
    if (!confirm('Mark “' + (c ? c.title : noticeId) + '” as ' + label + '?')) return;
    fetch('/api/gov-board/disposition', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noticeId: noticeId, stage: stage, title: c && c.title, agency: c && c.agency })
    }).then(function (r) { return r.json(); }).then(function () { load(); })
      .catch(function () { alert('Could not record that — try again.'); });
  }

  document.addEventListener('click', function (e) {
    var act = e.target.closest('.gos-act');
    var card = e.target.closest('.gos-card');
    if (act && card) {
      e.stopPropagation();
      var id = card.getAttribute('data-id'), a = act.getAttribute('data-act'), c = findCard(id);
      if (a === 'wizard') return openWizard(id);
      if (a === 'sam') return c && c.url ? window.open(c.url, '_blank', 'noopener') : null;
      if (a === 'won') return disposition(id, 'won', 'WON 🏆');
      if (a === 'lost') return disposition(id, 'lost', 'lost (we’ll request the debrief)');
      if (a === 'passed') return disposition(id, 'passed', 'passed');
      return;
    }
    if (card) openWizard(card.getAttribute('data-id'));
  });

  $('gosNav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sec]'); if (!b) return;
    var sec = b.getAttribute('data-sec');
    if (sec === 'board') return;
    // U1b–U1e land these; until then be honest rather than showing an empty shell.
    alert(sec.charAt(0).toUpperCase() + sec.slice(1) + ' is being rebuilt into this screen next.\n\nFor now it still lives at its old page.');
  });

  var si = $('gosSearch');
  si.addEventListener('input', function () { FILTER = si.value.trim(); render(); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); si.focus(); si.select(); }
    if (e.key === 'Escape' && document.activeElement === si) { si.value = ''; FILTER = ''; render(); si.blur(); }
  });

  function load() {
    fetch('/api/gov-board').then(function (r) { return r.json(); })
      .then(function (d) { DATA = d; render(); })
      .catch(function () { $('gosBoard').innerHTML = '<div class="gos-loading">Could not reach the board.</div>'; });
  }
  load();
  setInterval(load, 60000);
  window.GovConOS = { reload: load };
})();
