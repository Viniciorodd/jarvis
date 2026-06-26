/* calendar.js — the Today tab's day/week/month calendar. Reads /api/calendar (Google), renders a real
   grid you can navigate (‹ Today ›) and switch views (Day/Week/Month). Day view lets you delete an
   event. Theme-agnostic (styling in today.css). */
(function(){
  function $id(id){ return document.getElementById(id); }
  function el(tag, cls, txt){ var n = document.createElement(tag); if(cls) n.className = cls; if(txt != null) n.textContent = txt; return n; }
  var DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function pad(n){ return String(n).padStart(2, '0'); }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfWeek(d){ var x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; }
  function monthGridStart(d){ return startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1)); }
  function fmtTime(iso){ if(/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''; var d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }); }
  function dayKeyOf(iso){ if(String(iso).length <= 10) return String(iso).slice(0, 10); var d = new Date(iso); return isNaN(d.getTime()) ? String(iso).slice(0, 10) : ymd(d); }
  var todayKey = ymd(new Date());

  var state = { view: 'month', anchor: new Date() };
  var loading = false;

  function rangeFor(){
    if(state.view === 'month') return { start: monthGridStart(state.anchor), days: 42 };
    if(state.view === 'week') return { start: startOfWeek(state.anchor), days: 7 };
    var d = new Date(state.anchor); d.setHours(0,0,0,0); return { start: d, days: 1 };
  }

  function render(){
    if(loading) return; loading = true;
    var r = rangeFor();
    fetch('/api/calendar?start=' + ymd(r.start) + '&days=' + r.days)
      .then(function(x){ return x.json(); }).then(draw)
      .catch(function(){ $id('calBody').innerHTML = '<div class="cal-empty">Could not load calendar.</div>'; })
      .then(function(){ loading = false; });
  }

  function draw(d){
    var events = d.events || [];
    var status = $id('tdCalStatus');
    if(status) status.textContent = (!d.hasGoogle || d.error === 'not-connected') ? 'not connected' : (d.error ? 'error' : events.length + ' events');
    var byDay = {};
    events.forEach(function(e){ var k = dayKeyOf(e.start); (byDay[k] = byDay[k] || []).push(e); });
    Object.keys(byDay).forEach(function(k){ byDay[k].sort(function(a, b){ return (a.allDay ? '' : a.start) < (b.allDay ? '' : b.start) ? -1 : 1; }); });
    var t = $id('calTitle');
    if(state.view === 'month') t.textContent = MON[state.anchor.getMonth()] + ' ' + state.anchor.getFullYear();
    else if(state.view === 'week'){ var ws = startOfWeek(state.anchor), we = new Date(ws); we.setDate(we.getDate() + 6); t.textContent = MON[ws.getMonth()].slice(0,3) + ' ' + ws.getDate() + ' – ' + (we.getMonth() !== ws.getMonth() ? MON[we.getMonth()].slice(0,3) + ' ' : '') + we.getDate(); }
    else t.textContent = state.anchor.toLocaleDateString([], { weekday:'long', month:'short', day:'numeric' });
    var body = $id('calBody'); body.innerHTML = '';
    body.appendChild(state.view === 'month' ? monthGrid(byDay) : state.view === 'week' ? weekGrid(byDay) : dayView(byDay));
  }

  function chip(e){ var c = el('div', 'cal-ev' + (e.allDay ? ' allday' : '')); var tm = fmtTime(e.start); c.textContent = (tm ? tm + ' ' : '') + e.summary; c.title = e.summary + (e.location ? ' · ' + e.location : ''); return c; }

  function monthGrid(byDay){
    var wrap = el('div','cal-month');
    var head = el('div','cal-dow'); DOW.forEach(function(x){ head.appendChild(el('span', null, x)); }); wrap.appendChild(head);
    var grid = el('div','cal-grid'); var start = monthGridStart(state.anchor); var m = state.anchor.getMonth();
    for(var i = 0; i < 42; i++){
      var day = new Date(start); day.setDate(day.getDate() + i); var k = ymd(day);
      var cell = el('div','cal-cell' + (day.getMonth() !== m ? ' off' : '') + (k === todayKey ? ' today' : ''));
      cell.appendChild(el('div','cal-dnum', String(day.getDate())));
      var evs = byDay[k] || [];
      evs.slice(0, 3).forEach(function(e){ cell.appendChild(chip(e)); });
      if(evs.length > 3) cell.appendChild(el('div','cal-more', '+' + (evs.length - 3)));
      (function(dd){ cell.addEventListener('click', function(){ state.anchor = dd; state.view = 'day'; syncViewBtns(); render(); }); })(new Date(day));
      grid.appendChild(cell);
    }
    wrap.appendChild(grid); return wrap;
  }

  function weekGrid(byDay){
    var wrap = el('div','cal-week'); var ws = startOfWeek(state.anchor);
    for(var i = 0; i < 7; i++){
      var day = new Date(ws); day.setDate(day.getDate() + i); var k = ymd(day);
      var col = el('div','cal-wcol' + (k === todayKey ? ' today' : ''));
      var h = el('div','cal-wh'); h.appendChild(el('span','cal-wdow', DOW[day.getDay()])); h.appendChild(el('span','cal-wnum', String(day.getDate()))); col.appendChild(h);
      var evs = byDay[k] || [];
      if(!evs.length) col.appendChild(el('div','cal-wempty','—'));
      else evs.forEach(function(e){ col.appendChild(chip(e)); });
      (function(dd){ h.addEventListener('click', function(){ state.anchor = dd; state.view = 'day'; syncViewBtns(); render(); }); })(new Date(day));
      wrap.appendChild(col);
    }
    return wrap;
  }

  function dayView(byDay){
    var wrap = el('div','cal-day'); var k = ymd(state.anchor); var evs = byDay[k] || [];
    if(!evs.length){ wrap.appendChild(el('div','cal-empty','Nothing scheduled.')); return wrap; }
    evs.forEach(function(e){
      var row = el('div','cal-drow');
      row.appendChild(el('span','cal-dt', e.allDay ? 'all day' : fmtTime(e.start)));
      var s = el('span','cal-dsum', e.summary); if(e.location) s.appendChild(el('span','cal-dloc', '  · ' + e.location)); row.appendChild(s);
      if(e.id){ var x = el('button','cal-dx','✕'); x.title = 'Delete event'; x.addEventListener('click', function(){ if(confirm('Delete “' + (e.summary || 'event') + '”?')) del(e.id); }); row.appendChild(x); }
      wrap.appendChild(row);
    });
    return wrap;
  }

  function del(id){
    fetch('/api/cockpit/event/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:id }) })
      .then(function(r){ return r.json(); }).then(function(res){ if(res && res.error) alert('Delete failed: ' + res.error); else render(); }).catch(function(){});
  }

  function shift(n){
    var a = new Date(state.anchor);
    if(state.view === 'month') a.setMonth(a.getMonth() + n);
    else if(state.view === 'week') a.setDate(a.getDate() + 7 * n);
    else a.setDate(a.getDate() + n);
    state.anchor = a; render();
  }
  function syncViewBtns(){ var bs = document.querySelectorAll('.cal-vbtn'); for(var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-view') === state.view); }

  var p = $id('calPrev'); if(p) p.addEventListener('click', function(){ shift(-1); });
  var nx = $id('calNext'); if(nx) nx.addEventListener('click', function(){ shift(1); });
  var td = $id('calToday'); if(td) td.addEventListener('click', function(){ state.anchor = new Date(); render(); });
  var vbs = document.querySelectorAll('.cal-vbtn');
  for(var i = 0; i < vbs.length; i++) vbs[i].addEventListener('click', function(){ state.view = this.getAttribute('data-view'); syncViewBtns(); render(); });
  var nav = $id('jNavToday'); if(nav) nav.addEventListener('click', function(){ setTimeout(render, 60); });
  window.__calRefresh = render;
  render();
})();
