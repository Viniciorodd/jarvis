/* tax-review.js — clears the tax capture/import queue. One overlay: every 'needs_review' ledger row
   (manual capture the LLM couldn't confidently classify, or an imported bank row) with Jarvis's best
   guess, a one-tap Accept, a taxonomy dropdown + Save, and Merge/Keep-both for suspected cross-source
   duplicates. Reads /api/tax/review, writes decisions to /api/tax/review/resolve. CSV/typed payee text
   is UNTRUSTED DATA — always rendered via .textContent, never innerHTML. Theme-agnostic (tax-review.css). */
(function(){
  function $id(id){ return document.getElementById(id); }
  function el(tag, cls, txt){ var n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n; }

  var view = $id('taxReviewView');
  var categories = [];
  var pending = [];

  function open(){ if(view){ view.hidden=false; load(); } }
  function close(){ if(view) view.hidden=true; }

  function usd(cents){ return '$' + (Number(cents||0)/100).toFixed(2); }

  function categorySelect(current){
    var sel = document.createElement('select');
    sel.className = 'tr-cat-select';
    var byForm = {};
    categories.forEach(function(c){ (byForm[c.form] = byForm[c.form] || []).push(c); });
    Object.keys(byForm).sort().forEach(function(form){
      var grp = document.createElement('optgroup');
      grp.label = form;
      byForm[form].forEach(function(c){
        var opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.label;
        if(c.id === current) opt.selected = true;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
    return sel;
  }

  function rowEl(entry){
    var row = el('div','tr-row');

    var main = el('div','tr-main');
    var top = el('div','tr-top');
    top.appendChild(el('span','tr-date', entry.dateISO || ''));
    var payee = el('span','tr-payee'); payee.textContent = entry.payee || '(no payee)'; top.appendChild(payee);
    top.appendChild(el('span','tr-amt', usd(entry.cents)));
    main.appendChild(top);

    var meta = el('div','tr-meta');
    meta.appendChild(el('span','tr-guess','Jarvis guess: ' + (entry.entity || '—') + ' / ' + (entry.category || '—')));
    main.appendChild(meta);

    if(entry.reviewKind === 'suspected-dup'){
      main.appendChild(el('div','tr-dupnote','possible duplicate of an earlier capture'));
    }

    row.appendChild(main);

    var acts = el('div','tr-acts');

    var accept = el('button','tr-btn tr-accept','Accept');
    accept.addEventListener('click', function(){ resolveRow(entry.hash, { decision:'accept' }, row); });
    acts.appendChild(accept);

    var sel = categorySelect(entry.category);
    acts.appendChild(sel);
    var save = el('button','tr-btn tr-save','Save');
    save.addEventListener('click', function(){ resolveRow(entry.hash, { decision:'recategorize', category: sel.value }, row); });
    acts.appendChild(save);

    if(entry.reviewKind === 'suspected-dup'){
      var merge = el('button','tr-btn tr-merge','Merge');
      merge.addEventListener('click', function(){ resolveRow(entry.hash, { decision:'merge' }, row); });
      acts.appendChild(merge);
      var keepBoth = el('button','tr-btn tr-keepboth','Keep both');
      keepBoth.addEventListener('click', function(){ resolveRow(entry.hash, { decision:'keep-both' }, row); });
      acts.appendChild(keepBoth);
    }

    var docs = el('button','tr-btn tr-docs','📎 receipts');
    docs.addEventListener('click', function(){ suggestDocs(entry.hash, row, docs); });
    acts.appendChild(docs);

    row.appendChild(acts);

    var docsBox = el('div','tr-docs-box');
    docsBox.hidden = true;
    row.appendChild(docsBox);

    return row;
  }

  function suggestDocs(hash, row, btn){
    var box = row.querySelector('.tr-docs-box');
    if(!box) return;
    if(!box.hidden){ box.hidden = true; return; }
    box.innerHTML = '';
    box.hidden = false;
    box.appendChild(el('div','tr-docs-loading','Looking for matching docs…'));
    fetch('/api/tax/docs/suggest', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hash: hash }) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        box.innerHTML = '';
        var suggestions = (d && d.suggestions) || [];
        if(!suggestions.length){
          box.appendChild(el('div','tr-docs-empty','no matching docs found'));
          return;
        }
        suggestions.forEach(function(s){
          var item = el('button','tr-doc-item');
          var name = el('span','tr-doc-name'); name.textContent = s.name || '(unnamed)';
          var kind = el('span','tr-doc-kind'); kind.textContent = s.kind || '';
          item.appendChild(name); item.appendChild(kind);
          item.addEventListener('click', function(){ attachDoc(hash, s.path, box, item); });
          box.appendChild(item);
        });
      })
      .catch(function(){
        box.innerHTML = '';
        box.appendChild(el('div','tr-docs-empty','could not reach docs index'));
      });
  }

  function attachDoc(hash, docPath, box, item){
    fetch('/api/tax/entry/attach-doc', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hash: hash, docPath: docPath }) })
      .then(function(r){ return r.json(); })
      .then(function(res){
        if(res && res.ok){
          box.innerHTML = '';
          box.appendChild(el('div','tr-docs-attached','📎 attached'));
        }
      })
      .catch(function(){ /* leave the list as-is on failure */ });
  }

  function renderCount(){
    var cnt = $id('trCount');
    if(cnt) cnt.textContent = pending.length + (pending.length === 1 ? ' item to review' : ' items to review');
  }

  function render(){
    var list = $id('trList');
    if(!list) return;
    list.innerHTML = '';
    renderCount();
    if(!pending.length){
      list.appendChild(el('div','tr-empty','All caught up — nothing to review.'));
      return;
    }
    pending.forEach(function(entry){ list.appendChild(rowEl(entry)); });
  }

  var loading = false;
  function load(){
    if(loading) return; loading = true;
    fetch('/api/tax/review').then(function(r){ return r.json(); }).then(function(d){
      pending = (d && d.pending) || [];
      categories = (d && d.categories) || [];
      render();
    }).catch(function(){
      var list = $id('trList');
      if(list){ list.innerHTML=''; list.appendChild(el('div','tr-empty','Could not reach the review queue.')); }
    }).then(function(){ loading = false; });
  }

  function resolveRow(hash, opts, row){
    if(row) row.classList.add('tr-gone');
    fetch('/api/tax/review/resolve', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ hash: hash, decision: opts.decision, entity: opts.entity, category: opts.category }) })
      .then(function(r){ return r.json(); })
      .then(function(res){
        if(res && res.error){ if(row) row.classList.remove('tr-gone'); return; }
        pending = pending.filter(function(e){ return e.hash !== hash; });
        render();
        if(window.TodayCockpit && window.TodayCockpit.reload) window.TodayCockpit.reload();
      })
      .catch(function(){ if(row) row.classList.remove('tr-gone'); });
  }

  // exposed so the 💰 Home line (today.js) can open this screen
  window.TaxReview = { open: open, reload: function(){ if(view && !view.hidden) load(); } };

  var x = $id('trX'); if(x) x.addEventListener('click', close);
  var rf = $id('trRefresh'); if(rf) rf.addEventListener('click', load);
})();
