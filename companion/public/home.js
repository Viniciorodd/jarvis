/* home.js — loads action cards + gov pipeline for the Home view */

(function(){

/* ── helpers ── */
function el(tag, cls, inner){
  var d = document.createElement(tag);
  if(cls) d.className = cls;
  if(inner != null) d.innerHTML = inner;
  return d;
}

function qs(sel){ return document.querySelector(sel); }
function qid(id){ return document.getElementById(id); }

/* ── greeting ── */
function updateHeroSub(urgentCount){
  var sub = qs('#jHomeView .j-hero-sub');
  if(!sub) return;
  if(urgentCount === 0){
    sub.textContent = 'All clear — nothing needs you right now.';
  } else if(urgentCount === 1){
    sub.textContent = '1 item needs your attention.';
  } else {
    sub.textContent = urgentCount + ' items need your attention.';
  }
}

/* ── action cards ── */
function renderCards(items){
  var container = qid('jNeedsCards');
  if(!container) return;
  container.innerHTML = '';

  var section = qid('jNeedsSection');
  var badge = qid('jNeedsCount');

  if(!items || items.length === 0){
    if(section) section.style.display = 'none';
    if(badge) badge.textContent = '';
    updateHeroSub(0);
    return;
  }

  if(section) section.style.display = '';
  if(badge) badge.textContent = items.length;

  updateHeroSub(items.length);

  items.forEach(function(item){
    var card = el('div','j-action-card');

    var roomEl = el('div','j-card-room', item.pod || item.source || 'JARVIS');
    var titleEl = el('div','j-card-title', escHtml(item.subject || item.title || 'Untitled'));
    var metaEl = el('div','j-card-meta', escHtml(item.preview || item.body || ''));

    var btns = el('div','j-card-btns');
    var approve = el('button','j-btn-approve','Approve');
    var pass = el('button','j-btn-pass','Pass');

    approve.addEventListener('click', function(){
      handleAction(item, 'approve', card);
    });
    pass.addEventListener('click', function(){
      handleAction(item, 'pass', card);
    });

    btns.appendChild(approve);
    btns.appendChild(pass);
    card.appendChild(roomEl);
    card.appendChild(titleEl);
    card.appendChild(metaEl);
    card.appendChild(btns);
    container.appendChild(card);
  });
}

function handleAction(item, action, card){
  /* optimistic: dismiss immediately — don't make user wait for backend timeout */
  card.style.transition = 'max-height .25s, opacity .25s, margin .25s, padding .25s';
  card.style.maxHeight = card.offsetHeight + 'px';
  card.style.overflow = 'hidden';
  requestAnimationFrame(function(){
    card.style.maxHeight = '0';
    card.style.opacity = '0';
    card.style.marginBottom = '0';
    card.style.padding = '0';
  });
  setTimeout(function(){
    if(card.parentNode) card.remove();
    var container = qid('jNeedsCards');
    var remaining = container ? container.querySelectorAll('.j-action-card') : [];
    if(!remaining.length){
      renderCards([]);
    } else {
      /* update badge + hero sub with new count */
      var badge = qid('jNeedsCount');
      if(badge) badge.textContent = remaining.length;
      updateHeroSub(remaining.length);
    }
  }, 270);

  /* fire backend silently — control plane may be offline, that's OK */
  var webhookId = item.webhookId || item.id || '';
  if(webhookId){
    fetch('/api/approve', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: webhookId, decision: action === 'approve' ? 'approve' : 'reject' })
    }).catch(function(){}); /* intentionally silent */
  }
}

/* ── pipeline ── */
var STAGE_ORDER = ['Identify','Scout','Qualify','Proposal','Submitted','Award'];

function stageHot(stage){
  var hot = ['Proposal','Submitted'];
  return hot.indexOf(stage) >= 0;
}

function renderPipeline(ops){
  var container = qid('jGovPipe');
  if(!container) return;
  container.innerHTML = '';

  if(!ops || ops.length === 0){
    container.appendChild(el('div','j-pipe-empty','No active opportunities tracked.'));
    return;
  }

  ops.forEach(function(op){
    var row = el('div','j-pipe-row');
    var dot = el('div','j-pipe-dot' + (op.hot?' hot':''));
    var name = el('div','j-pipe-name', escHtml(op.title || op.name || 'Opportunity'));
    var type = el('div','j-pipe-type', escHtml(op.naics || op.type || ''));
    var status = el('div','j-pipe-status', escHtml(op.stage || '—'));
    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(type);
    row.appendChild(status);
    container.appendChild(row);
  });
}

/* ── fetch dashboard ── */
function loadHome(){
  fetch('/api/dashboard')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if(!data) return renderCards([]);
      var urgent = data.urgent || [];
      var approvals = (data.approvals || []).filter(function(a){ return a.status === 'pending'; });
      renderCards(urgent.concat(approvals));
      renderFeed(data);
    })
    .catch(function(){ renderCards([]); })
    .then(function(){ loadRevivedIdea(); }); /* after the cards settle, so a refresh never wipes the idea card */
}

/* ── revived idea (idea vault) — ONE calm card for the single stalest idea that's gone quiet ── */
function loadRevivedIdea(){
  try {
    fetch('/api/ideas-vault')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){
        if(!data || !data.due || !data.due.length) return;
        renderRevivedIdea(data.due[0]); /* queue arrives stalest-first */
      })
      .catch(function(){}); /* vault offline → Home stays calm */
  } catch(e){ /* never let the vault break Home */ }
}

function renderRevivedIdea(idea){
  var container = qid('jNeedsCards');
  if(!container || !idea || !idea.id) return;

  /* one card only — a refresh replaces any previous revived-idea card */
  var old = container.querySelector('.j-idea-card');
  if(old) old.remove();

  var card = el('div','j-action-card j-idea-card');
  var days = Math.max(0, Math.round(Number(idea.staleDays) || 0));
  card.appendChild(el('div','j-card-room','IDEA VAULT'));
  card.appendChild(el('div','j-card-title','💡 Revived idea ('+ days +'d quiet): ' + escHtml(idea.title || '')));
  card.appendChild(el('div','j-card-meta', escHtml(idea.detail || '')));

  var btns = el('div','j-card-btns');
  function ideaBtn(label, cls, body){
    var b = el('button', cls, label);
    b.addEventListener('click', function(){
      dismissIdeaCard(card);
      body.id = idea.id;
      fetch('/api/ideas-vault/touch', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      }).catch(function(){}); /* intentionally silent */
    });
    return b;
  }
  btns.appendChild(ideaBtn('Keep alive','j-btn-approve',{ note:'revived from Home' }));
  btns.appendChild(ideaBtn('Park','j-btn-pass',{ status:'parked', note:'parked from Home' }));
  btns.appendChild(ideaBtn('Done','j-btn-pass',{ status:'done', note:'done from Home' }));
  card.appendChild(btns);
  container.appendChild(card);

  /* the card counts as something needing you — unhide the section + fix the counts */
  var section = qid('jNeedsSection');
  if(section) section.style.display = '';
  var count = container.querySelectorAll('.j-action-card').length;
  var badge = qid('jNeedsCount');
  if(badge) badge.textContent = count;
  updateHeroSub(count);
}

function dismissIdeaCard(card){
  /* same optimistic collapse as handleAction — dismiss now, POST in the background */
  card.style.transition = 'max-height .25s, opacity .25s, margin .25s, padding .25s';
  card.style.maxHeight = card.offsetHeight + 'px';
  card.style.overflow = 'hidden';
  requestAnimationFrame(function(){
    card.style.maxHeight = '0';
    card.style.opacity = '0';
    card.style.marginBottom = '0';
    card.style.padding = '0';
  });
  setTimeout(function(){
    if(card.parentNode) card.remove();
    var container = qid('jNeedsCards');
    var remaining = container ? container.querySelectorAll('.j-action-card').length : 0;
    if(!remaining){
      renderCards([]);
    } else {
      var badge = qid('jNeedsCount');
      if(badge) badge.textContent = remaining;
      updateHeroSub(remaining);
    }
  }, 270);
}

/* ── recent activity feed ── */
function renderFeed(data){
  var section = qid('jFeedSection');
  if(!section) return;
  var container = qid('jFeedList');
  if(!container) return;
  container.innerHTML = '';

  var items = [];

  /* emails */
  (data.emails || []).slice(0,3).forEach(function(e){
    items.push({ icon:'📨', label:'EMAIL', text: e.subject || e.from || String(e) });
  });
  /* tasks */
  (data.tasks || []).slice(0,3).forEach(function(t){
    items.push({ icon:'✓', label:'TASK', text: t.title || String(t) });
  });
  /* HQ feed */
  var feed = (data.hq && data.hq.feed) ? data.hq.feed : [];
  feed.slice(0,5).forEach(function(f){
    items.push({ icon:'⬡', label:'HQ', text: String(f) });
  });
  /* HQ approvals waiting */
  var hqApprovals = (data.hq && data.hq.approvals) ? data.hq.approvals : [];
  hqApprovals.slice(0,2).forEach(function(a){
    items.push({ icon:'⚑', label:'APPROVAL', text: String(a) });
  });

  if(!items.length){
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  items.forEach(function(item){
    var row = el('div','j-feed-row');
    var label = el('span','j-feed-label', item.label);
    var text = el('span','j-feed-text', escHtml(item.text));
    row.appendChild(label);
    row.appendChild(text);
    container.appendChild(row);
  });
}

/* ── fetch operations for gov pipeline ── */
function loadPipeline(){
  fetch('/api/operations')
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(data){
      if(!data) return renderPipeline([]);
      /* response: { leads, opportunities, proposals, crm } */
      var opps = data.opportunities || [];
      /* map to pipeline display format, sorted by score desc */
      var rows = opps.sort(function(a,b){ return (b.score||0)-(a.score||0); })
        .slice(0,6)
        .map(function(op){
          var stage = op.proposalFile ? 'Proposal Ready' : (op.recommendation === 'bid' ? 'Evaluating' : 'Identified');
          return {
            title: op.title,
            type: op.agency ? op.agency.replace(/DEPT\s+OF\s+/i,'').slice(0,16) : '',
            stage: stage,
            hot: !!op.proposalFile
          };
        });
      renderPipeline(rows);
    })
    .catch(function(){ renderPipeline([]); });
}

/* ── XSS guard ── */
function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── boot ── */
loadHome();
loadPipeline();

/* refresh every 90 seconds */
setInterval(function(){
  loadHome();
  loadPipeline();
}, 90000);

})();
