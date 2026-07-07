/* today.js — folds the cockpit into the Jarvis shell: the Home glance (one thing · today's tasks ·
   rolling approvals ticker) and the full Today tab (tasks · week · capture). Reads /api/cockpit and
   writes back to the vault (add/complete/capture). Vanilla, theme-agnostic (styling lives in today.css). */
(function(){
  function $id(id){ return document.getElementById(id); }
  function el(tag, cls, txt){ var n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n; }
  function api(path, opts){ return fetch(path, opts).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); }); }

  function fmtTime(iso){
    if(!iso) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'all day';
    var d = new Date(iso); if(isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }
  function dayKey(iso){ return String(iso).slice(0,10); }

  /* one task row — compact (home) hides the meta line */
  function taskRow(t, compact){
    var row = el('div','td-task');
    var box = el('span','td-box'); box.title = 'Complete';
    box.addEventListener('click', function(){ completeTask(t, row); });
    var body = el('div','td-body');
    body.appendChild(el('div','td-txt', t.text));
    if(!compact){
      var meta = el('div','td-meta');
      if(t.due) meta.appendChild(el('span','td-due','📅 '+t.due));
      if(t.priority === 'high' || t.priority === 'highest') meta.appendChild(el('span','td-hi','↑ '+t.priority));
      (t.tags||[]).slice(0,3).forEach(function(tg){ meta.appendChild(el('span','td-tag','#'+tg)); });
      if(meta.childNodes.length) body.appendChild(meta);
    }
    row.appendChild(box); row.appendChild(body);
    return row;
  }

  /* ── HOME: ticker + one thing + today's tasks ─────────────────────────────── */
  function renderTicker(aps){
    var ticker = $id('jTicker'), track = $id('jTickerTrack');
    if(!ticker || !track) return;
    if(!aps.length){ ticker.hidden = true; return; }
    ticker.hidden = false;
    track.innerHTML = '';
    var titles = aps.map(function(a){ return a.title || a.action; });
    // one segment, duplicated, so the -50% keyframe loops seamlessly
    function seg(){
      var s = el('span','j-ticker-seg');
      s.appendChild(el('span','j-tk-lead', '  ⏳ '+aps.length+' awaiting you  '));
      titles.forEach(function(t){ s.appendChild(el('span','j-tk-dot','•  ')); s.appendChild(document.createTextNode(t+'  ')); });
      return s;
    }
    track.appendChild(seg()); track.appendChild(seg());
  }

  function renderOneThing(o){
    var card = $id('jOneThing');
    if(!card) return;
    if(!o){ card.hidden = true; return; }
    card.hidden = false;
    $id('jOtText').textContent = o.text;
    var meta = $id('jOtMeta'); meta.innerHTML = '';
    if(o.kind === 'gov') meta.appendChild(el('span','j-ot-tag gov','Gov · #1 priority'));
    else if(o.kind === 'approval') meta.appendChild(el('span','j-ot-tag gov','Awaiting your sign-off'));
    else if(o.kind === 'task') meta.appendChild(el('span','j-ot-tag','From your tasks'));
    if(o.deadline) meta.appendChild(el('span','j-ot-due','due '+o.deadline));
  }

  function renderTax(t){
    var old = $id('jTaxLine'); if(old) old.remove();
    var oldDl = $id('jTaxDeadlineLine'); if(oldDl) oldDl.remove();
    if(!t || !t.headline) return;
    var ticker = $id('jTicker'); if(!ticker || !ticker.parentNode) return;
    var el2 = document.createElement('div');
    el2.id = 'jTaxLine'; el2.className = 'j-tax-line';
    el2.style.cssText = 'font-size:12px;opacity:.85;padding:6px 10px;cursor:default;';
    el2.appendChild(document.createTextNode('💰 ' + t.headline + (t.paymentsDue ? ' · ' + t.paymentsDue + ' payment(s) coming up' : '')));
    if(t.needsReview > 0){
      var reviewLink = el('span','j-tax-review-link', ' · ' + t.needsReview + ' to review');
      reviewLink.style.cssText = 'cursor:pointer;text-decoration:underline;';
      reviewLink.addEventListener('click', function(){ if(window.TaxReview) window.TaxReview.open(); });
      el2.appendChild(reviewLink);
    }
    ticker.parentNode.insertBefore(el2, ticker);
    if(t.upcomingDeadlines && t.upcomingDeadlines.length){
      var nd = t.upcomingDeadlines[0];
      var dl = el('div','j-tax-deadline-line');
      dl.id = 'jTaxDeadlineLine';
      dl.style.cssText = 'font-size:12px;opacity:.85;padding:0 10px 6px;cursor:default;';
      var dlText = '📅 ' + nd.label + ' in ' + nd.daysUntil + 'd';
      if(nd.amountCents){ dlText += ' · ≈$' + Math.round(nd.amountCents / 100).toLocaleString('en-US'); }
      dl.textContent = dlText;
      ticker.parentNode.insertBefore(dl, ticker);
    }
  }

  function renderHomeTasks(tasks){
    var wrap = $id('jTodayTasks'), cnt = $id('jTodayCount');
    if(!wrap) return;
    var due = (tasks && tasks.dueToday) || [], active = (tasks && tasks.active) || [];
    if(cnt) cnt.textContent = (due.length ? due.length+' due · ' : '') + active.length + ' active';
    wrap.innerHTML = '';
    var list = due.concat(active).slice(0,5);
    if(!list.length){ wrap.appendChild(el('div','j-pipe-empty','Nothing queued — add one in Today.')); return; }
    list.forEach(function(t){ wrap.appendChild(taskRow(t, true)); });
  }

  /* ── TODAY tab: tasks + week + capture ────────────────────────────────────── */
  function renderTodayTab(d){
    var due = (d.tasks && d.tasks.dueToday) || [], active = (d.tasks && d.tasks.active) || [];
    var cnt = $id('tdTaskCount'); if(cnt) cnt.textContent = (due.length ? due.length+' due · ' : '') + active.length + ' active';
    var dueWrap = $id('tdDueWrap'), dueList = $id('tdDueList');
    if(dueList){
      dueList.innerHTML = '';
      if(!due.length){ if(dueWrap) dueWrap.style.display = 'none'; }
      else { if(dueWrap) dueWrap.style.display = ''; due.forEach(function(t){ dueList.appendChild(taskRow(t, false)); }); }
    }
    var aList = $id('tdActiveList');
    if(aList){
      aList.innerHTML = '';
      if(!active.length) aList.appendChild(el('div','j-pipe-empty','Nothing active. Add a task above.'));
      else active.slice(0,40).forEach(function(t){ aList.appendChild(taskRow(t, false)); });
    }
    // the calendar (day/week/month) is rendered by calendar.js into #calWidget
  }

  function render(d){
    if(!d) return;
    renderTicker(d.approvals || []);
    renderOneThing(d.oneThing);
    renderTax(d.tax);
    renderHomeTasks(d.tasks);
    renderTodayTab(d);
  }

  var loading = false;
  function load(){
    if(loading) return; loading = true;
    api('/api/cockpit').then(render).catch(function(){}).then(function(){ loading = false; });
  }

  function completeTask(t, row){
    if(row) row.classList.add('td-gone');
    api('/api/cockpit/task/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:t.id, file:t.file, raw:t.raw }) })
      .then(function(){ setTimeout(load, 350); })
      .catch(function(){ if(row) row.classList.remove('td-gone'); });
  }

  function deleteEvent(id){
    fetch('/api/cockpit/event/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:id }) })
      .then(function(r){ return r.json(); })
      .then(function(res){ if(res && res.error) alert('Delete failed: ' + res.error); else load(); })
      .catch(function(){});
  }

  /* parse inline "📅 2026-07-01" + "#tags" out of a quick-add line */
  function parseQuickAdd(raw){
    var dm = raw.match(/📅\s*(\d{4}-\d{2}-\d{2})/) || raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    var due = dm ? dm[1] : '';
    var tags = [], m, re = /#([A-Za-z0-9_\/-]+)/g;
    while((m = re.exec(raw))) tags.push(m[1]);
    var text = raw.replace(/📅\s*\d{4}-\d{2}-\d{2}/g,'').replace(/\b\d{4}-\d{2}-\d{2}\b/g,'').replace(/#[A-Za-z0-9_\/-]+/g,'').replace(/\s+/g,' ').trim();
    return { text:text, due:due, tags:tags };
  }

  function wire(){
    var addForm = $id('tdAddForm');
    if(addForm) addForm.addEventListener('submit', function(e){
      e.preventDefault();
      var inp = $id('tdAddInput'); var v = inp.value.trim(); if(!v) return;
      var body = parseQuickAdd(v); if(!body.text) return;
      inp.value = '';
      api('/api/cockpit/task/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(load).catch(function(){ inp.value = v; });
    });
    var capForm = $id('tdCapForm');
    if(capForm) capForm.addEventListener('submit', function(e){
      e.preventDefault();
      var inp = $id('tdCapInput'); var v = inp.value.trim(); if(!v) return;
      inp.value = '';
      var toast = $id('tdToast');
      api('/api/cockpit/capture', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text:v }) })
        .then(function(){ if(toast){ toast.textContent = '✓ captured to the vault'; setTimeout(function(){ toast.textContent = ''; }, 2500); } load(); })
        .catch(function(){ if(toast) toast.textContent = 'failed'; });
    });
    var evForm = $id('tdEventForm');
    if(evForm) evForm.addEventListener('submit', function(e){
      e.preventDefault();
      var title = $id('tdEventTitle').value.trim(), date = $id('tdEventDate').value, time = $id('tdEventTime').value;
      var toast = $id('tdEventToast');
      if(!title || !date){ if(toast){ toast.style.color = 'var(--dim)'; toast.textContent = 'need a title + date'; } return; }
      api('/api/cockpit/event', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ summary:title, date:date, time:time }) })
        .then(function(){ if(toast){ toast.style.color = 'var(--teal)'; toast.textContent = '✓ added to your calendar'; setTimeout(function(){ toast.textContent = ''; }, 2500); } $id('tdEventTitle').value = ''; load(); if(window.__calRefresh) window.__calRefresh(); })
        .catch(function(err){ if(toast){ toast.style.color = 'var(--coral, #f08a7a)'; toast.textContent = String(err.message || 'failed — re-run google-auth for calendar write'); } });
    });
    // "all →" jumps to the Today tab; the ticker opens Operations (where you review + approve)
    var more = $id('jTodayMore'); if(more) more.addEventListener('click', function(e){ e.preventDefault(); var b = $id('jNavToday'); if(b) b.click(); });
    var ticker = $id('jTicker'); if(ticker) ticker.addEventListener('click', function(){ var b = $id('opsBtn'); if(b) b.click(); });
  }

  // let other screens (tax-review.js) ask the Home glance to refresh after they change data
  window.TodayCockpit = { reload: load };

  wire();
  load();
  setInterval(load, 60000);
})();
