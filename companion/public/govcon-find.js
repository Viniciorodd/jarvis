/* govcon-find.js — the FIND section of the unified GovCon OS (U1).
 *
 * WHY THIS FILE EXISTS: finding new work was scattered across THREE surfaces — /quickwins (one-off jobs),
 * /teaming (primes who owe a subcontracting plan), and the Map overlay (where the work is). Same question
 * ("where's my next dollar?"), three pages, three filter rows, three mental models. This is ONE screen with
 * ONE filter row and three LENSES on the same question.
 *
 * THE RULES THIS FILE KEEPS:
 *  - Nothing sends. The teaming intro is a DRAFT in an EDITABLE textarea that he copies into his own mail
 *    client. That was the behaviour of the old /teaming page and it is the behaviour that must survive —
 *    the /govcon panel's read-only <pre> was the regression, not the spec.
 *  - Clicks open the NEW drawer (window.GovConOS.openOpp), never the old ops.js overlay.
 *  - us-geo.js (196KB of baked offline geometry) loads LAZILY on first map open — it costs nothing until
 *    he asks for the map, and it is never a CDN.
 *  - Honest failure: a dead fetch prints one plain line. No spinner that lies, no fake data.
 */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function daysLeft(deadline) {
    if (!deadline) return null;
    var t = Date.parse(deadline); if (isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
  }
  function money(n) {
    var v = Number(n) || 0;
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + v.toLocaleString('en-US');
  }
  function exact(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  // ── state ─────────────────────────────────────────────────────────────────────────────────────────
  var ROOT = null, LENS = 'quick', FILTER = '', HIDE_CLOSED = true;
  var DAYS = { quick: 7, teaming: 120, map: 0 };      // each lens remembers its own range (old-page defaults)
  var DATA = { quick: null, teaming: null, map: null }; // null = never loaded
  var BUSY = { quick: false, teaming: false, map: false };
  var SPEND = null, GEO = null, GEO_TRIED = false;

  var RANGES = {
    quick:   { label: 'Posted in the last', opts: [[3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']] },
    teaming: { label: 'Awards in the last', opts: [[90, '90 days'], [120, '120 days'], [180, '6 months'], [365, '1 year']] },
    map:     { label: 'Due within', opts: [[0, 'any deadline'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [60, '60 days'], [90, '90 days']] }
  };

  // ── one-time CSS (existing vars only — both themes work) ───────────────────────────────────────────
  function css() {
    if (document.getElementById('gofCss')) return;
    var s = document.createElement('style');
    s.id = 'gofCss';
    s.textContent = [
      '.gof-lead{display:flex;align-items:flex-start;gap:11px}',
      '.gof-lead .gos-score{flex:0 0 auto}',
      '.gof-lead .col{flex:1;min-width:0}',
      '.gof-amt{margin-left:auto;align-self:center;font-size:15px;font-weight:700;color:var(--teal);white-space:nowrap}',
      '.gof-tags{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0 6px}',
      '.gof-acts{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}',
      '.gof-count{font-size:12px;color:var(--dim);margin:0 0 12px}',
      '.gos-chip.ss{color:var(--teal);border-color:rgba(var(--teal-rgb),.4)}',
      '.gos-chip.one{color:var(--warn);border-color:var(--warn)}',
      /* map */
      '.gof-map{display:grid;grid-template-columns:1fr 340px;gap:14px;align-items:start}',
      '.gof-mapbox{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px;position:relative}',
      '.gof-map svg{display:block;width:100%;height:auto}',
      '.gof-stlabel{fill:var(--dim);opacity:.55;font-size:7px;text-anchor:middle;pointer-events:none;font-weight:600}',
      '.gof-pin{cursor:pointer}',
      '.gof-pin:focus{outline:none}',
      '.gof-pin .glow{opacity:.18}',
      '.gof-pin:hover .glow,.gof-pin:focus .glow{opacity:.4}',
      '.gof-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--dim);padding:10px 4px 2px}',
      '.gof-legend i{font-size:12px;vertical-align:-1px;margin-right:4px}',
      '.gof-rail{display:flex;flex-direction:column;gap:8px;max-height:70vh;overflow-y:auto}',
      '.gof-row{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--teal);border-radius:9px;padding:10px 12px;cursor:pointer}',
      '.gof-row:hover{border-color:var(--dim);border-left-color:var(--teal)}',
      '.gof-row.hot{border-left-color:var(--warn)}',
      '.gof-row .t{font-size:13px;font-weight:600;line-height:1.35;margin-bottom:4px}',
      '.gof-row .s{display:flex;gap:9px;flex-wrap:wrap;font-size:11px;color:var(--dim)}',
      '.gof-row .s .hot{color:var(--warn)}',
      '.gof-row .s .go{margin-left:auto;color:var(--teal)}',
      /* intro sheet */
      '.gof-sheet{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:80}',
      '.gof-sheet[hidden]{display:none}',
      '.gof-sheet .in{background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:660px;width:100%;max-height:88vh;overflow:auto;padding:18px}',
      '.gof-sheet h3{margin:0 0 3px;font-size:17px}',
      '.gof-sheet textarea{width:100%;box-sizing:border-box;min-height:290px;background:var(--ink2);border:1px solid var(--line);border-radius:10px;color:var(--cream);padding:12px 14px;font:inherit;font-size:13.5px;line-height:1.55;resize:vertical;margin-top:12px}',
      '.gof-sheet textarea:focus{outline:none;border-color:var(--teal)}',
      '.gof-gate{font-size:11.5px;color:var(--warn);margin-top:10px;line-height:1.5}',
      '.gof-srow{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
      '@media (max-width:900px){.gof-map{grid-template-columns:1fr}.gof-rail{max-height:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── shared bar ────────────────────────────────────────────────────────────────────────────────────
  function rangeHtml() {
    var r = RANGES[LENS];
    return '<label class="gos-sub" for="gofDays">' + esc(r.label) + '</label>' +
      '<select class="gos-sel" id="gofDays">' + r.opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (Number(DAYS[LENS]) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
  }
  function barHtml() {
    return '<div class="gos-lens" id="gofLens">' +
        '<button data-lens="quick" class="' + (LENS === 'quick' ? 'on' : '') + '">Quick wins</button>' +
        '<button data-lens="teaming" class="' + (LENS === 'teaming' ? 'on' : '') + '">Teaming</button>' +
        '<button data-lens="map" class="' + (LENS === 'map' ? 'on' : '') + '">Map</button>' +
      '</div>' +
      '<span id="gofRange" style="display:flex;align-items:center;gap:8px">' + rangeHtml() + '</span>' +
      '<label class="gos-toggle" id="gofClosedWrap"' + (LENS === 'teaming' ? ' hidden' : '') + '>' +
        '<input type="checkbox" id="gofClosed"' + (HIDE_CLOSED ? ' checked' : '') + '> hide closed</label>' +
      '<button class="gos-linkbtn pri" id="gofScan" style="margin-left:auto"><i class="ti ti-radar-2"></i> Scan now</button>';
  }

  function mount(el) {
    css();
    ROOT = el;
    el.innerHTML = '<div class="gos-secbar" id="gofBar">' + barHtml() + '</div><div id="gofBody"></div>' +
      '<div class="gof-sheet" id="gofSheet" hidden><div class="in">' +
        '<h3 id="gofSheetName">Intro</h3><div class="gos-sub" id="gofSheetMeta"></div>' +
        '<textarea id="gofSheetText" spellcheck="true" aria-label="Draft intro — editable"></textarea>' +
        '<div class="gof-gate"><i class="ti ti-alert-triangle"></i> Nothing sends without your approval. Jarvis only drafts — edit this freely, copy it into your own email, attach the capability PDF, and send it yourself.</div>' +
        '<div class="gof-srow">' +
          '<button class="gos-linkbtn pri" id="gofCopy"><i class="ti ti-copy"></i> Copy the intro</button>' +
          '<a class="gos-linkbtn" href="/capability" target="_blank" rel="noreferrer"><i class="ti ti-file-text"></i> Capability PDF</a>' +
          '<button class="gos-linkbtn" id="gofSheetX">Close</button>' +
        '</div>' +
      '</div></div>';
    wire();
    load(false);
  }

  function wire() {
    ROOT.querySelector('#gofLens').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lens]'); if (!b) return;
      setLens(b.getAttribute('data-lens'));
    });
    ROOT.addEventListener('change', function (e) {
      if (e.target.id === 'gofDays') { DAYS[LENS] = Number(e.target.value) || 0; load(false); }
      if (e.target.id === 'gofClosed') { HIDE_CLOSED = !!e.target.checked; render(); }
    });
    ROOT.querySelector('#gofScan').addEventListener('click', function () { load(true); });
    ROOT.querySelector('#gofSheetX').addEventListener('click', closeSheet);
    ROOT.querySelector('#gofSheet').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });
    ROOT.querySelector('#gofCopy').addEventListener('click', copyIntro);
    document.addEventListener('keydown', function (e) {
      var sh = ROOT && ROOT.querySelector('#gofSheet');
      if (e.key === 'Escape' && sh && !sh.hidden) { e.stopPropagation(); closeSheet(); }
    });
    // Card + pin + row clicks (delegated once).
    ROOT.addEventListener('click', function (e) {
      var draft = e.target.closest('[data-draft]');
      if (draft) return openIntro(Number(draft.getAttribute('data-draft')));
      var hit = e.target.closest('[data-notice]');
      if (hit) return openOpp(hit.getAttribute('data-notice'));
    });
    ROOT.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var hit = e.target.closest && e.target.closest('.gof-pin[data-notice]');
      if (hit) { e.preventDefault(); openOpp(hit.getAttribute('data-notice')); }
    });
  }

  function setLens(l) {
    if (!RANGES[l] || l === LENS) return;
    LENS = l;
    [].forEach.call(ROOT.querySelectorAll('#gofLens button'), function (b) { b.classList.toggle('on', b.getAttribute('data-lens') === l); });
    ROOT.querySelector('#gofRange').innerHTML = rangeHtml();
    ROOT.querySelector('#gofClosedWrap').hidden = (l === 'teaming');
    load(false);
  }

  // The drawer — the NEW one. Never the old ops.js overlay.
  function openOpp(id) {
    if (!id) return;
    var os = window.GovConOS;
    if (os && os.openOpp) return os.openOpp(id, os.findCard ? os.findCard(id) : null);
    window.open('/govcon-os?opp=' + encodeURIComponent(id), '_self');
  }

  // ── loading ───────────────────────────────────────────────────────────────────────────────────────
  function body() { return ROOT.querySelector('#gofBody'); }

  function load(force) {
    var lens = LENS;
    if (BUSY[lens]) return;
    if (!force && DATA[lens] && DATA[lens].days === DAYS[lens]) return render();
    BUSY[lens] = true;
    var scan = ROOT.querySelector('#gofScan');
    scan.disabled = true; scan.innerHTML = '<i class="ti ti-loader-2"></i> Scanning…';
    body().innerHTML = '<div class="gos-loading">' + (
      lens === 'quick' ? 'Scanning SAM.gov across your lane…' :
      lens === 'teaming' ? 'Scanning federal awards for primes who need a sub…' :
      'Loading the map and federal spend…') + '</div>';

    var done = function () {
      BUSY[lens] = false;
      if (LENS === lens) { scan.disabled = false; scan.innerHTML = '<i class="ti ti-radar-2"></i> Scan now'; render(); }
      else { scan.disabled = false; scan.innerHTML = '<i class="ti ti-radar-2"></i> Scan now'; }
    };

    if (lens === 'map') return loadMap(DAYS.map).then(done, done);
    var url = lens === 'quick' ? '/api/gov/quickwins?days=' + DAYS.quick : '/api/gov/teaming?days=' + DAYS.teaming;
    fetch(url).then(function (r) { return r.json(); })
      .then(function (d) {
        DATA[lens] = d && d.ok
          ? { days: DAYS[lens], leads: d.leads || [], count: d.count || (d.leads || []).length }
          : { days: DAYS[lens], error: (d && d.error) || 'unknown' };
      })
      .catch(function () { DATA[lens] = { days: DAYS[lens], error: 'offline' }; })
      .then(done);
  }

  // us-geo.js is 196KB of baked geometry — load it ONLY when the map lens is first opened, and never
  // from a CDN. One injected <script>, one attempt; a failure degrades to the list, honestly.
  function ensureGeo() {
    if (GEO_TRIED) return Promise.resolve(GEO);
    GEO_TRIED = true;
    if (window.US_GEO) { GEO = window.US_GEO; return Promise.resolve(GEO); }
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = 'us-geo.js';
      s.onload = function () { GEO = window.US_GEO || null; res(GEO); };
      s.onerror = function () { GEO = null; res(null); };
      document.head.appendChild(s);
    });
  }

  function loadMap() {
    var ops = fetch('/api/operations').then(function (r) { return r.json(); })
      .then(function (d) { return { opps: (d && d.opportunities) || [] }; })
      .catch(function () { return { error: 'offline' }; });
    var spend = fetch('/api/gov/spending').then(function (r) { return r.json(); })
      .then(function (d) { return d && Array.isArray(d.results) ? d : null; })
      .catch(function () { return null; });
    return Promise.all([ensureGeo(), ops, spend]).then(function (r) {
      SPEND = r[2];
      DATA.map = r[1].error ? { days: DAYS.map, error: r[1].error } : { days: DAYS.map, opps: r[1].opps };
    });
  }

  // ── render ────────────────────────────────────────────────────────────────────────────────────────
  function render() {
    if (!ROOT) return;
    if (BUSY[LENS]) return;
    if (LENS === 'quick') return renderQuick();
    if (LENS === 'teaming') return renderTeaming();
    return renderMap();
  }
  function errLine(d) {
    var e = d.error === 'no SAM_API_KEY' ? 'SAM API key not set — add SAM_API_KEY to .env.' : 'Could not scan: ' + esc(d.error);
    return '<div class="gos-empty">' + e + '</div>';
  }
  function hit(hay) { return !FILTER || hay.toLowerCase().indexOf(FILTER.toLowerCase()) >= 0; }

  // LENS 1 — QUICK WINS (/api/gov/quickwins)
  function renderQuick() {
    var d = DATA.quick;
    if (!d) return;
    if (d.error) return void (body().innerHTML = errLine(d));
    var rows = d.leads.filter(function (l) {
      if (HIDE_CLOSED) { var dl = daysLeft(l.due); if (dl != null && dl < 0) return false; }
      return hit([l.title, l.agency, l.naics, l.setAside, l.sol, l.why].join(' '));
    });
    body().innerHTML =
      '<div class="gof-count">' + rows.length + ' of ' + d.count + ' quick win' + (d.count === 1 ? '' : 's') +
        ' in your lane — one-off jobs the main scout misses, ranked by fit.</div>' +
      (rows.length ? '<div class="gos-grid">' + rows.map(quickCard).join('') + '</div>'
        : '<div class="gos-empty">' + (FILTER ? 'Nothing matches “' + esc(FILTER) + '”.' : 'No quick wins in this window. Widen the days.') + '</div>');
  }
  function quickCard(l) {
    var dl = daysLeft(l.due), chips = '';
    if (dl != null) {
      chips += dl < 0 ? '<span class="gos-chip due now"><i class="ti ti-clock-x"></i> closed</span>'
        : '<span class="gos-chip' + (dl <= 7 ? ' due now' : '') + '"><i class="ti ti-clock-hour-4"></i> ' + dl + 'd left</span>';
    }
    if (l.sourcesSought) chips += '<span class="gos-chip ss">sources-sought</span>';
    if (l.oneTime) chips += '<span class="gos-chip one">one-time</span>';
    if (l.naics) chips += '<span class="gos-chip">NAICS ' + esc(l.naics) + '</span>';
    if (l.setAside && l.setAside !== 'none stated') chips += '<span class="gos-chip">' + esc(l.setAside) + '</span>';
    return '<article class="gos-panel">' +
      '<div class="gof-lead"><div class="gos-score">' + esc(l.score) + '</div><div class="col">' +
        '<h3 class="gos-h2">' + esc(l.title) + '</h3>' +
        '<div class="gos-sub">' + esc(l.agency || '—') + (l.sol ? ' · ' + esc(l.sol) : '') + '</div>' +
      '</div></div>' +
      '<div class="gof-tags gos-chips">' + chips + '</div>' +
      '<div class="gos-why">' + esc(l.why || '') + '</div>' +
      '<div class="gof-acts">' +
        (l.link ? '<a class="gos-linkbtn pri" href="' + esc(l.link) + '" target="_blank" rel="noreferrer">Open on SAM ↗</a>' : '') +
        '<a class="gos-linkbtn" href="/capability" target="_blank" rel="noreferrer"><i class="ti ti-file-text"></i> Capability PDF</a>' +
      '</div></article>';
  }

  // LENS 2 — TEAMING (/api/gov/teaming)
  function renderTeaming() {
    var d = DATA.teaming;
    if (!d) return;
    if (d.error) return void (body().innerHTML = errLine(d));
    var rows = [];
    d.leads.forEach(function (l, i) {
      if (hit([l.recipient, l.agency, l.state, l.naics, l.awardId, l.why].join(' '))) rows.push({ l: l, i: i });
    });
    body().innerHTML =
      '<div class="gof-count">' + rows.length + ' of ' + d.count + ' prime' + (d.count === 1 ? '' : 's') +
        ' who just won over $750k — they must carry a small-business subcontracting plan. Jarvis drafts the intro; <b>you send it</b>.</div>' +
      (rows.length ? '<div class="gos-grid">' + rows.map(function (r) { return teamCard(r.l, r.i); }).join('') + '</div>'
        : '<div class="gos-empty">' + (FILTER ? 'Nothing matches “' + esc(FILTER) + '”.' : 'No qualifying primes in this window. Widen the range.') + '</div>');
  }
  function teamCard(l, i) {
    var meta = [l.agency, l.state, l.naics ? 'NAICS ' + l.naics : ''].filter(Boolean).join(' · ');
    return '<article class="gos-panel">' +
      '<div class="gof-lead"><div class="gos-score">' + esc(l.score) + '</div>' +
        '<div class="col"><h3 class="gos-h2">' + esc(l.recipient) + '</h3>' +
        '<div class="gos-sub">' + esc(meta) + '</div></div>' +
        '<div class="gof-amt" title="' + esc(exact(l.amount)) + '">' + esc(money(l.amount)) + '</div>' +
      '</div>' +
      '<div class="gos-why" style="margin-top:8px">' + esc(l.why || '') + '</div>' +
      '<div class="gof-acts">' +
        '<button class="gos-linkbtn pri" data-draft="' + i + '">✍ Draft intro</button>' +
        (l.awardId ? '<a class="gos-linkbtn" href="https://www.usaspending.gov/award/' + encodeURIComponent(l.awardId) +
          '" target="_blank" rel="noreferrer">View award ↗</a>' : '') +
      '</div></article>';
  }

  // The intro sheet: an EDITABLE draft. Jarvis writes the first pass; he owns every word and the send.
  function openIntro(i) {
    var d = DATA.teaming, l = d && d.leads && d.leads[i];
    if (!l) return;
    ROOT.querySelector('#gofSheetName').textContent = 'Intro to ' + l.recipient;
    ROOT.querySelector('#gofSheetMeta').textContent = money(l.amount) + ' · ' + (l.agency || '') + (l.state ? ' · ' + l.state : '');
    var ta = ROOT.querySelector('#gofSheetText');
    ta.value = 'Drafting…'; ta.readOnly = true;
    ROOT.querySelector('#gofSheet').hidden = false;
    fetch('/api/gov/teaming/intro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prime: l, agency: l.agency })
    }).then(function (r) { return r.json(); })
      .then(function (r) { ta.value = r && r.ok ? r.letter : 'Could not draft that intro — write your own, or try again.'; })
      .catch(function () { ta.value = 'Offline — could not reach the drafter.'; })
      .then(function () { ta.readOnly = false; ta.focus(); });
  }
  function closeSheet() { ROOT.querySelector('#gofSheet').hidden = true; }
  function copyIntro() {
    var ta = ROOT.querySelector('#gofSheetText'), b = ROOT.querySelector('#gofCopy');
    ta.select();
    var ok = function () { b.innerHTML = '<i class="ti ti-check"></i> Copied'; setTimeout(function () { b.innerHTML = '<i class="ti ti-copy"></i> Copy the intro'; }, 1500); };
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(ok, function () { document.execCommand('copy'); ok(); });
      else { document.execCommand('copy'); ok(); }
    } catch (e) { /* the text is selected — he can still hit ctrl-C */ }
  }

  // LENS 3 — MAP (/api/operations + /api/gov/spending)
  var ST_OK = null;
  function stateOf(o) {                                   // ported from map.js — placeState first, then ", XX"
    var pins = (GEO && GEO.pins) || {};
    var s = String(o.placeState || '').toUpperCase().match(/[A-Z]{2}/);
    if (s && pins[s[0]]) return s[0];
    var m = String(o.place || '').toUpperCase().match(/,\s*([A-Z]{2})\b/);
    return m && pins[m[1]] ? m[1] : null;
  }
  function pinColor(du) { return du != null && du >= 0 && du <= 7 ? 'var(--warn)' : 'var(--teal)'; }

  function renderMap() {
    var d = DATA.map;
    if (!d) return;
    if (d.error) return void (body().innerHTML = '<div class="gos-empty">Could not reach the opportunity feed.</div>');
    ST_OK = (GEO && GEO.pins) || null;

    var view = d.opps.map(function (o) { return { o: o, st: stateOf(o), du: daysLeft(o.deadline) }; })
      .filter(function (x) {
        if (HIDE_CLOSED && x.du != null && x.du < 0) return false;
        if (DAYS.map) { if (x.du == null || x.du < 0 || x.du > DAYS.map) return false; }
        return hit([x.o.title, x.o.agency, x.o.place, x.o.placeState, x.o.setAside].join(' '));
      });

    var urgent = view.filter(function (x) { return x.du != null && x.du >= 0 && x.du <= 7; }).length;
    var list = view.slice().sort(function (a, b) { return (a.du == null ? 1e9 : a.du) - (b.du == null ? 1e9 : b.du); });

    body().innerHTML = '<div class="gof-count">' + view.length + ' opportunit' + (view.length === 1 ? 'y' : 'ies') +
        ' on the map · ' + urgent + ' closing in ≤7 days' +
        (SPEND ? ' · federal spend bubbles: ' + esc(SPEND.period || '') + ' ' + esc(money(SPEND.total)) + ' in your NAICS' : '') + '</div>' +
      '<div class="gof-map">' +
        '<div><div class="gof-mapbox">' + mapSvg(view) + '</div>' + legend() + '</div>' +
        '<div class="gof-rail">' + (list.length ? list.map(rowHtml).join('')
          : '<div class="gos-empty">' + (FILTER ? 'Nothing matches “' + esc(FILTER) + '”.' : 'No opportunities match the filter.') + '</div>') + '</div>' +
      '</div>';
  }

  function legend() {
    return '<div class="gof-legend">' +
      '<span><i class="ti ti-circle-filled" style="color:var(--teal)"></i>tracking</span>' +
      '<span><i class="ti ti-circle-filled" style="color:var(--warn)"></i>due ≤7d</span>' +
      '<span><i class="ti ti-circle-filled" style="color:var(--teal);font-size:15px"></i>strong fit (score ≥80 — bigger dot)</span>' +
      '<span><i class="ti ti-circle" style="color:var(--teal)"></i>federal $ in that state (bubble size)</span>' +
    '</div>';
  }

  function mapSvg(view) {
    if (!GEO || !GEO.statesPath || !ST_OK) {
      return '<div class="gos-empty">Map geometry (us-geo.js) didn’t load — the list beside it still works.</div>';
    }
    var W = GEO.W || 640, H = GEO.H || 388, pins = GEO.pins;

    // Soft federal-spend bubbles behind everything: area ∝ dollars, so √ the amount (a linear radius
    // would make New Mexico swallow the map). Capped so one outlier can't drown the pins.
    var bubbles = '';
    if (SPEND && SPEND.results && SPEND.results.length) {
      var max = SPEND.results.reduce(function (m, r) { return Math.max(m, Number(r.amount) || 0); }, 0) || 1;
      bubbles = SPEND.results.map(function (r) {
        var xy = pins[String(r.state || '').toUpperCase()]; if (!xy) return '';
        var v = Number(r.amount) || 0; if (v <= 0) return '';
        var rad = 4 + 26 * Math.sqrt(v / max);
        return '<circle cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + rad.toFixed(1) + '"' +
          ' style="fill:rgba(var(--teal-rgb),.10);stroke:rgba(var(--teal-rgb),.18);stroke-width:.5"' +
          ' pointer-events="none"><title>' + esc(r.name || r.state) + ' — ' + esc(money(v)) + ' federal spend in your NAICS</title></circle>';
      }).join('');
    }

    var labels = Object.keys(pins).map(function (code) {
      var xy = pins[code];
      return '<text class="gof-stlabel" x="' + xy[0].toFixed(1) + '" y="' + (xy[1] + 3).toFixed(1) + '">' + esc(code) + '</text>';
    }).join('');

    var dots = view.filter(function (x) { return x.st && pins[x.st]; }).map(function (x) {
      var xy = pins[x.st], c = pinColor(x.du), strong = Number(x.o.score) >= 80;
      var due = x.du == null ? 'no deadline' : x.du < 0 ? 'closed' : 'due in ' + x.du + 'd';
      return '<g class="gof-pin" data-notice="' + esc(x.o.noticeId || '') + '" tabindex="0" role="button"' +
          ' aria-label="' + esc((x.o.title || 'opportunity') + ' — ' + x.st + ', ' + due) + '">' +
        '<circle class="glow" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + (strong ? 11 : 9) + '" style="fill:' + c + '"/>' +
        '<circle cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + (strong ? 5.2 : 3.8) + '" style="fill:' + c + '">' +
          '<title>' + esc(x.o.title || 'opportunity') + ' (' + esc(x.st) + ') — ' + esc(due) + ' — click to open</title></circle>' +
      '</g>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="US map of open opportunities">' +
      '<path d="' + GEO.statesPath + '" style="fill:rgba(var(--teal-rgb),.035);stroke:rgba(var(--teal-rgb),.32);stroke-width:.7;stroke-linejoin:round"/>' +
      (GEO.meshPath ? '<path d="' + GEO.meshPath + '" style="fill:none;stroke:rgba(var(--teal-rgb),.5);stroke-width:.4"/>' : '') +
      bubbles + labels + dots +
    '</svg>';
  }

  function rowHtml(x) {
    var hotly = x.du != null && x.du >= 0 && x.du <= 7;
    var where = [x.o.place, x.st].filter(Boolean).join(', ') || x.st || '—';
    return '<div class="gof-row' + (hotly ? ' hot' : '') + '" data-notice="' + esc(x.o.noticeId || '') + '" role="button" tabindex="0">' +
      '<div class="t">' + esc(x.o.title || 'opportunity') + '</div>' +
      '<div class="s"><span><i class="ti ti-map-pin"></i> ' + esc(where) + '</span>' +
        (x.du != null ? '<span class="' + (hotly ? 'hot' : '') + '"><i class="ti ti-clock-hour-4"></i> ' +
          (x.du < 0 ? 'closed' : 'due in ' + x.du + 'd') + '</span>' : '') +
        (x.o.score != null ? '<span><i class="ti ti-target"></i> ' + esc(x.o.score) + '/100</span>' : '') +
        '<span class="go">open ›</span></div>' +
    '</div>';
  }

  // ── contract ──────────────────────────────────────────────────────────────────────────────────────
  window.GovConSections = window.GovConSections || {};
  window.GovConSections.find = {
    mount: mount,
    refresh: function () { if (ROOT) load(false); },
    filter: function (q) { FILTER = String(q || '').trim(); render(); }
  };
})();
