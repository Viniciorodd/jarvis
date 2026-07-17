/* govcon-journal.js — the JOURNAL section of the unified GovCon OS (#gosJournal).
 *
 * WHAT THIS IS: the learning loop. Decisions (what we called and when) → Outcomes (won/lost) →
 * Debriefs → Lessons that change the next bid. It ports the decision journal that was buried at the
 * bottom of the legacy govcon.js (loadJournal → /api/gov/journal) and puts the capture desk
 * (pods/gov/capture.mjs → /api/gov/capture) on the same screen, because a decision without its
 * outcome teaches nothing.
 *
 * THE OPERATOR'S STANDING RULE (2026-07-12), printed at the top of this screen and enforced by the
 * layout: we request a debrief on EVERY decided outcome — win AND loss. "If we ask for the debrief,
 * no loss is a real loss — everything is a win." So a loss is DATA here, never an error: losses are
 * styled neutral (--dim / --panel2). There is no red on this screen. The one place --err would be
 * honest is a fetch that failed, and even that is a plain one-line sentence.
 *
 * DOCTRINE: the debrief email is a DRAFT. /api/gov/capture/debrief returns text; we put it in an
 * editable textarea and the operator sends it himself. Nothing here auto-sends, ever.
 *
 * HONESTY NOTES (what the API actually gives us, vs. what you'd wish it gave us):
 *  · /api/gov/journal is the whole gov event feed ({ts, kind, text}) — not a clean bid/no-bid ledger
 *    with a recorded reason. `kind` is derived server-side (scored/drafted/gate/decided/valued/sent).
 *    So the "Decisions" lens FILTERS the feed to the decision-shaped kinds; it does not invent a
 *    "reason" field the event store doesn't have — `text` is the title or the recorded rationale.
 *  · /api/gov/capture returns { summary, outcomes } where outcomes is only the LAST 20 (reversed).
 *    Totals therefore come from `summary` (the whole ledger); anything we count off the cards says so.
 *  · The ledger has no "value" — it has ourPriceCents (what we bid). That's what we show and record.
 *  · The ledger is append-only with no update route, so drafting a debrief cannot flip
 *    debriefRequested on an existing entry. The chip reports the ledger, not our intent. Said plainly.
 */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var ROOT = null, FILTER = '', LENS = 'all';
  var JOURNAL = null, JERR = '', CAP = null, CERR = '';
  var DRAFTS = {};   // key → { subject, body } for an open debrief draft
  var LOADED = false;

  // ── one-time CSS, existing vars only (both themes work) ───────────────────────────────────────
  function injectCss() {
    if (document.getElementById('gjCss')) return;
    var s = document.createElement('style');
    s.id = 'gjCss';
    s.textContent = [
      '.gj-head{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}',
      '.gj-stat{font-size:13px;color:var(--dim);letter-spacing:.02em}',
      '.gj-stat b{color:var(--cream);font-weight:600}',
      '.gj-rule{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--teal);',
      '  background:rgba(var(--teal-rgb),.07);border:1px solid rgba(var(--teal-rgb),.3);',
      '  border-radius:9px;padding:8px 11px;line-height:1.45}',
      '.gj-rule i{font-size:15px;flex:none}',
      '.gj-blk{margin-bottom:18px}',
      '.gj-blkhead{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}',
      '.gj-line{display:grid;grid-template-columns:58px 78px 1fr;gap:10px;align-items:baseline;',
      '  padding:7px 8px;border-bottom:1px solid var(--line);font-size:13px}',
      '.gj-line:last-child{border-bottom:none}',
      '.gj-when{font-size:11px;color:var(--dim);letter-spacing:.02em;white-space:nowrap}',
      '.gj-text{color:var(--cream);line-height:1.4;overflow-wrap:anywhere}',
      '.gj-kind{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}',
      '.gj-kind.call{color:var(--teal)}',
      /* A LOSS IS DATA, NOT AN ERROR — neutral surface, no red anywhere in here. */
      '.gj-out{display:flex;flex-direction:column;gap:9px}',
      '.gj-out.lost{background:var(--panel2);border-color:var(--line)}',
      '.gj-out.won{border-color:rgba(var(--teal-rgb),.35)}',
      '.gj-res{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}',
      '.gj-res.won{color:var(--ok)}',
      '.gj-res.lost{color:var(--dim)}',
      '.gj-outtop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}',
      '.gj-facts{display:flex;flex-wrap:wrap;gap:6px}',
      '.gj-draft{display:flex;flex-direction:column;gap:7px;border-top:1px solid var(--line);padding-top:9px}',
      '.gj-ta{background:var(--ink2);border:1px solid var(--line);border-radius:9px;color:var(--cream);',
      '  font:inherit;font-size:12.5px;line-height:1.5;padding:10px;width:100%;min-height:230px;resize:vertical}',
      '.gj-ta:focus{outline:none;border-color:var(--teal)}',
      '.gj-acts{display:flex;gap:7px;flex-wrap:wrap;align-items:center}',
      '.gj-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.gj-form .gos-inp{flex:1;min-width:150px}',
      '.gj-msg{font-size:12px;color:var(--dim);line-height:1.5}',
      '.gj-lesson{display:flex;gap:9px;padding:8px;border-bottom:1px solid var(--line);font-size:13px;line-height:1.45}',
      '.gj-lesson:last-child{border-bottom:none}',
      '.gj-lesson i{color:var(--teal);font-size:15px;flex:none;line-height:1.3}',
      '.gj-lesson .src{color:var(--dim);font-size:11px}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────────
  function when(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function cents(c) {
    var v = Number(c) || 0;
    if (!v) return null;
    return '$' + Math.round(v / 100).toLocaleString('en-US');
  }
  function hit(hay) { return !FILTER || String(hay).toLowerCase().indexOf(FILTER.toLowerCase()) >= 0; }
  function outKey(o, i) { return (o.noticeId || o.title || 'x') + '|' + (o.ts || i); }

  // The event feed's decision-shaped kinds (server derives these in /api/gov/journal's KIND map).
  var CALL_KINDS = { decided: 1, scored: 1, gate: 1, valued: 1, sent: 1, drafted: 1 };
  function callLabel(k) {
    if (k === 'decided') return 'the call';
    if (k === 'scored') return 'bid/no-bid';
    return k;
  }

  // ── 0. HEADER ────────────────────────────────────────────────────────────────────────────────
  function headHtml() {
    var s = (CAP && CAP.summary) || null;
    var outs = (CAP && CAP.outcomes) || [];
    var line;
    if (!s && CERR) {
      line = 'The capture ledger didn’t load, so the counts are missing: ' + esc(CERR);
    } else if (!s) {
      line = 'No outcomes recorded yet — the count starts at your first win or loss.';
    } else {
      var decided = (Number(s.wins) || 0) + (Number(s.losses) || 0);
      var deb = outs.filter(function (o) { return o.debriefRequested; }).length;
      var partial = Number(s.total) > outs.length;
      line = '<b>' + decided + '</b> decided · <b>' + (Number(s.wins) || 0) + '</b> won · <b>' +
        (Number(s.losses) || 0) + '</b> lost · <b>' + deb + '</b> debrief' + (deb === 1 ? '' : 's') +
        ' requested' + (partial ? ' <span title="The ledger returns the last 20 outcomes; the debrief count is from those.">(of the last ' + outs.length + ' recorded)</span>' : '');
    }
    return '<div class="gj-head">' +
      '<div class="gj-stat">' + line + '</div>' +
      '<div class="gj-rule"><i class="ti ti-repeat"></i><span>We request a debrief on every outcome — win or lose. ' +
      'A loss you debriefed isn’t a loss, it’s the next bid’s advantage.</span></div>' +
    '</div>';
  }

  // ── 1. DECISIONS ─────────────────────────────────────────────────────────────────────────────
  function decisionsHtml() {
    var items = (JOURNAL && JOURNAL.items) || [];
    var rows = items.filter(function (i) {
      if (LENS === 'decisions' && !CALL_KINDS[i.kind]) return false;
      return hit(i.text + ' ' + i.kind);
    });
    var body;
    if (JERR && !items.length) {
      body = '<div class="gos-empty">The decision feed didn’t load: ' + esc(JERR) + '</div>';
    } else if (!items.length) {
      body = '<div class="gos-empty">Nothing recorded yet. A decision lands here the moment you bid on ' +
        'or pass an opportunity on the board — the call, the date, and the reason you gave at the time.</div>';
    } else if (!rows.length) {
      body = '<div class="gos-empty">' + (FILTER ? 'No decision matches “' + esc(FILTER) + '”.'
        : 'No bid/no-bid calls in the feed yet — switch to “Everything” to see the rest of the gov activity.') + '</div>';
    } else {
      body = rows.map(function (i) {
        var k = String(i.kind || '');
        return '<div class="gj-line">' +
          '<span class="gj-when">' + esc(when(i.ts)) + '</span>' +
          '<span class="gj-kind' + (CALL_KINDS[k] ? ' call' : '') + '">' + esc(callLabel(k)) + '</span>' +
          '<span class="gj-text">' + esc(i.text || '') + '</span>' +
        '</div>';
      }).join('');
    }
    return '<div class="gj-blk"><div class="gj-blkhead"><h2 class="gos-h2">Decisions</h2>' +
      '<span class="gos-sub">What we called, when, and why — straight from the event log.</span></div>' +
      '<div class="gos-panel">' + body + '</div></div>';
  }

  // ── 2. OUTCOMES ──────────────────────────────────────────────────────────────────────────────
  function debriefChip(o) {
    if (o.debriefNotes) return '<span class="gos-chip"><i class="ti ti-notes"></i> Debrief received</span>';
    if (o.debriefRequested) return '<span class="gos-chip"><i class="ti ti-send"></i> Debrief requested</span>';
    return '<span class="gos-chip"><i class="ti ti-help-circle"></i> No debrief yet</span>';
  }
  function outcomeHtml(o, i) {
    var key = outKey(o, i);
    var lost = o.result === 'lost';
    var won = o.result === 'won';
    var price = cents(o.ourPriceCents);
    var facts = '';
    facts += debriefChip(o);
    if (price) facts += '<span class="gos-chip"><i class="ti ti-currency-dollar"></i> our bid ' + esc(price) + '</span>';
    if (o.agency) facts += '<span class="gos-chip"><i class="ti ti-building-bank"></i> ' + esc(o.agency) + '</span>';
    if (o.winnerName) facts += '<span class="gos-chip">awarded to ' + esc(o.winnerName) + '</span>';
    if (o.priceGapPct != null && Number.isFinite(Number(o.priceGapPct))) {
      facts += '<span class="gos-chip">' + (Number(o.priceGapPct) > 0 ? '+' : '') + esc(o.priceGapPct) + '% vs winner</span>';
    }

    var d = DRAFTS[key];
    var draft = '';
    if (d === 'loading') {
      draft = '<div class="gj-draft"><div class="gj-msg">Drafting the request…</div></div>';
    } else if (d && d.error) {
      draft = '<div class="gj-draft"><div class="gj-msg">Couldn’t draft that one: ' + esc(d.error) + '</div></div>';
    } else if (d) {
      draft = '<div class="gj-draft">' +
        '<input class="gos-inp" data-sub="' + esc(key) + '" value="' + esc(d.subject) + '">' +
        '<textarea class="gj-ta" data-body="' + esc(key) + '">' + esc(d.body) + '</textarea>' +
        '<div class="gj-msg"><i class="ti ti-hand-stop"></i> Yours to send. Edit it however you like — ' +
          'Jarvis drafts it and stops. Nothing leaves this machine on its own.</div>' +
        '<div class="gj-acts">' +
          '<button class="gos-linkbtn pri" data-copy="' + esc(key) + '"><i class="ti ti-copy"></i> Copy the text</button>' +
          '<a class="gos-linkbtn" data-mail="' + esc(key) + '" href="#"><i class="ti ti-mail"></i> Open in mail</a>' +
          '<button class="gos-linkbtn" data-hide="' + esc(key) + '">Close the draft</button>' +
        '</div>' +
      '</div>';
    }

    return '<article class="gos-panel gj-out' + (lost ? ' lost' : won ? ' won' : '') + '">' +
      '<div class="gj-outtop">' +
        '<div>' +
          '<div class="gos-h2">' + esc(o.title || o.noticeId || 'Untitled opportunity') + '</div>' +
          '<div class="gos-sub">' + esc(when(o.ts) || 'no date') +
            (o.noticeId ? ' · ' + esc(o.noticeId) : '') + '</div>' +
        '</div>' +
        '<span class="gj-res ' + esc(o.result || '') + '">' + esc(o.result === 'won' ? 'Won' : o.result === 'lost' ? 'Lost' : String(o.result || '')) + '</span>' +
      '</div>' +
      '<div class="gj-facts">' + facts + '</div>' +
      (o.techGap ? '<div class="gos-why">' + esc(o.techGap) + '</div>' : '') +
      (d ? '' : '<div class="gj-acts"><button class="gos-linkbtn pri" data-debrief="' + esc(key) + '">' +
        '<i class="ti ti-message-question"></i> Request the debrief</button>' +
        '<span class="gos-sub">' + (won ? 'FAR 15.506 — learn why we won so we can repeat it.'
          : 'FAR 15.505/15.506 — it’s our right, and it’s free intel.') + '</span></div>') +
      draft +
    '</article>';
  }
  function outcomesHtml() {
    var outs = (CAP && CAP.outcomes) || [];
    var rows = outs.filter(function (o) {
      return (o.result === 'won' || o.result === 'lost') && hit((o.title || '') + ' ' + (o.agency || '') + ' ' + (o.noticeId || ''));
    });
    var body;
    if (CERR && !outs.length) {
      body = '<div class="gos-empty">The outcome ledger didn’t load: ' + esc(CERR) + '</div>';
    } else if (!outs.length) {
      body = '<div class="gos-empty">No outcomes on the ledger yet. Mark an opportunity Won or Lost on the ' +
        'board — or record one below if it happened off the board — and it shows up here with its debrief.</div>';
    } else if (!rows.length) {
      body = '<div class="gos-empty">No outcome matches “' + esc(FILTER) + '”.</div>';
    } else {
      body = '<div class="gos-grid">' + rows.map(outcomeHtml).join('') + '</div>';
    }
    return '<div class="gj-blk"><div class="gj-blkhead"><h2 class="gos-h2">Outcomes</h2>' +
      '<span class="gos-sub">Every decided bid. A loss here is intel we paid for — collect it.</span></div>' +
      (rows.length ? body : '<div class="gos-panel">' + body + '</div>') + '</div>';
  }

  // ── 3. LESSONS ───────────────────────────────────────────────────────────────────────────────
  function lessonsHtml() {
    var outs = (CAP && CAP.outcomes) || [];
    var rows = [];
    outs.forEach(function (o) {
      (o.lessons || []).forEach(function (l) { rows.push({ text: l, src: o.title || o.noticeId || '', res: o.result }); });
      if (o.debriefNotes) rows.push({ text: o.debriefNotes, src: (o.title || o.noticeId || '') + ' · debrief', res: o.result });
    });
    rows = rows.filter(function (r) { return hit(r.text + ' ' + r.src); });
    var body;
    if (!rows.length) {
      body = '<div class="gos-empty">' + (FILTER ? 'No lesson matches “' + esc(FILTER) + '”.'
        : 'No lessons yet. They come out of debriefs — which is the whole reason we ask for one on every outcome. ' +
          'Record what a debrief told you and it lands here, where it can change the next bid.') + '</div>';
    } else {
      body = rows.map(function (r) {
        return '<div class="gj-lesson"><i class="ti ti-bulb"></i><div>' + esc(r.text) +
          (r.src ? '<div class="src">from ' + esc(r.src) + '</div>' : '') + '</div></div>';
      }).join('');
    }
    var top = ((CAP && CAP.summary && CAP.summary.topLossReasons) || []).slice(0, 3);
    var topHtml = top.length
      ? '<div class="gos-why" style="margin-top:8px">Most repeated: ' + top.map(function (t) {
        return esc(t.reason) + ' (×' + t.count + ')';
      }).join(' · ') + '</div>' : '';
    return '<div class="gj-blk"><div class="gj-blkhead"><h2 class="gos-h2">Lessons</h2>' +
      '<span class="gos-sub">What the debriefs taught us.</span></div>' +
      '<div class="gos-panel">' + body + topHtml + '</div></div>';
  }

  // ── 4. RECORD AN OUTCOME ─────────────────────────────────────────────────────────────────────
  function recordHtml() {
    return '<div class="gj-blk"><div class="gj-blkhead"><h2 class="gos-h2">Record an outcome</h2>' +
      '<span class="gos-sub">For a win or a loss that happened off the board.</span></div>' +
      '<div class="gos-panel">' +
        '<div class="gj-form">' +
          '<input class="gos-inp" id="gjTitle" placeholder="Opportunity title">' +
          '<select class="gos-sel" id="gjResult"><option value="won">Won</option><option value="lost">Lost</option></select>' +
          '<input class="gos-inp" id="gjValue" placeholder="Our bid ($)" inputmode="decimal" style="max-width:150px">' +
          '<input class="gos-inp" id="gjNote" placeholder="What we learned (one line)">' +
          '<button class="gos-linkbtn pri" id="gjSave"><i class="ti ti-plus"></i> Record it</button>' +
        '</div>' +
        '<div class="gj-msg" id="gjMsg" style="margin-top:9px">Recorded here, it counts — then ask for the debrief above.</div>' +
      '</div></div>';
  }

  // ── render ───────────────────────────────────────────────────────────────────────────────────
  function render() {
    if (!ROOT) return;
    if (!LOADED) { ROOT.innerHTML = '<div class="gos-loading">Loading the journal…</div>'; return; }
    var blocks = '';
    if (LENS === 'all' || LENS === 'decisions') blocks += decisionsHtml();
    if (LENS === 'all' || LENS === 'outcomes') blocks += outcomesHtml();
    if (LENS === 'all' || LENS === 'lessons') blocks += lessonsHtml();
    blocks += recordHtml();

    ROOT.innerHTML =
      '<div class="gos-secbar">' +
        '<div class="gos-lens" id="gjLens">' +
          ['all', 'decisions', 'outcomes', 'lessons'].map(function (k) {
            var label = { all: 'Everything', decisions: 'Decisions', outcomes: 'Outcomes', lessons: 'Lessons' }[k];
            return '<button data-lens="' + k + '"' + (LENS === k ? ' class="on"' : '') + '>' + label + '</button>';
          }).join('') +
        '</div>' +
        '<span class="gos-caps" style="color:var(--dim)">The learning loop</span>' +
      '</div>' +
      headHtml() + blocks;
  }

  // ── data (best-effort: a failure is one honest line, never a blank panel) ─────────────────────
  function load() {
    var a = fetch('/api/gov/journal').then(function (r) { return r.json(); })
      .then(function (d) { JOURNAL = d; JERR = (d && d.error) || ''; })
      .catch(function (e) { JOURNAL = { items: [] }; JERR = e.message || 'the request failed'; });
    var b = fetch('/api/gov/capture').then(function (r) { return r.json(); })
      .then(function (d) { CAP = d; CERR = (d && d.error) || ''; })
      .catch(function (e) { CAP = { summary: null, outcomes: [] }; CERR = e.message || 'the request failed'; });
    return Promise.all([a, b]).then(function () { LOADED = true; render(); });
  }

  // ── actions ──────────────────────────────────────────────────────────────────────────────────
  function findOutcome(key) {
    var outs = (CAP && CAP.outcomes) || [];
    for (var i = 0; i < outs.length; i++) if (outKey(outs[i], i) === key) return outs[i];
    return null;
  }
  function requestDebrief(key) {
    var o = findOutcome(key);
    if (!o) return;
    DRAFTS[key] = 'loading'; render();
    fetch('/api/gov/capture/debrief', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opp: { title: o.title, noticeId: o.noticeId, agency: o.agency }, result: o.result })
    }).then(function (r) { return r.json(); }).then(function (d) {
      DRAFTS[key] = (d && d.ok && d.email) ? { subject: d.email.subject, body: d.email.body }
        : { error: (d && d.error) || 'the draft came back empty' };
      render();
    }).catch(function (e) { DRAFTS[key] = { error: e.message || 'the request failed' }; render(); });
  }
  function currentDraft(key) {
    var sub = ROOT.querySelector('[data-sub="' + key.replace(/"/g, '\\"') + '"]');
    var body = ROOT.querySelector('[data-body="' + key.replace(/"/g, '\\"') + '"]');
    var d = DRAFTS[key];
    return { subject: sub ? sub.value : (d && d.subject) || '', body: body ? body.value : (d && d.body) || '' };
  }
  function saveOutcome() {
    var title = (document.getElementById('gjTitle') || {}).value || '';
    var result = (document.getElementById('gjResult') || {}).value || 'won';
    var value = (document.getElementById('gjValue') || {}).value || '';
    var note = (document.getElementById('gjNote') || {}).value || '';
    var msg = document.getElementById('gjMsg');
    if (!title.trim()) { if (msg) msg.textContent = 'Give it a title first — the ledger needs something to call it.'; return; }
    var dollars = Number(String(value).replace(/[^0-9.]/g, '')) || 0;
    var body = {
      title: title.trim(), result: result,
      lessons: note.trim() ? [note.trim()] : [],
      debriefRequested: false,
    };
    if (dollars > 0) body.ourPriceCents = Math.round(dollars * 100);
    if (msg) msg.textContent = 'Recording…';
    fetch('/api/gov/capture/outcome', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) { if (msg) msg.textContent = 'Couldn’t record that: ' + ((d && d.error) || 'unknown error'); return; }
      load().then(function () {
        var m = document.getElementById('gjMsg');
        if (m) m.textContent = 'Recorded. Now request the debrief on it — win or lose.';
      });
    }).catch(function (e) { if (msg) msg.textContent = 'Couldn’t record that: ' + e.message; });
  }

  function onClick(e) {
    var t = e.target;
    var lens = t.closest && t.closest('[data-lens]');
    if (lens) { LENS = lens.getAttribute('data-lens'); render(); return; }
    var deb = t.closest && t.closest('[data-debrief]');
    if (deb) { requestDebrief(deb.getAttribute('data-debrief')); return; }
    var hide = t.closest && t.closest('[data-hide]');
    if (hide) { delete DRAFTS[hide.getAttribute('data-hide')]; render(); return; }
    var copy = t.closest && t.closest('[data-copy]');
    if (copy) {
      var k = copy.getAttribute('data-copy'), cur = currentDraft(k);
      var text = 'Subject: ' + cur.subject + '\n\n' + cur.body;
      var done = function () { copy.innerHTML = '<i class="ti ti-check"></i> Copied — it’s yours to send'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { /* */ });
      else { var ta = ROOT.querySelector('[data-body="' + k.replace(/"/g, '\\"') + '"]'); if (ta) { ta.select(); try { document.execCommand('copy'); done(); } catch (x) { /* */ } } }
      return;
    }
    var mail = t.closest && t.closest('[data-mail]');
    if (mail) {
      // Opens HIS mail client with the draft loaded. He reads it, he presses send. We never do.
      e.preventDefault();
      var mk = mail.getAttribute('data-mail'), md = currentDraft(mk);
      window.location.href = 'mailto:?subject=' + encodeURIComponent(md.subject) + '&body=' + encodeURIComponent(md.body);
      return;
    }
    if (t.closest && t.closest('#gjSave')) { saveOutcome(); return; }
  }

  // Keep his edits: render() rewrites the DOM (lens/filter/refresh), so every keystroke in a draft is
  // mirrored into DRAFTS. Losing an edited debrief because he typed in the search box would be rude.
  function onInput(e) {
    var el = e.target, key = el.getAttribute && (el.getAttribute('data-body') || el.getAttribute('data-sub'));
    if (!key || !DRAFTS[key] || DRAFTS[key] === 'loading') return;
    if (el.hasAttribute('data-body')) DRAFTS[key].body = el.value;
    else DRAFTS[key].subject = el.value;
  }

  // ── contract ─────────────────────────────────────────────────────────────────────────────────
  window.GovConSections = window.GovConSections || {};
  window.GovConSections.journal = {
    mount: function (el) {
      ROOT = el;
      injectCss();
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      render();
      load();
    },
    refresh: function () { if (ROOT) load(); },
    filter: function (q) { FILTER = String(q || ''); if (LOADED) render(); },
  };
})();
