/* talkhome.js — fills the VOICE-FIRST HOME (the Talk tab, the app's main page): a warm greeting, THE ONE
   THING (tap it to act), and a tight glance at today's to-dos + recent activity — all under the live,
   audio-reactive orb. Calm on purpose: a few things, not a wall you scroll. Read-only; refreshes gently. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // strip markdown + collapse whitespace so the glance stays clean one-liners (no **bold** noise, no walls)
  var clean = function (s) { return String(s == null ? '' : s).replace(/[*_`~#>]/g, '').replace(/\s+/g, ' ').trim(); };

  function greetWord() {
    var h = new Date().getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }
  function operatorName() { try { return localStorage.getItem('jarvis-name') || 'Vinicio'; } catch (e) { return 'Vinicio'; } }

  function renderTop(c) {
    var el = $('jTalkTop'); if (!el) return;
    var name = operatorName();
    var date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    var html = '<div class="tg-greet">' + greetWord() + (name ? ', ' + esc(name) : '') + '<span class="tg-date">' + esc(date) + '</span></div>';
    var ot = c && c.oneThing;
    if (ot && ot.text) {
      var gov = ot.kind === 'gov' && c.govNextAction && c.govNextAction.noticeId;
      html += '<button class="tg-onething' + (gov ? ' actionable' : '') + '" id="jtOneBtn"' + (gov ? ' data-notice="' + esc(c.govNextAction.noticeId) + '"' : '') + '>'
        + '<span class="tg-ot-l">🎯 THE ONE THING</span>'
        + '<span class="tg-ot-t">' + esc(ot.text) + '</span>'
        + (gov ? '<span class="tg-ot-go">Walk me through it ▸</span>' : '')
        + '</button>';
    }
    el.innerHTML = html;
    var b = $('jtOneBtn');
    if (b) b.onclick = function () {
      var n = b.getAttribute('data-notice');
      if (n && window.SubmitWizard) { window.SubmitWizard.open(n); return; }
      var g = $('govBtn'); if (g) g.click();
    };
  }

  function renderTasks(c) {
    var el = $('jtTasks'); if (!el) return;
    var due = (c && c.tasks && c.tasks.dueToday) || [];
    var act = (c && c.tasks && c.tasks.active) || [];
    var all = due.concat(act);
    var tasks = all.slice(0, 3);
    if (!tasks.length) { el.innerHTML = '<div class="tg-empty">nothing due — you’re clear ✓</div>'; return; }
    el.innerHTML = tasks.map(function (t) { return '<div class="tg-task"><span class="tg-box">▢</span><span class="tg-txt">' + esc(clean(t.text || t.title || t)) + '</span></div>'; }).join('')
      + (all.length > 3 ? '<div class="tg-more">+' + (all.length - 3) + ' more in Today</div>' : '');
  }

  function fillTasks() {
    fetch('/api/cockpit').then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (!c) { var t = $('jtTasks'); if (t) t.innerHTML = '<div class="tg-empty">offline</div>'; return; }
      renderTop(c); renderTasks(c);
    }).catch(function () { var t = $('jtTasks'); if (t) t.innerHTML = '<div class="tg-empty">—</div>'; });
  }

  function fillFeed() {
    var el = $('jtFeed'); if (!el) return;
    fetch('/api/dashboard').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) { el.innerHTML = '<div class="tg-empty">offline</div>'; return; }
      var items = [], seen = {};
      var push = function (ic, t) { t = clean(t); var k = t.toLowerCase().slice(0, 40); if (!t || seen[k]) return; seen[k] = 1; items.push({ ic: ic, t: t }); };
      (((d.hq && d.hq.feed) || [])).forEach(function (f) { push('⬡', String(f)); });
      (d.emails || []).forEach(function (e) { push('📨', e.subject || e.from || String(e)); });
      (d.tasks || []).slice(0, 1).forEach(function (t) { push('✓', t.title || String(t)); });
      el.innerHTML = items.length
        ? items.slice(0, 3).map(function (i) { return '<div class="tg-feed"><span class="tg-feed-ic">' + i.ic + '</span><span class="tg-txt">' + esc(i.t) + '</span></div>'; }).join('')
        : '<div class="tg-empty">quiet — nothing new</div>';
    }).catch(function () { el.innerHTML = '<div class="tg-empty">—</div>'; });
  }

  function fill() { fillTasks(); fillFeed(); }
  if (document.readyState !== 'loading') fill(); else document.addEventListener('DOMContentLoaded', fill);
  setInterval(fill, 60000);
  window.TalkHome = { refresh: fill };
})();
