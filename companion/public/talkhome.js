/* talkhome.js — fills the voice-first home (the Talk tab) glance under the orb:
   "what's mine to do today" (the one thing + today's to-dos, from /api/cockpit) and
   "recent activity" (from /api/dashboard). Read-only; refreshes on a calm interval. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  function fillTasks() {
    var el = $('jtTasks'); if (!el) return;
    fetch('/api/cockpit').then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (!c) { el.innerHTML = '<div class="tg-empty">offline</div>'; return; }
      var ot = c.oneThing;
      var due = (c.tasks && c.tasks.dueToday) || [];
      var act = (c.tasks && c.tasks.active) || [];
      var tasks = due.concat(act).slice(0, 6);
      var html = '';
      if (ot && ot.text) html += '<div class="tg-onething"><span class="tg-ot-l">THE ONE THING</span>' + esc(ot.text) + '</div>';
      html += '<div class="tg-h">Today’s to-dos</div>';
      html += tasks.length
        ? tasks.map(function (t) { return '<div class="tg-task"><span>▢</span><span>' + esc(t.text || t.title || t) + '</span></div>'; }).join('')
        : '<div class="tg-empty">nothing due — you’re clear</div>';
      el.innerHTML = html;
    }).catch(function () { el.innerHTML = '<div class="tg-empty">—</div>'; });
  }

  function fillFeed() {
    var el = $('jtFeed'); if (!el) return;
    fetch('/api/dashboard').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) { el.innerHTML = '<div class="tg-empty">offline</div>'; return; }
      var items = [];
      (d.emails || []).slice(0, 3).forEach(function (e) { items.push({ ic: '📨', t: e.subject || e.from || String(e) }); });
      (((d.hq && d.hq.feed) || [])).slice(0, 5).forEach(function (f) { items.push({ ic: '⬡', t: String(f) }); });
      (d.tasks || []).slice(0, 2).forEach(function (t) { items.push({ ic: '✓', t: t.title || String(t) }); });
      el.innerHTML = '<div class="tg-h">Recent activity</div>' + (items.length
        ? items.slice(0, 7).map(function (i) { return '<div class="tg-feed"><span class="tg-feed-ic">' + i.ic + '</span><span>' + esc(i.t) + '</span></div>'; }).join('')
        : '<div class="tg-empty">no recent activity yet</div>');
    }).catch(function () { el.innerHTML = '<div class="tg-empty">—</div>'; });
  }

  function fill() { fillTasks(); fillFeed(); }
  if (document.readyState !== 'loading') fill(); else document.addEventListener('DOMContentLoaded', fill);
  setInterval(fill, 60000);
})();
