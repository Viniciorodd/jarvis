/* govboard.js — the Gov Pipeline board overlay. One plain view: where every opportunity stands
   (Found→Reviewing→Responding→Submitted→Won/Lost), the fit score, and — the whole point — WHOSE move
   is next (you vs Jarvis). Reads /api/gov-board (derived from the live scout + gates), writes manual
   dispositions. Theme-agnostic (styling in today.css). */
(function(){
  function $id(id){ return document.getElementById(id); }
  function el(tag, cls, txt){ var n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n; }
  function fitStars(n){ n=Math.max(0,Math.min(5,n||0)); return '★★★★★'.slice(0,n) + '☆☆☆☆☆'.slice(0,5-n); }

  var view = $id('govView');
  var lastUrl = '';

  function open(){ if(view){ view.hidden=false; load(); } }
  function close(){ if(view) view.hidden=true; }

  function cardEl(card){
    var d = el('div','gov-card' + (card.next.who==='you'?' you':'') + (card.inLane?'':' outlane'));
    d.appendChild(el('div','gov-card-title', card.title));
    var meta = el('div','gov-card-meta');
    if(card.agency) meta.appendChild(el('span', null, card.agency));
    if(card.place) meta.appendChild(el('span','gov-dim', card.place));
    if(meta.childNodes.length) d.appendChild(meta);
    var tags = el('div','gov-tags');
    tags.appendChild(el('span','gov-fit', fitStars(card.fit)));
    // Bid Fit Index — deterministic go/no-go badge (a NO-BID is arithmetic, never a verdict).
    if(card.bidFit){
      var bf=card.bidFit, band=(bf.band||'').toLowerCase();
      var chip=el('span','gov-bidfit '+band, bf.verdict + ' ' + bf.score);
      var tip=[bf.note];
      if(bf.disqualified && bf.reasons && bf.reasons.length) tip.push('Why: '+bf.reasons.join('; '));
      if(bf.gates && bf.gates.length) tip.push('⚠️ '+bf.gates.join(' · '));
      chip.title=tip.filter(Boolean).join(' — ');
      tags.appendChild(chip);
    }
    tags.appendChild(el('span','gov-tag' + (card.inLane?'':' bad'), card.setAside + (card.inLane?'':' ⛔')));
    if(card.naics) tags.appendChild(el('span','gov-tag', card.trade + ' · ' + card.naics));
    if(card.deadline) tags.appendChild(el('span','gov-tag due', 'due ' + card.deadline));
    d.appendChild(tags);
    var na = el('div','gov-na' + (card.next.who==='you'?' you':''));
    na.appendChild(el('span','gov-na-who', card.next.who==='you'?'👤 You':'🤖 Jarvis'));
    na.appendChild(el('span','gov-na-text', card.next.text));
    d.appendChild(na);
    var acts = el('div','gov-acts');
    // The one-tap "do it with me" path: walk this opportunity to a submitted proposal, step by step.
    if(card.inLane && card.stage!=='closed' && card.stage!=='submitted' && window.SubmitWizard){
      var wz=el('button','gov-disp gov-wizard','📋 Submit step-by-step');
      wz.addEventListener('click', function(){ window.SubmitWizard.open(card.noticeId); });
      acts.appendChild(wz);
    }
    if(card.url){ var a=el('a','gov-link','SAM ↗'); a.href=card.url; a.target='_blank'; a.rel='noreferrer'; acts.appendChild(a); }
    if(card.stage !== 'closed'){
      [['won','Won'],['lost','Lost'],['passed','Pass']].forEach(function(p){
        var b=el('button','gov-disp',p[1]); b.addEventListener('click', function(){ disposition(card.noticeId, p[0]); }); acts.appendChild(b);
      });
    } else {
      var rb=el('button','gov-disp','Reopen'); rb.addEventListener('click', function(){ disposition(card.noticeId,'reset'); }); acts.appendChild(rb);
    }
    d.appendChild(acts);
    return d;
  }

  function render(b){
    if(!b || b.error){ $id('govBoard').innerHTML=''; $id('govBoard').appendChild(el('div','ops-empty', b&&b.error ? ('Could not load: '+b.error) : 'No data.')); return; }
    // your-next-move banner
    var nx = $id('govNext');
    if(b.yourNextAction){
      nx.hidden=false; nx.innerHTML='';
      nx.appendChild(el('div','gov-next-label','YOUR NEXT MOVE'));
      nx.appendChild(el('div','gov-next-text', b.yourNextAction.text));
      nx.appendChild(el('div','gov-next-sub', b.yourNextAction.title + (b.yourNextAction.deadline ? ' · due '+b.yourNextAction.deadline : '')));
      lastUrl = b.yourNextAction.url || '';
      var walk = el('button','gov-next-walk','▸ Walk me through submitting this');
      walk.addEventListener('click', function(ev){ ev.stopPropagation(); if(window.SubmitWizard) window.SubmitWizard.open(b.yourNextAction.noticeId); });
      nx.appendChild(walk);
      nx.onclick = function(){ if(window.SubmitWizard){ window.SubmitWizard.open(b.yourNextAction.noticeId); } else if(lastUrl){ window.open(lastUrl, '_blank', 'noreferrer'); } };
    } else { nx.hidden=true; }
    var resp = (b.counts && b.counts.responding) || 0;
    $id('govStat').textContent = b.total + ' opportunities · ' + resp + ' awaiting your sign-off';
    // columns
    var board = $id('govBoard'); board.innerHTML='';
    (b.columns||[]).forEach(function(col){
      var c = el('div','gov-col');
      var h = el('div','gov-col-h'); h.appendChild(el('span','gov-col-name', col.label)); h.appendChild(el('span','gov-col-n', col.cards.length)); c.appendChild(h);
      c.appendChild(el('div','gov-col-hint', col.hint));
      var limit = col.key === 'found' ? 8 : 60;
      col.cards.slice(0, limit).forEach(function(card){ c.appendChild(cardEl(card)); });
      if(col.cards.length > limit){
        var more = el('button','gov-more', '+ ' + (col.cards.length - limit) + ' more');
        more.addEventListener('click', function(){ col.cards.slice(limit).forEach(function(card){ c.insertBefore(cardEl(card), more); }); more.remove(); });
        c.appendChild(more);
      }
      if(!col.cards.length) c.appendChild(el('div','gov-col-empty','—'));
      board.appendChild(c);
    });
  }

  var loading=false;
  function load(){
    if(loading) return; loading=true;
    fetch('/api/gov-board').then(function(r){ return r.json(); }).then(render).catch(function(){
      $id('govBoard').innerHTML=''; $id('govBoard').appendChild(el('div','ops-empty','Could not reach the board.'));
    }).then(function(){ loading=false; });
  }

  function disposition(noticeId, stage){
    fetch('/api/gov-board/disposition', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ noticeId:noticeId, stage:stage }) })
      .then(load).catch(function(){});
  }

  // let the wizard refresh the board when it finishes
  window.GovBoard = { reload: function(){ if(view && !view.hidden) load(); } };

  // wiring
  var btn=$id('govBtn'); if(btn) btn.addEventListener('click', open);
  var x=$id('govX'); if(x) x.addEventListener('click', close);
  var rf=$id('govRefresh'); if(rf) rf.addEventListener('click', load);
  var hop=$id('jHomeGovOpen'); if(hop) hop.addEventListener('click', function(e){ e.preventDefault(); open(); });
})();
