/* assistant.js — the global Jarvis dock.
   Lets you text + talk to her from ANY screen (Operations, Real Estate, Map,
   Floor, HQ, Settings…) without leaving where you are. It reuses the existing
   chat brain (window.sendToJarvis from app.js) and mirrors the live conversation,
   so context stays unified with the full Talk view. */
(function () {
  'use strict';
  var fab    = document.getElementById('jDockFab');
  var dock   = document.getElementById('jDock');
  var log    = document.getElementById('jDockLog');
  var form   = document.getElementById('jDockForm');
  var input  = document.getElementById('jDockInput');
  var micBtn = document.getElementById('jDockMic');
  if (!fab || !dock) return;

  /* Overlays that cover the normal bottom composer — when one is open we surface
     the floating Jarvis button so she's always one tap away. */
  var OVERLAY_IDS = ['ops', 'mapView', 'floorView', 'commandView', 'activityView', 'hqView', 'settingsView', 'personalView'];
  function overlays() { return OVERLAY_IDS.map(function (id) { return document.getElementById(id); }).filter(Boolean); }
  function anyOverlayOpen() { return overlays().some(function (e) { return !e.hidden; }); }

  function syncFab() {
    var show = anyOverlayOpen();
    document.body.classList.toggle('overlay-open', show);
    if (!show) closeDock();          // back on a main view → the normal composer takes over
  }
  // Watch each overlay's `hidden` attribute so the FAB appears/disappears automatically.
  var mo = new MutationObserver(syncFab);
  overlays().forEach(function (e) { mo.observe(e, { attributes: true, attributeFilter: ['hidden'] }); });
  syncFab();

  /* ── open / close the dock ── */
  function openDock() {
    dock.hidden = false;
    document.body.classList.add('dock-open');
    seedGreeting();
    setTimeout(function () { input && input.focus(); }, 60);
  }
  function closeDock() {
    dock.hidden = true;
    document.body.classList.remove('dock-open');
  }
  function toggleDock() { dock.hidden ? openDock() : closeDock(); }

  fab.addEventListener('click', toggleDock);
  document.getElementById('jDockClose').addEventListener('click', closeDock);

  /* Expand → close any overlay and drop into the full Talk view (same transcript). */
  document.getElementById('jDockExpand').addEventListener('click', function () {
    closeDock();
    overlays().forEach(function (e) { if (!e.hidden) e.hidden = true; });
    document.body.classList.remove('overlay-open');
    var talk = document.getElementById('jNavTalk');
    if (talk) talk.click();
  });

  /* ── send a typed message through the existing brain ── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = (input.value || '').trim();
    if (!v) return;
    input.value = '';
    if (typeof window.sendToJarvis === 'function') window.sendToJarvis(v);
    else mirror('err', 'chat unavailable');
  });

  /* ── voice: reuse the main mic button's full voice pipeline ── */
  micBtn.addEventListener('click', function () {
    var mainMic = document.getElementById('mic');
    if (mainMic) mainMic.click();
    micBtn.classList.toggle('live');
    // clear the "live" look shortly after — the real state lives in the orb/voice engine
    setTimeout(function () { micBtn.classList.remove('live'); }, 6000);
  });

  /* ── mirror the live conversation into the dock log ── */
  var seeded = false;
  function seedGreeting() {
    if (seeded || log.children.length) return;
    seeded = true;
    var d = document.createElement('div');
    d.className = 'jd-msg jd-j';
    d.textContent = 'I’m here. Ask me anything — even while you’re in here.';
    log.appendChild(d);
  }
  function mirror(who, text) {
    if (!log) return;
    var d = document.createElement('div');
    d.className = 'jd-msg ' + (who === 'you' ? 'jd-you' : who === 'err' ? 'jd-err' : 'jd-j');
    d.textContent = (who === 'err' ? '⚠ ' : '') + text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    // if she's replying while the dock is closed but an overlay is open, pulse the FAB
    if (dock.hidden && who !== 'you') fab.classList.add('pulse');
  }
  fab.addEventListener('click', function () { fab.classList.remove('pulse'); });

  // expose for app.js's addMsg() to call
  window.JDock = { mirror: mirror, open: openDock, close: closeDock };
})();
