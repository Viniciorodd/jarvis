/* govcon-tabs.js — tabs + the kill switch for RODGATE · GovCon OS.
   Operator 2026-07-27: "everything is in one single page and its a bit overcrouded" + "i would need a button
   on my jarvis goverment os" (the kill switch was previously built on the wrong surface).

   Design note: sections are SHOWN/HIDDEN in place via their data-tab attribute — the DOM is never moved. That
   keeps every existing populate-by-id call in govcon.js / govcon-subs-bench.js working untouched. Any grid
   column left with nothing visible is hidden too, so the 3-column layout never shows a hole. */
(function () {
  var KEY = 'gc-active-tab';
  var tabs = document.getElementById('gcTabs');
  if (!tabs) return;
  var buttons = [].slice.call(tabs.querySelectorAll('.gc-tab'));
  var sections = [].slice.call(document.querySelectorAll('[data-tab]'));
  var cols = [].slice.call(document.querySelectorAll('.gc-col'));

  var grid = document.querySelector('.gc-grid');

  function show(tab) {
    sections.forEach(function (s) { s.hidden = (s.getAttribute('data-tab') !== tab); });
    // hide a column that has no visible section, so the grid doesn't leave an empty track
    cols.forEach(function (c) {
      var any = [].slice.call(c.querySelectorAll('[data-tab]')).some(function (s) { return !s.hidden; });
      c.style.display = any ? '' : 'none';
    });
    // Home keeps the 3-column cockpit; every focused tab goes FULL WIDTH. Without this the surviving
    // column stayed pinned at its 340px/420px track and the page rendered as a strip beside a dead zone.
    if (grid) grid.classList.toggle('gc-grid--full', tab !== 'home');
    buttons.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === tab); });
    try { localStorage.setItem(KEY, tab); } catch (e) { /* private mode */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  buttons.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-go')); }); });

  var start = 'home';
  try { var saved = localStorage.getItem(KEY); if (saved && buttons.some(function (b) { return b.getAttribute('data-go') === saved; })) start = saved; } catch (e) { /* */ }
  show(start);

  /* AUTONOMY TIER — this is what "flip Tier 1" actually means: pick it from this dropdown. No .env edit, no
     NAS, no redeploy. 0 = nothing sends. Turning a tier ON asks for confirmation and states plainly what it
     does and does not grant; the Kill button still stops everything instantly. */
  var tierSel = document.getElementById('gcTier');
  if (tierSel) {
    var syncTier = function () {
      fetch('/api/gov/auto-send-tier').then(function (r) { return r.json(); })
        .then(function (d) { if (d && d.ok) tierSel.value = String(d.tier || 0); })
        .catch(function () { /* leave at OFF — the safe default */ });
    };
    syncTier();
    tierSel.addEventListener('change', function () {
      var t = Number(tierSel.value) || 0;
      if (t > 0 && !confirm('Turn ON Tier ' + t + '?\n\nJarvis will send that class of outreach to AUTO-VERIFIED contacts without asking you first.\n\nProposals, pricing and commitments still NEVER auto-send. You can stop everything instantly with the Kill button.')) {
        syncTier();
        return;
      }
      tierSel.disabled = true;
      fetch('/api/gov/auto-send-tier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: t }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d || d.ok === false) { alert('Could not reach the control-plane — the tier did NOT change.'); syncTier(); } })
        .catch(function () { alert('Could not reach the control-plane — the tier did NOT change.'); syncTier(); })
        .then(function () { tierSel.disabled = false; });
    });
  }

  /* 🛑 KILL SWITCH — halts ALL autonomous agent sending instantly (Phase 9). One tap to kill; releasing asks
     for confirmation. If the control-plane can't be reached we say so plainly rather than implying safety. */
  var kb = document.getElementById('gcKill');
  if (kb) {
    function paint(on) {
      kb.textContent = on ? '🛑 Auto-send HALTED — tap to release' : '🛑 Kill auto-send';
      kb.classList.toggle('on', !!on);
    }
    fetch('/api/gov/auto-send-kill').then(function (r) { return r.json(); }).then(function (d) { paint(d && d.kill); }).catch(function () { /* leave default */ });
    kb.addEventListener('click', function () {
      var releasing = kb.classList.contains('on');
      if (releasing && !confirm('Release the kill switch?\n\nAgents will be able to auto-send again (still limited by your tier setting).')) return;
      kb.disabled = true;
      fetch('/api/gov/auto-send-kill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kill: !releasing }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          paint(d && d.kill);
          if (!d || d.ok === false) alert('Could not reach the control-plane.\n\nAssume sending is NOT halted — check the NAS.');
        })
        .catch(function () { alert('Could not reach the control-plane.\n\nAssume sending is NOT halted — check the NAS.'); })
        .then(function () { kb.disabled = false; });
    });
  }
})();
