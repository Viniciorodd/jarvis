/* submit-wizard.js — the "anyone can run it" Government Submission Wizard.
   Takes ONE opportunity from "found" all the way to "submitted", one calm screen at a time, in plain
   English. Jarvis does the hard parts (writing the proposal, the compliance check); the human does only
   the one thing the law requires a human to do — the actual sign & submit — and the wizard makes that
   trivially easy (exact destination, copy buttons, numbered steps) then records proof so the board moves
   to Submitted. Doctrine-perfect: the irreversible submit stays with the human (§2 + "Vinicio signs &
   submits everything"); nothing goes out automatically.

   Open from anywhere:  window.SubmitWizard.open(noticeId)
   Self-contained, theme-aware (uses the app's CSS vars), no dependencies. */
(function () {
  if (window.SubmitWizard) return;

  // ── one-time styles ────────────────────────────────────────────────────────────────────────────
  var css = `
  .sw-back{position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:stretch;justify-content:center;}
  .sw{background:var(--ink,#04070f);color:var(--cream,#dfeef0);width:100%;max-width:620px;display:flex;flex-direction:column;height:100%;max-height:100%;}
  @media(min-width:560px){.sw{height:auto;max-height:94vh;margin:auto;border-radius:18px;border:1px solid rgba(var(--teal-rgb,57,224,208),.22);box-shadow:0 24px 80px rgba(0,0,0,.6);}}
  .sw-top{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(var(--teal-rgb,57,224,208),.14);}
  .sw-prog{flex:1;display:flex;gap:6px;}
  .sw-dot{height:5px;flex:1;border-radius:3px;background:rgba(var(--teal-rgb,57,224,208),.18);transition:background .3s;}
  .sw-dot.on{background:var(--teal,#39e0d0);}
  .sw-x{background:none;border:none;color:var(--dim,#5d7480);font-size:26px;line-height:1;cursor:pointer;padding:0 4px;}
  .sw-body{flex:1;overflow:auto;padding:24px 22px 8px;-webkit-overflow-scrolling:touch;}
  .sw-kicker{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal,#39e0d0);font-weight:700;margin-bottom:8px;}
  .sw-h{font-size:25px;font-weight:800;line-height:1.18;margin:0 0 6px;letter-spacing:-.01em;}
  .sw-sub{color:var(--dim,#5d7480);font-size:15px;line-height:1.5;margin:0 0 18px;}
  .sw-opp{background:var(--panel,#0a121a);border:1px solid rgba(var(--teal-rgb,57,224,208),.16);border-radius:14px;padding:15px 16px;margin-bottom:18px;}
  .sw-opp-t{font-weight:700;font-size:16px;margin-bottom:6px;line-height:1.3;}
  .sw-opp-m{font-size:13px;color:var(--dim,#5d7480);display:flex;flex-wrap:wrap;gap:6px 14px;}
  .sw-verdict{display:flex;gap:12px;align-items:flex-start;border-radius:14px;padding:15px 16px;margin-bottom:8px;font-size:15px;line-height:1.5;}
  .sw-verdict.good{background:rgba(93,202,165,.12);border:1px solid rgba(93,202,165,.4);}
  .sw-verdict.bad{background:rgba(255,154,122,.1);border:1px solid rgba(255,154,122,.4);}
  .sw-verdict .ic{font-size:24px;line-height:1;}
  .sw-reasons{list-style:none;padding:0;margin:14px 0 0;}
  .sw-reasons li{display:flex;gap:9px;padding:7px 0;font-size:14.5px;line-height:1.45;border-top:1px solid rgba(var(--teal-rgb,57,224,208),.08);}
  .sw-reasons li:first-child{border-top:none;}
  .sw-doc{background:var(--panel,#0a121a);border:1px solid rgba(var(--teal-rgb,57,224,208),.16);border-radius:12px;padding:16px;max-height:46vh;overflow:auto;font-size:14px;line-height:1.6;}
  .sw-doc h4{margin:14px 0 4px;font-size:14px;color:var(--teal,#39e0d0);text-transform:uppercase;letter-spacing:.06em;}
  .sw-doc h4:first-child{margin-top:0;}
  .sw-doc p{margin:0 0 9px;color:var(--cream,#dfeef0);} .sw-doc li{margin:2px 0;}
  .sw-note{font-size:13px;color:var(--dim,#5d7480);margin-top:12px;line-height:1.5;}
  .sw-steps{counter-reset:s;list-style:none;padding:0;margin:6px 0 0;}
  .sw-steps li{counter-increment:s;position:relative;padding:11px 0 11px 40px;border-top:1px solid rgba(var(--teal-rgb,57,224,208),.1);font-size:15px;line-height:1.45;}
  .sw-steps li:first-child{border-top:none;}
  .sw-steps li::before{content:counter(s);position:absolute;left:0;top:9px;width:26px;height:26px;border-radius:50%;background:var(--teal,#39e0d0);color:var(--ink-on-accent,#04342c);font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;}
  .sw-dest{display:flex;align-items:center;gap:10px;background:var(--panel,#0a121a);border:1px dashed rgba(var(--teal-rgb,57,224,208),.45);border-radius:12px;padding:13px 14px;margin:14px 0;font-size:15px;word-break:break-all;}
  .sw-dest .lbl{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.08em;}
  .sw-field{margin:14px 0;}
  .sw-field label{display:block;font-size:13px;color:var(--dim,#5d7480);margin-bottom:6px;}
  .sw-field input,.sw-field textarea{width:100%;box-sizing:border-box;background:var(--panel,#0a121a);border:1px solid rgba(var(--teal-rgb,57,224,208),.25);border-radius:10px;color:var(--cream,#dfeef0);padding:12px 14px;font-size:16px;font-family:inherit;}
  .sw-field textarea{min-height:84px;resize:vertical;line-height:1.5;}
  .sw-foot{padding:14px 18px calc(16px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(var(--teal-rgb,57,224,208),.14);display:flex;flex-direction:column;gap:9px;background:var(--ink,#04070f);}
  .sw-btn{appearance:none;border:none;border-radius:12px;padding:15px 18px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;width:100%;transition:transform .05s,filter .15s;}
  .sw-btn:active{transform:scale(.985);}
  .sw-btn.primary{background:var(--teal,#39e0d0);color:var(--ink-on-accent,#04342c);}
  .sw-btn.primary:disabled{opacity:.4;cursor:default;}
  .sw-btn.ghost{background:transparent;color:var(--cream,#dfeef0);border:1px solid rgba(var(--teal-rgb,57,224,208),.3);}
  .sw-btn.soft{background:rgba(var(--teal-rgb,57,224,208),.1);color:var(--teal,#39e0d0);}
  .sw-btn.tiny{width:auto;padding:9px 14px;font-size:13px;border-radius:9px;}
  .sw-row{display:flex;gap:9px;} .sw-row .sw-btn{flex:1;}
  .sw-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(var(--teal-rgb,57,224,208),.2);border-top-color:var(--teal,#39e0d0);animation:sw-rot .8s linear infinite;margin:8px auto 18px;}
  @keyframes sw-rot{to{transform:rotate(360deg)}}
  .sw-center{text-align:center;padding:30px 6px;}
  .sw-big{font-size:46px;margin-bottom:10px;}
  .sw-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--teal,#39e0d0);color:var(--ink-on-accent,#04342c);padding:10px 18px;border-radius:20px;font-weight:700;font-size:14px;z-index:4100;box-shadow:0 8px 24px rgba(0,0,0,.4);}
  `;
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // ── helpers ──────────────────────────────────────────────────────────────────────────────────────
  function h(tag, attrs, kids) {
    var n = document.createElement(tag); attrs = attrs || {};
    for (var k in attrs) { if (k === 'class') n.className = attrs[k]; else if (k === 'html') n.innerHTML = attrs[k]; else if (k === 'text') n.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c == null) return; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function toast(msg) { var t = h('div', { class: 'sw-toast', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1600); }
  function copy(text, label) { try { navigator.clipboard.writeText(text); toast((label || 'Copied') + ' ✓'); } catch (e) { toast('Copy failed — select & copy manually'); } }
  // light, SAFE proposal formatter (escape first, then headings/bold/bullets)
  function fmtDoc(md) {
    var lines = String(md || '').replace(/^<!--[\s\S]*?-->\s*/, '').split(/\r?\n/), out = [], inList = false;
    lines.forEach(function (ln) {
      var t = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^\s*#{1,6}\s+/.test(ln)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h4>' + t.replace(/^\s*#{1,6}\s+/, '') + '</h4>'); }
      else if (/^\s*[-*]\s+/.test(ln)) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + t.replace(/^\s*[-*]\s+/, '') + '</li>'); }
      else if (ln.trim() === '') { if (inList) { out.push('</ul>'); inList = false; } }
      else { if (inList) { out.push('</ul>'); inList = false; } out.push('<p>' + t + '</p>'); }
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }
  var TOTAL = 6;

  // ── state ─────────────────────────────────────────────────────────────────────────────────────────
  var S = null, back = null, bodyEl = null, footEl = null, dotsEl = null;

  function api(path, opts) { return fetch(path, opts).then(function (r) { return r.json(); }); }

  function open(noticeId) {
    if (!noticeId) return;
    S = { noticeId: noticeId, step: 1, data: null, draft: '', compliance: null, email: null, busy: true };
    back = h('div', { class: 'sw-back', onclick: function (e) { if (e.target === back) {} } }); // no close on backdrop (avoid losing progress)
    dotsEl = h('div', { class: 'sw-prog' });
    bodyEl = h('div', { class: 'sw-body' });
    footEl = h('div', { class: 'sw-foot' });
    var panel = h('div', { class: 'sw' }, [
      h('div', { class: 'sw-top' }, [dotsEl, h('button', { class: 'sw-x', text: '×', onclick: close, title: 'Close' })]),
      bodyEl, footEl,
    ]);
    back.appendChild(panel); document.body.appendChild(back);
    renderLoading('Getting this opportunity ready…');
    api('/api/gov/wizard?noticeId=' + encodeURIComponent(noticeId)).then(function (d) {
      S.data = d; S.busy = false;
      if (d.submitted) { S.step = 7; }
      render();
    }).catch(function () { renderError('Could not load this opportunity. Check your connection and try again.'); });
  }
  function close() { if (back) back.remove(); back = null; S = null; if (window.GovBoard && window.GovBoard.reload) window.GovBoard.reload(); }

  function dots() {
    dotsEl.innerHTML = '';
    for (var i = 1; i <= TOTAL; i++) dotsEl.appendChild(h('div', { class: 'sw-dot' + (i <= Math.min(S.step, TOTAL) ? ' on' : '') }));
  }
  function renderLoading(msg) { dots(); bodyEl.innerHTML = ''; footEl.innerHTML = ''; bodyEl.appendChild(h('div', { class: 'sw-center' }, [h('div', { class: 'sw-spin' }), h('div', { class: 'sw-sub', text: msg })])); }
  function renderError(msg) { bodyEl.innerHTML = ''; footEl.innerHTML = ''; bodyEl.appendChild(h('div', { class: 'sw-center' }, [h('div', { class: 'sw-big', text: '⚠️' }), h('div', { class: 'sw-sub', text: msg })])); footEl.appendChild(h('button', { class: 'sw-btn ghost', text: 'Close', onclick: close })); }

  function oppCard() {
    var o = S.data.opp || {};
    var meta = [];
    if (o.agency) meta.push(h('span', { text: o.agency }));
    if (o.deadline) meta.push(h('span', { text: 'Due ' + String(o.deadline).slice(0, 10) }));
    if (o.setAside) meta.push(h('span', { text: o.setAside }));
    return h('div', { class: 'sw-opp' }, [h('div', { class: 'sw-opp-t', text: o.title || 'Opportunity' }), h('div', { class: 'sw-opp-m' }, meta)]);
  }
  function setFoot(buttons) { footEl.innerHTML = ''; buttons.forEach(function (b) { footEl.appendChild(b); }); }

  // ── STEP 1 — worth going for? ───────────────────────────────────────────────────────────────────
  function step1() {
    dots(); bodyEl.innerHTML = '';
    var fit = S.data.fit || { go: true, reasons: [] };
    bodyEl.appendChild(h('div', { class: 'sw-kicker', text: 'Step 1 of 6 · Should we go for it?' }));
    bodyEl.appendChild(h('h2', { class: 'sw-h', text: fit.go ? "This one looks worth it." : "You can probably skip this one." }));
    bodyEl.appendChild(h('p', { class: 'sw-sub', text: "Jarvis already checked the basics. You just decide yes or no." }));
    bodyEl.appendChild(oppCard());
    bodyEl.appendChild(h('div', { class: 'sw-verdict ' + (fit.go ? 'good' : 'bad') }, [
      h('span', { class: 'ic', text: fit.go ? '✅' : '🛑' }),
      h('div', {}, [h('b', { text: fit.go ? "Good to go." : "Better to skip." }),
        h('ul', { class: 'sw-reasons' }, (fit.reasons || []).map(function (r) { return h('li', {}, [h('span', { text: '•' }), h('span', { text: r })]); }))]),
    ]));
    setFoot([
      h('button', { class: 'sw-btn primary', text: S.data.hasDraft ? 'Continue — read the proposal ▸' : "Yes — have Jarvis write the proposal ▸", onclick: function () { S.data.hasDraft ? (S.step = 3, loadDraftThen(step3)) : (S.step = 2, doDraft()); } }),
      h('button', { class: 'sw-btn ghost', text: 'Skip this one', onclick: skip }),
    ]);
  }
  function skip() {
    renderLoading('Taking it off your board…');
    api('/api/gov-board/disposition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noticeId: S.noticeId, stage: 'passed' }) })
      .then(function () { bodyEl.innerHTML = ''; footEl.innerHTML = ''; bodyEl.appendChild(h('div', { class: 'sw-center' }, [h('div', { class: 'sw-big', text: '👍' }), h('div', { class: 'sw-h', text: 'Skipped.' }), h('div', { class: 'sw-sub', text: "Off your list. Jarvis keeps watching for better-fit ones." })])); setFoot([h('button', { class: 'sw-btn primary', text: 'Done', onclick: close })]); })
      .catch(function () { renderError('Could not update the board.'); });
  }

  // ── STEP 2 — Jarvis writes it ─────────────────────────────────────────────────────────────────────
  function doDraft() {
    renderLoading("Patricia is writing your proposal… this takes about a minute. Sit tight.");
    api('/api/pursue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noticeId: S.noticeId, op: S.data.opp }) })
      .then(function (r) { S.data.draftFile = (r && r.file) || S.data.draftFile; S.data.gateId = S.data.gateId || (r && r.gateId) || null; loadDraftThen(step3); })
      .catch(function () { renderError("Jarvis couldn't write the proposal right now. Try again in a moment."); });
  }
  function loadDraftThen(next) {
    var file = S.data.draftFile;
    if (!file) { // re-fetch wizard state to discover the freshly-written draft
      api('/api/gov/wizard?noticeId=' + encodeURIComponent(S.noticeId)).then(function (d) { S.data = Object.assign(S.data, { draftFile: d.draftFile, gateId: d.gateId, hasDraft: d.hasDraft }); fetchDraft(next); }).catch(function () { renderError('Could not find the proposal.'); });
    } else fetchDraft(next);
  }
  function fetchDraft(next) {
    if (!S.data.draftFile) return renderError('The proposal draft is missing — try the previous step again.');
    api('/api/proposal?file=' + encodeURIComponent(S.data.draftFile)).then(function (d) { S.draft = (d && d.content) || ''; next(); }).catch(function () { renderError('Could not open the proposal.'); });
  }

  // ── STEP 3 — read it ──────────────────────────────────────────────────────────────────────────────
  function step3() {
    S.step = 3; dots(); bodyEl.innerHTML = '';
    bodyEl.appendChild(h('div', { class: 'sw-kicker', text: 'Step 2 of 6 · Read it over' }));
    bodyEl.appendChild(h('h2', { class: 'sw-h', text: 'Here’s your proposal.' }));
    bodyEl.appendChild(h('p', { class: 'sw-sub', text: "Jarvis wrote it to match the rules. You don’t need to understand every line — skim it. If something’s off, tell Jarvis what to change." }));
    bodyEl.appendChild(h('div', { class: 'sw-doc', html: fmtDoc(S.draft) }));
    setFoot([
      h('button', { class: 'sw-btn primary', text: 'Looks good — check it’s compliant ▸', onclick: function () { S.step = 4; doCompliance(); } }),
      h('button', { class: 'sw-btn ghost', text: '✏️ Change something', onclick: changePrompt }),
    ]);
  }
  function changePrompt() {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(h('div', { class: 'sw-kicker', text: 'Tell Jarvis what to change' }));
    bodyEl.appendChild(h('h2', { class: 'sw-h', text: 'What should be different?' }));
    bodyEl.appendChild(h('p', { class: 'sw-sub', text: 'Plain words are fine — e.g. “make it shorter”, “mention our 24/7 response”, “add that we serve the whole region.”' }));
    var ta = h('textarea', { placeholder: 'Type your change…' });
    bodyEl.appendChild(h('div', { class: 'sw-field' }, [ta]));
    setFoot([
      h('button', { class: 'sw-btn primary', text: 'Make the change ▸', onclick: function () { if (!ta.value.trim()) { toast('Type a change first'); return; } doRedraft(ta.value.trim()); } }),
      h('button', { class: 'sw-btn ghost', text: 'Never mind', onclick: step3 }),
    ]);
    ta.focus();
  }
  function doRedraft(feedback) {
    renderLoading('Patricia is revising it…');
    api('/api/redraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: S.data.draftFile, feedback: feedback }) })
      .then(function () { fetchDraft(step3); }).catch(function () { renderError('Could not revise the proposal.'); });
  }

  // ── STEP 4 — compliance ───────────────────────────────────────────────────────────────────────────
  function doCompliance() {
    renderLoading("Jarvis is double-checking it follows the government’s rules…");
    api('/api/compliance-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noticeId: S.noticeId, file: S.data.draftFile }) })
      .then(function (c) { S.compliance = c || {}; step4(); }).catch(function () { S.compliance = { verdict: 'RISK', summary: "Couldn’t run the automatic check — review it yourself before sending.", gaps: [] }; step4(); });
  }
  function step4() {
    S.step = 4; dots(); bodyEl.innerHTML = '';
    var c = S.compliance || {}; var v = (c.verdict || 'RISK').toUpperCase();
    var pass = v === 'PASS', fail = v === 'FAIL';
    bodyEl.appendChild(h('div', { class: 'sw-kicker', text: 'Step 3 of 6 · Safety check' }));
    bodyEl.appendChild(h('h2', { class: 'sw-h', text: pass ? 'All clear. ✅' : fail ? 'Hold on — needs a fix.' : 'Mostly good — one look first.' }));
    bodyEl.appendChild(h('div', { class: 'sw-verdict ' + (pass ? 'good' : 'bad') }, [
      h('span', { class: 'ic', text: pass ? '🛡️' : fail ? '🛑' : '⚠️' }),
      h('div', {}, [h('b', { text: c.summary || (pass ? 'It meets the requirements.' : 'Review the points below.') })]),
    ]));
    var gaps = (c.gaps || []).concat((c.items || []).filter(function (i) { return i && i.ok === false; }).map(function (i) { return (i.req || 'Requirement') + ': ' + (i.note || 'not addressed'); }));
    if (gaps.length) bodyEl.appendChild(h('ul', { class: 'sw-reasons' }, gaps.slice(0, 6).map(function (g) { return h('li', {}, [h('span', { text: '•' }), h('span', { text: g })]); })));
    var foot = [];
    if (fail || gaps.length) foot.push(h('button', { class: 'sw-btn soft', text: '🔧 Have Jarvis fix these', onclick: function () { doRedraft('Fix these compliance gaps before submission: ' + gaps.join('; ')); } }));
    foot.push(h('button', { class: 'sw-btn ' + (fail ? 'ghost' : 'primary'), text: fail ? 'Continue anyway ▸' : 'Looks safe — where do I send it? ▸', onclick: function () { S.step = 5; doWhere(); } }));
    setFoot(foot);
  }

  // ── STEP 5 — where it goes ─────────────────────────────────────────────────────────────────────────
  function doWhere() {
    renderLoading('Finding exactly where this gets submitted…');
    api('/api/email-proposal?file=' + encodeURIComponent(S.data.draftFile) + '&noticeId=' + encodeURIComponent(S.noticeId))
      .then(function (e) { S.email = e || {}; step5(); }).catch(function () { S.email = {}; step5(); });
  }
  function step5() {
    S.step = 5; dots(); bodyEl.innerHTML = '';
    var e = S.email || {}; var o = S.data.opp || {};
    var byEmail = !!(e.to) && !e.submitViaPortal;
    bodyEl.appendChild(h('div', { class: 'sw-kicker', text: 'Step 4 of 6 · Send it in' }));
    if (byEmail) {
      bodyEl.appendChild(h('h2', { class: 'sw-h', text: 'This one goes by email.' }));
      bodyEl.appendChild(h('p', { class: 'sw-sub', text: "You send it from your own email so it comes from you. Jarvis already wrote the whole message — just copy it over and hit send." }));
      bodyEl.appendChild(h('div', { class: 'sw-dest' }, [h('div', {}, [h('div', { class: 'lbl', text: 'Send to' }), h('div', { text: (e.toName ? e.toName + ' · ' : '') + e.to })]), h('button', { class: 'sw-btn soft tiny', text: 'Copy', onclick: function () { copy(e.to, 'Address copied'); } })]));
      bodyEl.appendChild(h('div', { class: 'sw-field' }, [h('label', { text: 'Subject' }), h('input', { value: e.subject || '', readonly: 'readonly' })]));
      bodyEl.appendChild(h('div', { class: 'sw-row' }, [
        h('button', { class: 'sw-btn soft tiny', text: '📋 Copy the email', onclick: function () { copy(e.body || '', 'Email copied'); } }),
        h('button', { class: 'sw-btn soft tiny', text: '📋 Copy subject', onclick: function () { copy(e.subject || '', 'Subject copied'); } }),
      ]));
      bodyEl.appendChild(h('div', { class: 'sw-doc', style: 'max-height:30vh', html: fmtDoc(e.body || '') }));
      bodyEl.appendChild(h('p', { class: 'sw-note', text: 'How: open Gmail (or your email), start a new message, paste the address, subject, and the copied text, then Send.' }));
    } else {
      bodyEl.appendChild(h('h2', { class: 'sw-h', text: 'This one goes on the government website.' }));
      bodyEl.appendChild(h('p', { class: 'sw-sub', text: "Jarvis can’t log in as you, so you submit it on the site. Here’s exactly how — it only takes a minute." }));
      if (o.url) bodyEl.appendChild(h('div', { class: 'sw-dest' }, [h('div', {}, [h('div', { class: 'lbl', text: 'The website' }), h('div', { text: 'SAM.gov opportunity page' })]), h('a', { class: 'sw-btn soft tiny', text: 'Open ↗', href: o.url, target: '_blank', rel: 'noreferrer' })]));
      bodyEl.appendChild(h('div', { class: 'sw-row' }, [
        h('button', { class: 'sw-btn soft tiny', text: '📋 Copy the proposal', onclick: function () { copy(S.draft || '', 'Proposal copied'); } }),
        h('button', { class: 'sw-btn soft tiny', text: '⬇ Download it', onclick: downloadDraft }),
      ]));
      bodyEl.appendChild(h('ol', { class: 'sw-steps' }, [
        h('li', { text: 'Tap “Open ↗” above to go to the opportunity on SAM.gov.' }),
        h('li', { text: 'Sign in (or create a free SAM.gov account if you don’t have one).' }),
        h('li', { html: 'Find the <b>“Respond”</b> or <b>“Submit”</b> button on the page.' }),
        h('li', { text: 'Paste the copied proposal (or upload the downloaded file) where it asks.' }),
        h('li', { text: 'Submit. The site gives you a confirmation — keep that number for the next step.' }),
      ]));
    }
    setFoot([
      h('button', { class: 'sw-btn primary', text: '✓ I sent it — mark it done', onclick: function () { S.method = byEmail ? 'email' : 'portal'; S.step = 6; step6(); } }),
      h('button', { class: 'sw-btn ghost', text: 'Go back', onclick: function () { S.step = 4; step4(); } }),
    ]);
  }
  function downloadDraft() {
    try { var b = new Blob([S.draft || ''], { type: 'text/markdown' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (S.data.draftFile || 'proposal').split(/[\\/]/).pop(); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); toast('Downloaded ✓'); } catch (e) { toast('Download failed'); }
  }

  // ── STEP 6 — record proof ─────────────────────────────────────────────────────────────────────────
  function step6() {
    dots(); bodyEl.innerHTML = '';
    bodyEl.appendChild(h('div', { class: 'sw-kicker', text: 'Step 5 of 6 · Record it' }));
    bodyEl.appendChild(h('h2', { class: 'sw-h', text: 'Last thing — proof you sent it.' }));
    bodyEl.appendChild(h('p', { class: 'sw-sub', text: "Paste the confirmation number the site or email gave you (optional). If you don’t have one, just leave today’s date." }));
    var conf = h('input', { placeholder: 'Confirmation # (optional)' });
    var date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    bodyEl.appendChild(h('div', { class: 'sw-field' }, [h('label', { text: 'Confirmation number' }), conf]));
    bodyEl.appendChild(h('div', { class: 'sw-field' }, [h('label', { text: 'Date you submitted' }), date]));
    setFoot([
      h('button', { class: 'sw-btn primary', text: 'Record it & finish ▸', onclick: function () {
        renderLoading('Saving your proof…');
        api('/api/gov/submit/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noticeId: S.noticeId, method: S.method || 'portal', confirmation: conf.value.trim(), date: date.value, file: S.data.draftFile, gateId: S.data.gateId }) })
          .then(function () { S.step = 7; step7(); }).catch(function () { renderError('Could not save — but you DID submit. Try again or mark it on the board.'); });
      } }),
      h('button', { class: 'sw-btn ghost', text: 'Go back', onclick: function () { S.step = 5; step5(); } }),
    ]);
  }

  // ── STEP 7 — done ─────────────────────────────────────────────────────────────────────────────────
  function step7() {
    S.step = 7; dots(); bodyEl.innerHTML = ''; footEl.innerHTML = '';
    bodyEl.appendChild(h('div', { class: 'sw-center' }, [
      h('div', { class: 'sw-big', text: '🎉' }),
      h('h2', { class: 'sw-h', text: 'You just submitted a government proposal.' }),
      h('p', { class: 'sw-sub', text: "That’s the whole job done. Jarvis is now tracking it on your board — you’ll get a heads-up when the agency responds. Nice work." }),
    ]));
    setFoot([h('button', { class: 'sw-btn primary', text: 'See it on my board', onclick: close })]);
  }

  function render() {
    if (!S) return;
    if (S.step >= 7 || (S.data && S.data.submitted)) return step7();
    step1();
  }

  window.SubmitWizard = { open: open };
})();
