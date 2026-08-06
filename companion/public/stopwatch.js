/* stopwatch.js — the timer that follows him around.

   Operator, 2026-08-05: "can we create a stop watch inside jarvis focus, for me to track my time. I want it
   accessible from everywhere, i want to be able to pause it and continue whenever, after i am done, i want to
   be able to click a button log the time in."

   ONE SCRIPT, EVERY PAGE. It draws its own pill, so adding the timer to a new surface is one script tag and
   nothing else. The state is the SERVER's — this file only asks what time it is and renders it. That is why
   the same clock shows on his phone and his PC, why closing a tab loses nothing, and why two open tabs can
   never disagree.

   The readout ticks locally between polls so it looks alive, but the truth is re-fetched every few seconds
   and always wins. A widget that counts on its own is a widget that drifts. */
(function () {
  if (window.__jStopwatch) { return; }
  window.__jStopwatch = true;

  var S = { running: false, elapsedMs: 0, display: '0:00', active: false, label: '', minutes: 0 };
  var localFrom = 0, localAt = 0, el = null, busy = false;

  function css() {
    if (document.getElementById('jSwCss')) { return; }
    var s = document.createElement('style');
    s.id = 'jSwCss';
    /* Colours come from the theme contract; the pill inherits whatever the page is wearing. */
    s.textContent = [
      '.j-sw{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9998;',
      'display:none;align-items:center;gap:8px;padding:8px 10px 8px 13px;border-radius:999px;',
      'background:var(--panel,#141417);border:1px solid var(--line,rgba(255,255,255,.09));',
      'box-shadow:0 6px 22px rgba(0,0,0,.35);font-family:var(--font,Inter,system-ui,sans-serif);',
      'color:var(--cream,#f3f4f6);font-size:13px;max-width:calc(100vw - 32px)}',
      '.j-sw.on{display:flex}',
      '.j-sw-t{font-variant-numeric:tabular-nums;font-weight:600;font-size:15px;min-width:52px;letter-spacing:.01em}',
      '.j-sw.run .j-sw-t{color:var(--teal,#43e6d4)}',
      '.j-sw-l{color:var(--dim,#8b909a);font-size:11.5px;max-width:130px;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap}',
      '.j-sw button{background:rgba(var(--teal-rgb,67,230,212),.12);border:1px solid rgba(var(--teal-rgb,67,230,212),.3);',
      'color:var(--cream,#f3f4f6);border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;',
      'font-weight:500;cursor:pointer;line-height:1.2}',
      '.j-sw button:hover:not(:disabled){background:rgba(var(--teal-rgb,67,230,212),.24)}',
      '.j-sw button:disabled{opacity:.45;cursor:default}',
      '.j-sw button.go{background:var(--teal,#43e6d4);color:var(--ink-on-accent,#00201c);border-color:var(--teal,#43e6d4);font-weight:600}',
      '.j-sw button:focus-visible{outline:2px solid var(--teal,#43e6d4);outline-offset:2px}',
      '@media (max-width:520px){.j-sw-l{display:none}}',
    ].join('');
    document.head.appendChild(s);
  }

  function build() {
    css();
    el = document.createElement('div');
    el.className = 'j-sw';
    el.setAttribute('role', 'timer');
    el.innerHTML = '<span class="j-sw-t" id="jSwT">0:00</span>' +
      '<span class="j-sw-l" id="jSwL"></span>' +
      '<button id="jSwP" type="button" title="Pause / continue">Pause</button>' +
      '<button id="jSwGo" type="button" class="go" title="Log this time to your focus log">Log it</button>' +
      '<button id="jSwX" type="button" title="Throw it away">✕</button>';
    document.body.appendChild(el);
    el.querySelector('#jSwP').addEventListener('click', function () { act(S.running ? 'pause' : 'resume'); });
    el.querySelector('#jSwGo').addEventListener('click', logIt);
    el.querySelector('#jSwX').addEventListener('click', function () {
      /* Discard is destructive and unrecoverable — the one action here that asks first. */
      if (window.confirm('Throw away ' + S.display + ' without logging it?')) { act('discard'); }
    });
  }

  function fmt(msTotal) {
    var total = Math.max(0, Math.floor(msTotal / 1000));
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return h > 0 ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  }

  function paint() {
    if (!el) { return; }
    el.classList.toggle('on', !!S.active);
    el.classList.toggle('run', !!S.running);
    var shown = S.running ? S.elapsedMs + (Date.now() - localAt) : S.elapsedMs;
    el.querySelector('#jSwT').textContent = fmt(shown);
    el.querySelector('#jSwL').textContent = S.label || '';
    el.querySelector('#jSwP').textContent = S.running ? 'Pause' : 'Continue';
  }

  function apply(d) {
    if (!d || !d.ok) { return; }
    S = d; localFrom = d.elapsedMs; localAt = Date.now();
    paint();
  }

  function act(action, extra) {
    if (busy) { return; }
    busy = true;
    var body = { action: action };
    if (extra) { Object.keys(extra).forEach(function (k) { body[k] = extra[k]; }); }
    fetch('/api/stopwatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) { busy = false; apply(d); })
      .catch(function () { busy = false; });
  }

  function logIt() {
    if (busy) { return; }
    /* A watch left running overnight is almost always one he forgot to stop. Silently banking nine hours
       would poison the focus history that /focus reports, so it asks rather than assumes. */
    if (S.elapsedMs > 8 * 3600000 &&
        !window.confirm('That is ' + S.display + '. Log all of it?')) { return; }
    var note = S.label || window.prompt('What was this time on? (optional)') || '';
    busy = true;
    fetch('/api/stopwatch', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'log', note: note }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        busy = false;
        if (d && d.ok) {
          var t = el.querySelector('#jSwT');
          t.textContent = '✓ ' + d.logged + 'm';
          setTimeout(function () { apply({ ok: true, active: false, running: false, elapsedMs: 0, display: '0:00', label: '' }); }, 1600);
          /* Any page showing focus totals should catch up without a reload. */
          window.dispatchEvent(new CustomEvent('jarvis:focus-logged', { detail: { minutes: d.logged } }));
        }
      })
      .catch(function () { busy = false; });
  }

  function poll() {
    fetch('/api/stopwatch').then(function (r) { return r.json(); }).then(apply)
      .catch(function () { /* offline: keep showing the last known time rather than blanking it */ });
  }

  /* Public handle so any surface can start one — /focus does, and so can a voice command later. */
  window.JarvisStopwatch = {
    start: function (label) { act('resume', { label: label || '' }); },
    pause: function () { act('pause'); },
    log: logIt,
    state: function () { return S; },
  };

  function boot() {
    build();
    poll();
    setInterval(paint, 1000);   // the readout ticks locally so it feels alive…
    setInterval(poll, 5000);    // …but the server's answer always wins.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); } });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();
