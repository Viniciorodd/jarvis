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

  function openBusiness(b){
    if(b.boardKind === 'gov'){ close(); var g = $id('govBtn'); if(g) g.click(); return; }
    $id('bizDetailCap').textContent = b.name;
    var body = $id('bizDetailBody'); body.innerHTML = '<div class="ops-empty">loading…</div>';
    $id('bizDetail').hidden = false;
    fetch('/api/business?id=' + encodeURIComponent(b.id)).then(function(r){ return r.json(); }).then(renderDetail)
      .catch(function(){ body.innerHTML = ''; body.appendChild(el('div','ops-empty','Could not load this business.')); });
  }

  function renderDetail(b){
    var body = $id('bizDetailBody'); body.innerHTML = '';
    var nx = el('div','gov-next');
    nx.appendChild(el('div','gov-next-label','YOUR NEXT MOVE'));
    nx.appendChild(el('div','gov-next-text', b.next.text));
    nx.appendChild(el('div','gov-next-sub', b.status || ''));
    body.appendChild(nx);
    if(b.setup){
      var s = el('div','biz-setup'); s.innerHTML = '<i class="ti ti-folder-plus" aria-hidden="true"></i>';
      var t = el('div');
      t.appendChild(el('div','biz-setup-h','Not wired up yet'));
      t.appendChild(el('div','biz-setup-p','Drop the files + a few notes for ' + b.name + ' into Jarvis (or just tell her in Talk), and she’ll set up this board the same way — same stages, same “whose move is next”.'));
      s.appendChild(t); body.appendChild(s); return;
    }
    if(!b.board){ body.appendChild(el('div','ops-empty','Tracked as a status only — no board for this one yet.')); return; }
    if(!b.board.cards.length){ body.appendChild(el('div','ops-empty', b.empty || 'Nothing here yet.')); return; }
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
