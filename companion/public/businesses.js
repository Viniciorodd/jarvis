/* businesses.js — the Businesses hub (the new Ops default). Lists every business with where it stands
   + whose move is next; tapping one opens its board in the same card language as the Gov board. Gov
   opens its dedicated board; unwired businesses show the "give Jarvis the files" setup path. Reads
   /api/businesses + /api/business; theme-agnostic (styling in today.css). */
(function(){
  function $id(id){ return document.getElementById(id); }
  function el(tag, cls, txt){ var n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n; }

  var view = $id('bizView');
  function open(){ if(view){ view.hidden=false; load(); } }
  function close(){ if(view) view.hidden=true; }

  function row(b){
    var r = el('div','biz-row');
    var ic = el('div','biz-ic'); ic.innerHTML = '<i class="ti ti-' + b.icon + '" aria-hidden="true"></i>'; r.appendChild(ic);
    var mid = el('div','biz-mid');
    mid.appendChild(el('div','biz-name', b.name + (b.tagline ? '  ·  ' + b.tagline : '')));
    mid.appendChild(el('div','biz-status', b.status || ''));
    r.appendChild(mid);
    var nx = el('div','biz-next');
    nx.appendChild(el('span','biz-who ' + (b.next.who === 'you' ? 'you' : 'jarvis'), b.next.who === 'you' ? 'You' : 'Jarvis'));
    nx.appendChild(el('div','biz-next-text', b.next.text));
    r.appendChild(nx);
    r.addEventListener('click', function(){ openBusiness(b); });
    return r;
  }

  function render(d){
    var hub = $id('bizHub'); hub.innerHTML = '';
    var list = (d && d.businesses) || [];
    var you = list.filter(function(b){ return b.next && b.next.who === 'you'; }).length;
    $id('bizStat').textContent = list.length + ' businesses · ' + you + ' need you';
    if(!list.length){ hub.appendChild(el('div','ops-empty', (d && d.error) ? ('Could not load: ' + d.error) : 'No businesses.')); return; }
    list.forEach(function(b){ hub.appendChild(row(b)); });
  }

  var ACT_ICON = { done: '✓', todo: '☐', idea: '💡', blocker: '⛔', note: '📝' };

  function openBusiness(b){
    $id('bizDetailCap').textContent = b.name;
    $id('bizDetailBody').innerHTML = '<div class="ops-empty">loading…</div>';
    $id('bizDetail').hidden = false;
    loadDetail(b.id);
  }
  function addContact(id, cells){
    fetch('/api/business/crm', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:id, cells:cells }) })
      .then(function(r){ return r.json(); }).then(function(){ loadDetail(id); }).catch(function(){});
  }
  function crmSection(b){
    var wrap = el('div','biz-crm');
    wrap.appendChild(el('div','biz-act-h', 'Contacts (CRM) — ' + b.crm.rows.length + ' · synced to the vault'));
    if(b.crm.headers.length){
      var table = el('table','crm-table');
      var thead = el('tr'); b.crm.headers.forEach(function(h){ thead.appendChild(el('th', null, h)); }); table.appendChild(thead);
      b.crm.rows.slice(0, 40).forEach(function(row){ var tr = el('tr'); b.crm.headers.forEach(function(_, i){ tr.appendChild(el('td', null, row[i] || '')); }); table.appendChild(tr); });
      wrap.appendChild(table);
      var form = el('form','crm-add');
      var inputs = b.crm.headers.map(function(h){ var i = el('input'); i.placeholder = h; i.autocomplete = 'off'; form.appendChild(i); return i; });
      var go = el('button','td-btn','Add'); go.type = 'submit'; form.appendChild(go);
      form.addEventListener('submit', function(e){ e.preventDefault(); var cells = inputs.map(function(i){ return i.value.trim(); }); if(!cells.some(Boolean)) return; inputs.forEach(function(i){ i.value = ''; }); addContact(b.id, cells); });
      wrap.appendChild(form);
    } else { wrap.appendChild(el('div','biz-act-empty','No contacts yet — add the first one below.')); }
    return wrap;
  }
  function loadDetail(id){
    fetch('/api/business?id=' + encodeURIComponent(id)).then(function(r){ return r.json(); }).then(renderDetail)
      .catch(function(){ var body = $id('bizDetailBody'); body.innerHTML = ''; body.appendChild(el('div','ops-empty','Could not load this business.')); });
  }
  function logIt(id, type, text){
    fetch('/api/business/log', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:id, type:type, text:text }) })
      .then(function(r){ return r.json(); }).then(function(){ loadDetail(id); }).catch(function(){});
  }

  function activitySection(b){
    var act = el('div','biz-act');
    act.appendChild(el('div','biz-act-h','Activity — saved to ' + (b.folder || 'the vault') + ' (shows in Obsidian too)'));
    var form = el('form','biz-logbox');
    var inp = el('input'); inp.placeholder = 'Log something — done · to-do · idea · blocker'; inp.autocomplete = 'off';
    form.appendChild(inp);
    var chips = el('div','biz-logtypes'); var sel = { t: 'done' };
    [['done','Done'],['todo','To-do'],['idea','Idea'],['blocker','Blocker']].forEach(function(p, i){
      var c = el('button','biz-chip' + (i === 0 ? ' on' : ''), p[1]); c.type = 'button';
      c.addEventListener('click', function(){ sel.t = p[0]; [].forEach.call(chips.children, function(x){ x.classList.remove('on'); }); c.classList.add('on'); });
      chips.appendChild(c);
    });
    form.appendChild(chips);
    var go = el('button','td-btn','Log'); go.type = 'submit'; form.appendChild(go);
    form.addEventListener('submit', function(e){ e.preventDefault(); var v = inp.value.trim(); if(!v) return; inp.value = ''; logIt(b.id, sel.t, v); });
    act.appendChild(form);
    var list = el('div','biz-act-list');
    (b.activity || []).forEach(function(e){
      var rowt = el('div','biz-act-row ' + e.type);
      rowt.appendChild(el('span','biz-act-ic', ACT_ICON[e.type] || '•'));
      rowt.appendChild(el('span','biz-act-tx', e.text));
      if(e.date) rowt.appendChild(el('span','biz-act-dt', e.date));
      list.appendChild(rowt);
    });
    if(!(b.activity || []).length) list.appendChild(el('div','biz-act-empty','Nothing logged yet — add the first thing above.'));
    act.appendChild(list);
    return act;
  }

  function moneySection(b){
    var m = b.money;
    var wrap = el('div','money');
    var head = el('div','money-head');
    head.appendChild(el('span','money-mtd', '$' + (m.mtd || 0).toLocaleString()));
    head.appendChild(el('span','money-goal', ' / $' + (m.goal || 10000).toLocaleString() + ' this month'));
    wrap.appendChild(head);
    var bar = el('div','money-bar'); var fill = el('div','money-fill'); fill.style.width = (m.pct || 0) + '%'; bar.appendChild(fill); wrap.appendChild(bar);
    wrap.appendChild(el('div','money-sub', m.pct >= 100 ? '🎯 Goal hit this month!' : '$' + (m.remaining || 0).toLocaleString() + ' to go · lifetime $' + (m.total || 0).toLocaleString()));
    if(m.stripe && !m.stripe.error){ wrap.appendChild(el('div','money-stripe', 'Stripe: $' + (m.stripe.weekCollected || 0).toLocaleString() + ' this week (' + m.stripe.mode + ')')); }
    var form = el('form','money-add');
    var src = el('input'); src.placeholder = 'Source (gov, Fiverr, cash…)'; src.autocomplete = 'off';
    var amt = el('input'); amt.placeholder = '$ amount'; amt.inputMode = 'decimal'; amt.autocomplete = 'off';
    var note = el('input'); note.placeholder = 'note (optional)'; note.autocomplete = 'off';
    form.appendChild(src); form.appendChild(amt); form.appendChild(note);
    var go = el('button','td-btn','Log $'); go.type = 'submit'; form.appendChild(go);
    form.addEventListener('submit', function(e){ e.preventDefault(); if(!src.value.trim() || !amt.value.trim()) return;
      fetch('/api/money/log', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ source:src.value.trim(), amount:amt.value.trim(), notes:note.value.trim() }) })
        .then(function(r){ return r.json(); }).then(function(){ loadDetail(b.id); }).catch(function(){});
    });
    wrap.appendChild(form);
    if(m.recent && m.recent.length){
      var list = el('div','money-recent');
      m.recent.forEach(function(r){ var row = el('div','money-row'); row.appendChild(el('span','money-rdate', r.date)); row.appendChild(el('span','money-rsrc', r.source)); row.appendChild(el('span','money-ramt', '$' + (r.amount || 0).toLocaleString())); list.appendChild(row); });
      wrap.appendChild(list);
    }
    return wrap;
  }

  function renderDetail(b){
    var body = $id('bizDetailBody'); body.innerHTML = '';
    if(b && b.error){ body.appendChild(el('div','ops-empty','Could not load: ' + b.error)); return; }
    var nx = el('div','gov-next');
    nx.appendChild(el('div','gov-next-label','YOUR NEXT MOVE'));
    nx.appendChild(el('div','gov-next-text', b.next.text));
    nx.appendChild(el('div','gov-next-sub', b.status || ''));
    body.appendChild(nx);

    if(b.money){ body.appendChild(moneySection(b)); body.appendChild(el('div','biz-act-div')); }

    if(b.boardKind === 'gov'){
      var openBtn = el('button','crm-openboard','Open the Gov Pipeline board →');
      openBtn.addEventListener('click', function(){ close(); var g = $id('govBtn'); if(g) g.click(); });
      body.appendChild(openBtn);
    }

    body.appendChild(activitySection(b));
    if(b.crm){ body.appendChild(el('div','biz-act-div')); body.appendChild(crmSection(b)); }

    if(b.setup){
      body.appendChild(el('div','biz-act-div'));
      var s = el('div','biz-setup'); s.innerHTML = '<i class="ti ti-folder-plus" aria-hidden="true"></i>';
      var t = el('div');
      t.appendChild(el('div','biz-setup-h','Board not wired up yet'));
      t.appendChild(el('div','biz-setup-p','Drop the files + notes for ' + b.name + ' into Jarvis (or tell her in Talk) and she’ll wire up a board the same way. You can already log activity above.'));
      s.appendChild(t); body.appendChild(s); return;
    }
    if(b.boardKind === 'gov') return; // the board is the dedicated Gov Pipeline overlay (button above)
    if(!b.board) return; // status-only (e.g. Finance) — the activity log is enough
    body.appendChild(el('div','biz-act-div'));
    if(!b.board.cards.length){ body.appendChild(el('div','ops-empty', b.empty || 'Nothing on the board yet.')); return; }
    var board = el('div','gov-board');
    b.board.stages.forEach(function(stage){
      var cards = b.board.cards.filter(function(c){ return c.stage === stage; });
      var col = el('div','gov-col');
      var h = el('div','gov-col-h'); h.appendChild(el('span','gov-col-name', stage)); h.appendChild(el('span','gov-col-n', cards.length)); col.appendChild(h);
      cards.forEach(function(c){
        var card = el('div','gov-card' + (c.who === 'you' ? ' you' : ''));
        card.appendChild(el('div','gov-card-title', c.title));
        if(c.meta){ var m = el('div','gov-card-meta'); m.appendChild(el('span', null, c.meta)); card.appendChild(m); }
        var na = el('div','gov-na' + (c.who === 'you' ? ' you' : ''));
        na.appendChild(el('span','gov-na-who', c.who === 'you' ? '👤 You' : '🤖 Jarvis'));
        if(c.next) na.appendChild(el('span','gov-na-text', c.next));
        card.appendChild(na);
        col.appendChild(card);
      });
      if(!cards.length) col.appendChild(el('div','gov-col-empty','—'));
      board.appendChild(col);
    });
    body.appendChild(board);
  }

  var loading=false;
  function load(){
    if(loading) return; loading=true;
    fetch('/api/businesses').then(function(r){ return r.json(); }).then(render)
      .catch(function(){ $id('bizHub').innerHTML=''; $id('bizHub').appendChild(el('div','ops-empty','Could not reach the hub.')); })
      .then(function(){ loading=false; });
  }

  var btn=$id('bizBtn'); if(btn) btn.addEventListener('click', open);
  var x=$id('bizX'); if(x) x.addEventListener('click', close);
  var rf=$id('bizRefresh'); if(rf) rf.addEventListener('click', load);
  var dx=$id('bizDetailX'); if(dx) dx.addEventListener('click', function(){ $id('bizDetail').hidden = true; });
  var oldops=$id('bizOldOps'); if(oldops) oldops.addEventListener('click', function(){ close(); var o=$id('opsBtn'); if(o) o.click(); });
})();
