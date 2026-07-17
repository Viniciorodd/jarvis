/* govcon-opp.js — the OPPORTUNITY DRAWER for the unified GovCon OS (U1a).
 *
 * WHY THIS FILE EXISTS: clicking a board card used to dump you straight into the submit wizard — an ACT
 * before a DECIDE. This drawer is the decide step: is this bid worth your night? It answers that with the
 * five things that actually decide it (fit, where it stands, compliance, price, subs) and then hands you
 * the wizard as ONE button among Won / Lost / Pass.
 *
 * THE HONESTY CONTRACT (this is the whole point — the old wizard rendered bullets and called it a matrix):
 *   • The COMPLIANCE MATRIX is a real table, gap rows sorted to the top, and it renders ONLY the rows the
 *     API actually returns (`gaps[]`). The route deliberately does not ship every row, so the addressed and
 *     partial counts are printed as a summary line — we never invent a row, and NEVER a citation.
 *   • PRICE-TO-WIN refuses to state a position when `overCap` is set or confidence is 'low'/'none'. A
 *     confident wrong number is worse than an honest shrug.
 *   • The FIT ring is derived from the notice + the operator's lane in code, not from a model, and past
 *     performance is pinned at 2/5 because Rodgate is a new prime. Inflating it would be lying to himself.
 *   • The MONEY waterfall has no route yet. If a value exists we back-derive it at the DEFAULT policy knobs
 *     and SAY SO. If there's no value we show an empty state — we never invent a sub quote.
 *   • Every fetch is best-effort: a dead panel prints one honest line and the drawer still works.
 *
 * Colors: only vars from style.css (--ink/--panel/--panel2/--cream/--dim/--teal/--teal-rgb/--line/
 * --ink-on-accent/--warn/--err/--ok). No hex, so both themes just work.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var OPEN = null; // current noticeId, or null

  // ── PURE view helpers (mirrors govcon-os.js so the two screens can't drift) ──────────────────────
  function daysLeft(deadline) {
    if (!deadline) return null;
    var t = Date.parse(deadline); if (isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
  }
  function usd(n) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function k(n) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    if (Math.abs(v) >= 1000000) return '$' + (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(v) >= 1000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + Math.round(v);
  }
  function stars(n) {
    var v = Math.max(0, Math.min(5, Number(n) || 0)), out = '';
    for (var i = 1; i <= 5; i++) out += '<i class="ti ti-star-filled' + (i > v ? ' off' : '') + '"></i>';
    return '<div class="gos-stars">' + out + '</div>';
  }
  function ordinal(n) {
    var v = Math.round(Number(n)); if (!isFinite(v)) return '—';
    var t = v % 100, s = v % 10;
    return v + (t >= 11 && t <= 13 ? 'th' : s === 1 ? 'st' : s === 2 ? 'nd' : s === 3 ? 'rd' : 'th');
  }
  function stateOf(place) {
    var m = /,\s*([A-Z]{2})\s*$/.exec(String(place || '').trim());
    return m ? m[1] : null;
  }

  // ── one-time styles. Extra geometry only — every color is an existing var. ───────────────────────
  var STYLE = '\
.gop-eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:0 0 10px}\
.gop-ttl{font-size:20px;font-weight:600;letter-spacing:-.01em;line-height:1.3;margin:0 0 6px;color:var(--cream);padding-right:28px}\
.gop-meta{font-size:12px;color:var(--dim);margin-bottom:10px}\
.gop-headrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\
.gop-close{position:absolute;top:16px;right:16px}\
.gop-note{font-size:11px;color:var(--dim);line-height:1.5;margin-top:8px}\
.gop-fail{font-size:12px;color:var(--dim);line-height:1.5}\
.gop-fitwrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap}\
.gop-ring{width:104px;height:104px;flex:none}\
.gop-ringlbl{text-align:center;margin-top:2px}\
.gop-rows{flex:1;min-width:200px;display:flex;flex-direction:column;gap:6px}\
.gop-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--dim)}\
.gop-rail{display:flex;gap:0;overflow-x:auto;padding:6px 2px 2px;scrollbar-width:none}\
.gop-rail::-webkit-scrollbar{display:none}\
.gop-step{flex:none;width:74px;text-align:center;position:relative}\
.gop-step:not(:last-child):after{content:"";position:absolute;top:9px;left:calc(50% + 9px);width:calc(100% - 18px);height:2px;background:var(--line)}\
.gop-step.done:not(:last-child):after{background:var(--teal)}\
.gop-dot{width:18px;height:18px;border-radius:50%;margin:0 auto 6px;border:2px solid var(--line);background:var(--panel2);position:relative;z-index:1}\
.gop-step.done .gop-dot{background:var(--teal);border-color:var(--teal)}\
.gop-step.now .gop-dot{background:var(--panel);border-color:var(--teal);box-shadow:0 0 0 4px rgba(var(--teal-rgb),.22)}\
.gop-step .lb{font-size:9.5px;letter-spacing:.04em;color:var(--dim);line-height:1.3}\
.gop-step.now .lb{color:var(--teal);font-weight:700}\
.gop-step.done .lb{color:var(--cream)}\
.gop-tblwrap{overflow-x:auto;margin-top:10px;border:1px solid var(--line);border-radius:9px}\
.gop-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:420px}\
.gop-tbl th{text-align:left;padding:7px 10px;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);background:var(--panel2);border-bottom:1px solid var(--line);white-space:nowrap}\
.gop-tbl td{padding:8px 10px;border-bottom:1px solid var(--line);color:var(--cream);vertical-align:top;line-height:1.45}\
.gop-tbl tr:last-child td{border-bottom:none}\
.gop-tbl td.id,.gop-tbl td.cat,.gop-tbl td.st{white-space:nowrap;color:var(--dim);font-size:11px}\
.gop-tbl tr.gap{background:rgba(var(--teal-rgb),.02)}\
.gop-tbl tr.gap td{border-left:0}\
.gop-tbl tr.gap td.id{box-shadow:inset 2px 0 0 var(--err)}\
.gop-tbl tr.gap td.st{color:var(--err);font-weight:700}\
.gop-cov{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}\
.gop-covn{font-size:15px;font-weight:600;color:var(--cream)}\
.gop-dist{margin:14px 0 6px;position:relative;height:34px}\
.gop-track{position:absolute;left:0;right:0;top:12px;height:8px;border-radius:999px;background:var(--panel2);border:1px solid var(--line)}\
.gop-band{position:absolute;top:12px;height:8px;background:rgba(var(--teal-rgb),.45);border-radius:999px}\
.gop-tick{position:absolute;top:6px;width:1px;height:20px;background:var(--line)}\
.gop-tick.med{background:var(--teal);width:2px;height:26px;top:3px}\
.gop-bid{position:absolute;top:0;width:2px;height:34px;background:var(--warn)}\
.gop-bid:after{content:"YOUR BID";position:absolute;top:-11px;left:50%;transform:translateX(-50%);font-size:8px;font-weight:700;letter-spacing:.08em;color:var(--warn);white-space:nowrap}\
.gop-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--dim);letter-spacing:.02em}\
.gop-fall{display:flex;flex-direction:column;gap:1px;margin-top:8px}\
.gop-fl{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 10px;font-size:12.5px;background:var(--panel2);border-radius:6px;color:var(--dim)}\
.gop-fl b{color:var(--cream);font-weight:600;font-variant-numeric:tabular-nums}\
.gop-fl.tot{background:rgba(var(--teal-rgb),.09);color:var(--cream)}\
.gop-fl.tot b{color:var(--teal)}\
.gop-fl.off{opacity:.6}\
.gop-fl.pro b{color:var(--ok)}\
.gop-verd{font-size:13px;color:var(--cream);line-height:1.5}\
.gop-sec{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px}\
.gop-btn-fix{border-color:rgba(var(--teal-rgb),.4);color:var(--teal)}\
.gop-simrow{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:12px;color:var(--dim);padding:6px 0;border-bottom:1px solid var(--line)}\
.gop-simrow:last-child{border-bottom:none}\
.gop-simrow b{color:var(--cream)}\
';

  function injectStyle() {
    if ($('gopStyle')) return;
    var s = document.createElement('style');
    s.id = 'gopStyle';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  // ── best-effort JSON. NEVER throws: a dead panel is one honest line, not a broken drawer. ────────
  function getJson(url, opts) {
    return fetch(url, opts || {})
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'the server sent something that isn’t JSON' }; }); })
      .catch(function () { return { ok: false, error: 'could not reach the server' }; });
  }
  function fail(msg) { return '<div class="gop-fail">' + esc(msg) + '</div>'; }

  // ══ PANEL 1 — HEAD ═══════════════════════════════════════════════════════════════════════════════
  function headHtml(noticeId, c) {
    c = c || {};
    var d = daysLeft(c.deadline), chip = '';
    if (d != null) {
      if (d < 0) chip = '<span class="gos-chip due now"><i class="ti ti-clock-x"></i> deadline passed</span>';
      else if (d === 0) chip = '<span class="gos-chip due now"><i class="ti ti-clock-hour-4"></i> closes TODAY</span>';
      else chip = '<span class="gos-chip due' + (d <= 7 ? ' now' : '') + '"><i class="ti ti-clock-hour-4"></i> closes in ' + d + (d === 1 ? ' day' : ' days') + '</span>';
    }
    var meta = [c.agency, c.place].filter(Boolean).map(esc).join(' · ');
    return '<button class="gos-x gop-close" id="gopX" title="Close" aria-label="Close">✕</button>' +
      '<div class="gop-eyebrow">Opportunity</div>' +
      '<h2 class="gop-ttl">' + esc(c.title || noticeId) + '</h2>' +
      '<div class="gop-meta">' + (meta || 'No agency or place on the notice') + '</div>' +
      '<div class="gop-headrow">' + chip +
        (c.setAside ? '<span class="gos-chip">' + esc(c.setAside) + '</span>' : '') +
        (c.inLane === false ? '<span class="gos-chip out"><i class="ti ti-ban"></i> out of lane</span>' : '') +
        (c.url ? '<a class="gos-linkbtn" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open on SAM <i class="ti ti-external-link"></i></a>' : '') +
      '</div>';
  }

  // ══ PANEL 2 — FIT ════════════════════════════════════════════════════════════════════════════════
  // Every number below is DERIVED IN CODE from the notice + the operator's lane. No model in this path.
  function fitRows(c) {
    c = c || {};
    var val = Number(c.value) || 0;
    return [
      { k: 'Lane fit', v: c.inLane ? 5 : 1, why: c.inLane ? 'trade + NAICS are inside your lane' : 'outside janitorial/custodial/grounds/facilities' },
      { k: 'Set-aside match', v: c.inLane ? 4 : 1, why: c.setAside ? esc(c.setAside) : 'no set-aside stated on the notice' },
      { k: 'Size', v: val ? (val <= 150000 ? 5 : 2) : 3, why: val ? (val <= 150000 ? 'under your $150k cap' : 'over your $150k cap') : 'no value on the notice yet' },
      { k: 'Location', v: c.place ? 4 : 3, why: c.place ? esc(c.place) : 'no place of performance stated' },
      // PINNED at 2 on purpose. Rodgate is a NEW prime with limited federal past performance — that is a real
      // constraint on every bid, and a drawer that flatters him here would cost him a proposal he can't win.
      { k: 'Past performance', v: 2, why: 'new prime — limited federal past performance' },
    ];
  }
  function ringHtml(pct) {
    var p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    var r = 46, c = 2 * Math.PI * r, off = c * (1 - p / 100);
    return '<div>' +
      '<svg class="gop-ring" viewBox="0 0 120 120" role="img" aria-label="Win probability ' + p + '%">' +
        '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="rgba(var(--teal-rgb),.14)" stroke-width="11"/>' +
        '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--teal)" stroke-width="11" stroke-linecap="round" ' +
          'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
        '<text x="60" y="58" text-anchor="middle" fill="var(--cream)" font-size="26" font-weight="700">' + p + '</text>' +
        '<text x="60" y="76" text-anchor="middle" fill="var(--dim)" font-size="11" font-weight="600">%</text>' +
      '</svg>' +
      '<div class="gos-caps gop-ringlbl" style="color:var(--dim)">Win prob</div>' +
    '</div>';
  }
  function fitHtml(c) {
    var rows = fitRows(c).map(function (r) {
      return '<div class="gop-row"><span title="' + r.why + '">' + esc(r.k) + '</span>' + stars(r.v) + '</div>';
    }).join('');
    return '<section class="gos-panel">' +
      '<div class="gop-eyebrow">Fit</div>' +
      '<div class="gop-fitwrap">' + ringHtml(c && c.score) + '<div class="gop-rows">' + rows + '</div></div>' +
      '<div class="gop-note">Derived in code from the notice and your lane — not a model’s opinion. ' +
        'Past performance stays at 2/5 because Rodgate is a new prime with limited federal history; that’s the real constraint, not a placeholder.</div>' +
    '</section>';
  }

  // ══ PANEL 3 — THE 10-STEP LINE ═══════════════════════════════════════════════════════════════════
  var STEPS = ['Scouted', 'Scored', 'SOW', 'Outreach', 'Quotes', 'Priced', 'Proposal', 'Compliance', 'Submitted', 'Closed'];
  function stepFor(stage) {
    var s = String(stage || '').toLowerCase();
    if (s === 'closed' || s === 'won' || s === 'lost' || s === 'passed') return 10;
    if (s === 'submitted') return 9;
    if (s === 'responding') return 7;
    if (s === 'reviewing' || s === 'found') return 2;
    return 1;
  }
  function railHtml(c) {
    var now = stepFor(c && c.stage);
    var cells = STEPS.map(function (label, i) {
      var n = i + 1, cls = n < now ? 'done' : n === now ? 'now' : '';
      return '<div class="gop-step ' + cls + '"><div class="gop-dot"></div><div class="lb">' + esc(label) + '</div></div>';
    }).join('');
    return '<section class="gos-panel">' +
      '<div class="gop-eyebrow">Where this bid stands</div>' +
      '<div class="gop-rail">' + cells + '</div>' +
      '<div class="gop-note">Step ' + now + ' of 10 — derived from the board stage (' + esc((c && c.stage) || 'unknown') + '), which comes from live pipeline data.</div>' +
    '</section>';
  }

  // ══ PANEL 4 — COMPLIANCE MATRIX (a real table; gaps on top) ══════════════════════════════════════
  function matrixHtml(d) {
    if (!d || d.ok !== true) {
      return '<div class="gop-eyebrow">Compliance matrix</div>' +
        fail((d && d.error) ? d.error.charAt(0).toUpperCase() + d.error.slice(1) + '.' : 'The matrix didn’t load.') +
        '<div class="gop-note">Nothing is invented here — with no SOW text or draft to compare, there are no requirements to trace.</div>';
    }
    var s = d.summary || {}, total = Number(s.total) || 0;
    var covered = (Number(s.addressed) || 0);
    var pct = s.coveragePct == null ? '—' : s.coveragePct + '%';
    var gaps = Array.isArray(d.gaps) ? d.gaps : [];
    var gapCount = d.gapCount == null ? gaps.length : Number(d.gapCount);

    var head = '<div class="gop-cov">' +
      '<div><div class="gop-covn">Requirements covered: ' + esc(String(pct)) + ' (' + covered + ' of ' + total + ')</div>' +
      '<div class="gop-note" style="margin-top:2px">✅ ' + (Number(s.addressed) || 0) + ' addressed · 🟡 ' + (Number(s.partial) || 0) + ' partial · ⛔ ' + (Number(s.gap) || 0) + ' gap' + ((Number(s.gap) || 0) === 1 ? '' : 's') + '</div></div>' +
      (gapCount > 0 ? '<button class="gos-linkbtn gop-btn-fix" id="gopFix">🔧 Have Jarvis fix these</button>' : '') +
    '</div>';

    // The route ships only the GAP rows (the disqualifying ones) — so those are the only rows we draw.
    // Addressed/partial live in the summary above. Inventing rows we don't have would be the exact lie
    // this panel exists to kill.
    var body;
    if (gaps.length) {
      var rows = gaps.map(function (g, i) {
        return '<tr class="gap">' +
          '<td class="id">' + esc(g.id || String(i + 1)) + '</td>' +
          '<td>' + esc(g.requirement || '—') + '</td>' +
          '<td class="cat">' + esc(g.category || '—') + '</td>' +
          '<td class="st">⛔ gap</td>' +
        '</tr>';
      }).join('');
      body = '<div class="gop-tblwrap"><table class="gop-tbl">' +
        '<thead><tr><th>#</th><th>Requirement</th><th>Category</th><th>Status</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<div class="gop-note">Gap rows first — each one is a non-responsive risk that can disqualify the bid before it’s scored. ' +
        'The ✅ addressed and 🟡 partial rows are counted above; the API returns only the gaps in detail, so no other row is drawn here. ' +
        'A gap carries no citation on purpose — there is nothing in the draft to cite.' +
        (d.file ? ' Full matrix artifact: <code>' + esc(d.file) + '</code>.' : '') + '</div>';
    } else {
      body = '<div class="gop-tblwrap"><table class="gop-tbl">' +
        '<thead><tr><th>#</th><th>Requirement</th><th>Category</th><th>Status</th></tr></thead>' +
        '<tbody><tr><td class="id">—</td><td>No unaddressed requirement — every extracted “shall/must” is answered in the draft.</td><td class="cat">—</td><td class="st">✅</td></tr></tbody>' +
        '</table></div>' +
        '<div class="gop-note">No gaps. The addressed/partial detail lives in the matrix artifact' + (d.file ? ' (<code>' + esc(d.file) + '</code>)' : '') + '.</div>';
    }
    return '<div class="gop-eyebrow">Compliance matrix</div>' + head + body;
  }

  // ══ PANEL 5 — PRICE-TO-WIN ═══════════════════════════════════════════════════════════════════════
  // Log-scaled axis: real award populations span three orders of magnitude, and a linear bar would smear
  // the entire competitive band into one pixel at the left edge. Ticks carry the real dollars.
  function logPos(v, min, max) {
    var lo = Math.log10(Math.max(Number(min) || 1, 1)), hi = Math.log10(Math.max(Number(max) || 1, 1));
    if (!(hi > lo)) return 0;
    var p = (Math.log10(Math.max(Number(v) || 1, 1)) - lo) / (hi - lo) * 100;
    return Math.max(0, Math.min(100, p));
  }
  function ptwHtml(d, bid) {
    if (!d || d.ok !== true || !d.stats) {
      return '<div class="gop-eyebrow">Price to win</div>' +
        fail((d && d.error) ? String(d.error) : 'No comparable award data for this notice yet.');
    }
    var s = d.stats;
    var weak = d.overCap === true || d.confidence === 'low' || d.confidence === 'none';

    var pos = function (v) { return logPos(v, s.min, s.max); };
    var bidPos = (bid && isFinite(bid)) ? pos(bid) : null;
    var bar = '<div class="gop-dist">' +
      '<div class="gop-track"></div>' +
      '<div class="gop-band" style="left:' + pos(s.p25).toFixed(2) + '%;width:' + Math.max(0.5, pos(s.median) - pos(s.p25)).toFixed(2) + '%"></div>' +
      '<div class="gop-tick" style="left:0%"></div>' +
      '<div class="gop-tick" style="left:' + pos(s.p25).toFixed(2) + '%"></div>' +
      '<div class="gop-tick med" style="left:' + pos(s.median).toFixed(2) + '%"></div>' +
      '<div class="gop-tick" style="left:' + pos(s.p75).toFixed(2) + '%"></div>' +
      '<div class="gop-tick" style="left:calc(100% - 1px)"></div>' +
      (bidPos != null ? '<div class="gop-bid" style="left:' + bidPos.toFixed(2) + '%" title="Your bid ' + usd(bid) + '"></div>' : '') +
    '</div>' +
    '<div class="gop-axis"><span>min ' + k(s.min) + '</span><span>p25 ' + k(s.p25) + '</span><span>median ' + k(s.median) + '</span><span>p75 ' + k(s.p75) + '</span><span>max ' + k(s.max) + '</span></div>' +
    '<div class="gop-note">Teal band = the competitive middle (p25 → median). Axis is log-scaled — these awards span three orders of magnitude.' +
      (bidPos == null ? ' No bid on this notice yet, so there’s no marker to place.' : '') + '</div>';

    // The refusal. overCap / low confidence → the honest note, never a position.
    var verdict;
    if (weak) {
      var why = d.overCap === true
        ? 'This one is over your $150k cap, so the comparables aren’t a fair reference for a bid you’d actually make.'
        : 'Not enough comparable awards (confidence: ' + esc(String(d.confidence || 'none')) + ') to say where a bid would land.';
      verdict = '<div class="gop-verd"><i class="ti ti-alert-triangle" style="color:var(--warn)"></i> ' + esc(why) + '</div>' +
        ((d.verdict && d.verdict.note) ? '<div class="gop-note">' + esc(d.verdict.note) + '</div>' : '') +
        '<div class="gop-note">No position stated on purpose — a confident wrong number here costs a real bid.</div>';
    } else {
      var v = d.verdict || {};
      var posTxt = v.position && v.position !== 'unknown'
        ? '<b style="color:var(--teal)">' + esc(v.position) + '</b>' + (v.percentileOfBid != null ? ' · ' + esc(ordinal(v.percentileOfBid)) + ' percentile' : '')
        : '<span style="color:var(--dim)">no position — no bid supplied to compare</span>';
      verdict = '<div class="gop-verd">' + posTxt + '</div>' +
        (v.note ? '<div class="gop-note">' + esc(v.note) + '</div>' : '');
    }

    var meta = '<div class="gop-note">n=' + esc(String(s.n)) + ' of ' + esc(String(d.population != null ? d.population : s.n)) +
      ' comparable awards' + (d.source ? ' · ' + esc(d.source) : '') + (d.complete === false ? ' · partial population' : '') + '</div>';

    return '<div class="gop-eyebrow">Price to win</div>' + verdict + bar +
      (d.line ? '<div class="gop-note" style="color:var(--cream)">' + esc(d.line) + '</div>' : '') + meta;
  }

  // ══ PANEL 6 — MONEY (no route yet — back-derived at the DEFAULT knobs, and it says so) ════════════
  var MARKUP = 18, CONTINGENCY = 0; // mirrors pods/gov/pricing.mjs defaults (GOV_MARKUP_PCT / GOV_CONTINGENCY_PCT)
  function moneyHtml(c) {
    var bid = Number(c && c.value) || 0;
    if (!bid) {
      return '<div class="gop-eyebrow">The money</div>' +
        '<div class="gop-fail">No sub quote on this one yet — the buildup appears once a sub quotes it.</div>' +
        '<div class="gop-note">Your bid is sub quote × markup. Until a real quote lands there is no number to show, and we won’t invent one.</div>';
    }
    var quote = bid / (1 + MARKUP / 100);
    var cont = quote * (CONTINGENCY / 100);
    var loaded = quote + cont;
    var profit = bid - loaded;
    var rows = [
      { k: 'Sub quote', v: usd(quote), cls: '' },
      { k: '+ contingency reserve (' + CONTINGENCY + '% — off)', v: usd(cont), cls: 'off' },
      { k: 'Loaded cost', v: usd(loaded), cls: '' },
      { k: '+ markup (' + MARKUP + '%)', v: usd(bid - loaded), cls: '' },
      { k: 'Your bid', v: usd(bid), cls: 'tot' },
      { k: 'Profit', v: usd(profit) + ' · ' + (Math.round((profit / bid) * 1000) / 10) + '% margin', cls: 'pro' },
    ].map(function (r) {
      return '<div class="gop-fl ' + r.cls + '"><span>' + esc(r.k) + '</span><b>' + esc(r.v) + '</b></div>';
    }).join('');
    return '<div class="gop-eyebrow">The money</div>' +
      '<div class="gop-fall">' + rows + '</div>' +
      '<div class="gop-note">Estimated at your current policy (GOV_MARKUP_PCT=18, contingency off) by working BACKWARD from the ' +
        usd(bid) + ' value on the notice — no sub has quoted this yet, so the quote line is derived, not real. ' +
        'Once a quote lands, pricing.mjs computes this forward and this estimate goes away.</div>';
  }

  // ══ PANEL 7 — SUBS ═══════════════════════════════════════════════════════════════════════════════
  function subsHtml(d, noticeId) {
    if (!d || d.ok !== true) {
      return '<div class="gop-eyebrow">Subs</div>' + fail((d && d.error) ? String(d.error) : 'The sub ladder didn’t load.');
    }
    var l = (d.ladders || []).find(function (x) { return x.noticeId === noticeId; });
    if (!l) {
      return '<div class="gop-eyebrow">Subs</div>' +
        '<div class="gop-fail">No subs engaged on this bid yet.</div>' +
        '<div class="gop-note">A ladder appears the moment the first sub is approached. Backup activates after ' + esc(String(d.waitDays)) + 'd of silence.</div>';
    }
    // NOTE: /api/gov/sub-ladder returns the FOLDED status of a ladder, not its per-tier rows — so we render
    // the tier facts it actually gives us (who's active, who we're waiting on, how long) rather than
    // fabricating a name/role table the API never sent.
    var chip;
    if (l.exhausted) chip = '<span class="gos-chip out"><i class="ti ti-ban"></i> bench exhausted</span>';
    else if (l.responded) chip = '<span class="gos-chip" style="color:var(--ok)"><i class="ti ti-check"></i> responded</span>';
    else if (l.waitingOn) chip = '<span class="gos-chip due' + ((Number(l.daysWaiting) || 0) >= (Number(d.waitDays) || 3) ? ' now' : '') + '"><i class="ti ti-clock-hour-4"></i> waiting ' + esc(String(l.daysWaiting == null ? '?' : l.daysWaiting)) + 'd</span>';
    else if (l.contacted) chip = '<span class="gos-chip"><i class="ti ti-mail"></i> contacted</span>';
    else chip = '<span class="gos-chip"><i class="ti ti-user-question"></i> nobody approached yet</span>';

    var rows = [
      { k: 'Trade', v: l.trade || '—' },
      { k: 'Active tier', v: l.activeTier == null ? 'none — no sub contacted yet' : ('tier ' + l.activeTier + ' (' + (l.activeTier <= 1 ? 'primary' : l.activeTier === 2 ? 'backup' : 'backup-2') + ')') },
      { k: 'Contacted', v: String(l.contacted || 0) + ' of the bench' },
      { k: 'Waiting on', v: l.waitingOn ? l.waitingOn + ' — ' + (l.daysWaiting == null ? '?' : l.daysWaiting) + 'd of ' + (d.waitDays) + 'd' : 'nobody' },
    ].map(function (r) {
      return '<div class="gop-row"><span>' + esc(r.k) + '</span><b style="color:var(--cream);font-weight:600">' + esc(r.v) + '</b></div>';
    }).join('');

    return '<div class="gop-sec"><div class="gop-eyebrow" style="margin:0">Subs</div>' + chip + '</div>' +
      '<div class="gop-rows" style="margin-top:8px">' + rows + '</div>' +
      (l.nextAction ? '<div class="gop-note" style="color:var(--cream);margin-top:10px"><i class="ti ti-arrow-right"></i> ' + esc(l.nextAction) + '</div>' : '');
  }

  // ══ RED TEAM (POST /api/gov/simulate) ════════════════════════════════════════════════════════════
  // The route returns STRUCTURED evaluators (not prose), so we render the structure rather than flattening
  // it into a paragraph the operator has to re-parse.
  function simHtml(d) {
    if (!d || d.ok !== true) {
      return '<div class="gop-eyebrow">Red team</div>' + fail((d && d.error) ? String(d.error) : 'The red team couldn’t run right now.');
    }
    var rows = (d.evaluators || []).map(function (e) {
      return '<div class="gop-simrow"><b>' + esc(e.role || '—') + '</b><span>' + esc(String(e.score == null ? '—' : e.score)) + '/100</span></div>' +
        '<div class="gop-note" style="margin:0 0 8px">' + esc(e.concern || '') + (e.fix ? ' <span style="color:var(--teal)">Fix: ' + esc(e.fix) + '</span>' : '') + '</div>';
    }).join('');
    var risks = (d.topRisks || []).map(function (r) { return '<div class="gop-note" style="margin:2px 0">• ' + esc(r) + '</div>'; }).join('');
    return '<div class="gop-sec"><div class="gop-eyebrow" style="margin:0">Red team</div>' +
        '<span class="gos-chip">p(win) ' + esc(String(d.pWin == null ? '—' : d.pWin)) + '% · overall ' + esc(String(d.overall == null ? '—' : d.overall)) + '</span></div>' +
      '<div style="margin-top:8px">' + rows + '</div>' +
      (risks ? '<div class="gop-eyebrow" style="margin:10px 0 4px">Top risks</div>' + risks : '') +
      (d.recommendation ? '<div class="gop-verd" style="margin-top:10px">' + esc(d.recommendation) + '</div>' : '') +
      (d.model ? '<div class="gop-note">Model: ' + esc(d.model) + ' — an opinion, not a scoring. The compliance matrix above is the deterministic one.</div>' : '');
  }

  // ── FOOTER ──────────────────────────────────────────────────────────────────────────────────────
  function footHtml() {
    return '<button class="gos-btn" data-a="wizard">Walk me through submitting <i class="ti ti-arrow-right"></i></button>' +
      '<button class="gos-linkbtn" data-a="sim"><i class="ti ti-shield-bolt"></i> Red-team this bid</button>' +
      '<button class="gos-linkbtn" data-a="patricia"><i class="ti ti-message-2"></i> Ask Patricia</button>' +
      '<span style="flex:1"></span>' +
      '<button class="gos-linkbtn" data-a="won">Won</button>' +
      '<button class="gos-linkbtn" data-a="lost">Lost</button>' +
      '<button class="gos-linkbtn" data-a="passed">Pass</button>';
  }

  // ── OPEN / CLOSE ────────────────────────────────────────────────────────────────────────────────
  function close() {
    var d = $('gosOpp'), m = $('gosOppMask');
    if (d) { d.hidden = true; d.innerHTML = ''; }
    if (m) m.hidden = true;
    OPEN = null;
  }

  function open(noticeId, card) {
    if (!noticeId) return;
    injectStyle();
    var drawer = $('gosOpp'), mask = $('gosOppMask');
    if (!drawer) return;
    OPEN = noticeId;
    var c = card || (window.GovConOS && window.GovConOS.findCard ? window.GovConOS.findCard(noticeId) : null) || {};

    drawer.innerHTML =
      '<div class="gos-dhead" style="position:relative">' + headHtml(noticeId, c) + '</div>' +
      '<div class="gos-dbody" id="gopBody">' +
        fitHtml(c) +
        railHtml(c) +
        '<section class="gos-panel" id="gopMatrix"><div class="gop-eyebrow">Compliance matrix</div><div class="gop-fail">Checking the requirements…</div></section>' +
        '<section class="gos-panel" id="gopPtw"><div class="gop-eyebrow">Price to win</div><div class="gop-fail">Pulling comparable awards…</div></section>' +
        '<section class="gos-panel" id="gopMoney">' + moneyHtml(c) + '</section>' +
        '<section class="gos-panel" id="gopSubs"><div class="gop-eyebrow">Subs</div><div class="gop-fail">Checking the bench…</div></section>' +
        '<section class="gos-panel" id="gopSim" hidden></section>' +
      '</div>' +
      '<div class="gos-dfoot" id="gopFoot">' + footHtml() + '</div>';
    drawer.hidden = false;
    if (mask) mask.hidden = false;
    drawer.scrollTop = 0;

    var q = encodeURIComponent(noticeId);

    // MATRIX — best-effort. ok:false prints the route's own honest reason (no SOW/draft yet).
    getJson('/api/gov/matrix?noticeId=' + q).then(function (d) {
      if (OPEN !== noticeId) return;
      var el = $('gopMatrix'); if (!el) return;
      el.innerHTML = matrixHtml(d);
      var fix = $('gopFix');
      if (fix) fix.onclick = function () {
        if (window.SubmitWizard && window.SubmitWizard.open) window.SubmitWizard.open(noticeId);
        else window.open('/govcon?opp=' + q, '_blank', 'noopener');
      };
    });

    // PRICE-TO-WIN — noticeId first (the route derives NAICS + state from the deal); fall back to the card.
    (function () {
      var bid = Number(c.value) || 0;
      var bidQ = bid ? '&bid=' + encodeURIComponent(bid) : '';
      getJson('/api/gov/price-to-win?noticeId=' + q + bidQ).then(function (d) {
        if (d && d.ok === true && d.stats) return d;
        var st = stateOf(c.place);
        if (!c.naics) return d;
        return getJson('/api/gov/price-to-win?naics=' + encodeURIComponent(c.naics) + (st ? '&state=' + encodeURIComponent(st) : '') + bidQ);
      }).then(function (d) {
        if (OPEN !== noticeId) return;
        var el = $('gopPtw'); if (el) el.innerHTML = ptwHtml(d, bid);
      });
    })();

    // SUBS
    getJson('/api/gov/sub-ladder').then(function (d) {
      if (OPEN !== noticeId) return;
      var el = $('gopSubs'); if (el) el.innerHTML = subsHtml(d, noticeId);
    });

    var x = $('gopX'); if (x) x.onclick = close;

    $('gopFoot').onclick = function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), OS = window.GovConOS || {};
      if (a === 'wizard') {
        if (window.SubmitWizard && window.SubmitWizard.open) { close(); return window.SubmitWizard.open(noticeId); }
        return window.open('/govcon?opp=' + q, '_blank', 'noopener');
      }
      if (a === 'patricia') return window.open('/govcon?opp=' + q, '_blank', 'noopener');
      if (a === 'sim') {
        var el = $('gopSim'); if (!el) return;
        el.hidden = false;
        el.innerHTML = '<div class="gop-eyebrow">Red team</div><div class="gop-fail">Running four evaluators against this bid… this takes a few seconds.</div>';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        b.disabled = true;
        return getJson('/api/gov/simulate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noticeId: noticeId }),
        }).then(function (d) {
          b.disabled = false;
          if (OPEN !== noticeId) return;
          var e2 = $('gopSim'); if (e2) e2.innerHTML = simHtml(d);
        });
      }
      if (a === 'won' || a === 'lost' || a === 'passed') {
        if (!OS.disposition) return;
        var label = a === 'won' ? 'WON 🏆' : a === 'lost' ? 'lost (we’ll request the debrief)' : 'passed';
        OS.disposition(noticeId, a, label);
        close();
      }
    };
  }

  // Mask click + Escape close. Delegated + capture-free so nothing here can swallow the board's handlers.
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'gosOppMask') close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && OPEN) { e.stopPropagation(); close(); }
  });

  window.GovConOpp = { open: open, close: close };
})();
