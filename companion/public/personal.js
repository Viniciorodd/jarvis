/* personal.js — Personal OS overlay: Notes · Journal · Voice · Todos · People */
(function(){
'use strict';

/* ── helpers ── */
function $(id){ return document.getElementById(id); }
function el(tag,cls,html){ var d=document.createElement(tag); if(cls) d.className=cls; if(html!=null) d.innerHTML=html; return d; }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(iso){ if(!iso) return ''; return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function today(){ return new Date().toISOString().slice(0,10); }
function post(url,body){ return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()); }
function put(url,body){ return fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()); }

/* ── overlay open / close ── */
var overlay = $('personalView');
var body    = $('psBody');
var curTab  = 'notes';
var searchTimer;

function open(tab){
  overlay.removeAttribute('hidden');
  showTab(tab || curTab);
}
function close(){
  overlay.setAttribute('hidden','');
  stopRecording();
}
$('personalX').addEventListener('click', close);
$('jMorePersonal').addEventListener('click', function(){ open('braindump'); });

/* ── search ── */
var searchInput = $('psSearch');
searchInput.addEventListener('input', function(){
  clearTimeout(searchTimer);
  var q = searchInput.value.trim();
  if(!q){ showTab(curTab, true); return; }
  searchTimer = setTimeout(function(){ doSearch(q); }, 350);
});

function doSearch(q){
  body.innerHTML = '<div class="ops-empty">Searching…</div>';
  fetch('/api/knowledge/search?q='+encodeURIComponent(q))
    .then(r=>r.json())
    .then(function(results){
      body.innerHTML = '';
      var wrap = el('div','ps-results');
      var h = el('div','ps-res-h', results.length + ' result' + (results.length===1?'':'s') + ' for "' + esc(q) + '"');
      wrap.appendChild(h);
      if(results.length===0){ wrap.appendChild(el('div','ps-empty','Nothing found.')); }
      results.forEach(function(r){
        var card = el('div','ps-res-item');
        card.appendChild(el('div','ps-res-type', r.type));
        card.appendChild(el('div','ps-res-title', esc(r.title)));
        if(r.preview) card.appendChild(el('div','ps-res-preview', esc(r.preview)));
        card.addEventListener('click', function(){
          searchInput.value = '';
          if(r.type==='note'){ showTab('notes'); setTimeout(function(){ openNote(r.id); },50); }
          else if(r.type==='journal'){ showTab('journal',false,r.id); }
          else if(r.type==='todo'){ showTab('todos'); }
          else if(r.type==='person'){ showTab('people'); }
          else if(r.type==='voice'){ showTab('voice'); }
        });
        wrap.appendChild(card);
      });
      body.appendChild(wrap);
    })
    .catch(function(){ body.innerHTML = '<div class="ps-empty">Search failed.</div>'; });
}

/* ── tab switching ── */
document.querySelectorAll('.ps-tab').forEach(function(btn){
  btn.addEventListener('click', function(){
    showTab(btn.dataset.tab);
  });
});

function showTab(name, skipLoad, extra){
  if(searchInput.value.trim() && !skipLoad) return;
  curTab = name;
  document.querySelectorAll('.ps-tab').forEach(function(b){ b.classList.toggle('on', b.dataset.tab===name); });
  if(name==='braindump') loadBrainDump();
  else if(name==='notes')   loadNotes();
  else if(name==='journal') loadJournal(extra||today());
  else if(name==='voice')   loadVoice();
  else if(name==='todos')   loadTodos('active');
  else if(name==='people')  loadPeople();
}

/* ══════════════════════════════════════════════════════════════
   BRAIN DUMP — dump raw thoughts; the AI sorter files them into the vault
══════════════════════════════════════════════════════════════ */
function loadBrainDump(){
  body.innerHTML = '';
  var wrap = el('div','ps-brain');
  wrap.innerHTML =
    '<div class="ps-brain-h">Brain dump</div>' +
    '<div class="ps-brain-sub">Empty your head. Jarvis sorts each dump into the right place in your second brain.</div>';
  var area = el('textarea','ps-brain-area');
  area.placeholder = 'Type or paste anything — a thought, a meeting, an idea, a person, a to-do…';
  wrap.appendChild(area);
  var actions = el('div','ps-brain-acts');
  var sortBtn = el('button','ps-btn','Sort it →');
  var status = el('div','ps-brain-status','');
  actions.appendChild(sortBtn); actions.appendChild(status);
  wrap.appendChild(actions);
  var feed = el('div','ps-brain-feed'); feed.id = 'psBrainFeed';
  wrap.appendChild(feed);
  body.appendChild(wrap);
  area.focus();

  function submit(){
    var text = area.value.trim();
    if(!text){ return; }
    sortBtn.disabled = true; status.textContent = 'sorting…';
    fetch('/api/knowledge/braindump',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text})})
      .then(function(r){ return r.json(); })
      .then(function(d){
        sortBtn.disabled = false;
        if(d.ok && d.filed){
          area.value = '';
          status.textContent = '';
          var card = el('div','ps-brain-filed');
          card.innerHTML = '<span class="ps-brain-folder">'+esc(d.filed.folder)+'</span> '+esc(d.filed.title)+
            '<span class="ps-brain-path">'+esc(d.filed.file)+'</span>';
          feed.insertBefore(card, feed.firstChild);
        } else {
          status.textContent = 'error: '+esc(d.error||'failed');
        }
      })
      .catch(function(){ sortBtn.disabled=false; status.textContent='network error'; });
  }
  sortBtn.addEventListener('click', submit);
  area.addEventListener('keydown', function(e){ if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); submit(); } });
}

/* ══════════════════════════════════════════════════════════════
   NOTES
══════════════════════════════════════════════════════════════ */
function loadNotes(){
  body.innerHTML = '<div class="ops-empty">Loading…</div>';
  fetch('/api/knowledge/notes').then(r=>r.json()).then(function(notes){
    body.innerHTML = '';
    var head = el('div','ps-list-head');
    var h = el('div','ps-list-h','Notes ('+notes.length+')');
    var btn = el('button','ps-btn ps-btn-sm','+ New');
    btn.addEventListener('click', function(){ openNote(null); });
    head.appendChild(h); head.appendChild(btn);
    body.appendChild(head);
    if(notes.length===0){ body.appendChild(el('div','ps-empty','No notes yet. Tap + New to start.')); return; }
    notes.forEach(function(n){
      var card = el('div','ps-note-card');
      card.appendChild(el('div','ps-note-title', esc(n.title)));
      card.appendChild(el('div','ps-note-meta', fmt(n.date) + (n.tags?' · '+esc(n.tags):'')));
      if(n.preview) card.appendChild(el('div','ps-note-preview', esc(n.preview)));
      card.addEventListener('click', function(){ openNote(n.id); });
      body.appendChild(card);
    });
  }).catch(function(){ body.innerHTML='<div class="ps-empty">Could not load notes.</div>'; });
}

var saveTimer;
function openNote(id){
  var isNew = !id;
  var noteData = null;
  body.innerHTML = '<div class="ops-empty">Loading…</div>';
  var load = isNew
    ? Promise.resolve({id:null,title:'',body:'',tags:''})
    : fetch('/api/knowledge/notes/'+id).then(r=>r.json());
  load.then(function(note){
    noteData = note;
    body.innerHTML = '';
    var view = el('div','ps-editor-view');
    var head = el('div','ps-editor-head');
    var back = el('button','ps-back','←');
    back.addEventListener('click', function(){ clearTimeout(saveTimer); loadNotes(); });
    var titleIn = el('input','ps-title-input'); titleIn.placeholder='Note title…'; titleIn.value=note.title||'';
    head.appendChild(back); head.appendChild(titleIn);
    var tagsIn = el('input','ps-tags-input'); tagsIn.placeholder='tags (gov idea lesson…)'; tagsIn.value=note.tags||'';
    var bodyIn = el('textarea','ps-editor'); bodyIn.placeholder='Start writing…'; bodyIn.value=note.body||'';
    var status = el('div','ps-autosave','');
    view.appendChild(head); view.appendChild(tagsIn); view.appendChild(bodyIn); view.appendChild(status);
    body.appendChild(view);
    bodyIn.focus();
    function schedSave(){
      clearTimeout(saveTimer);
      status.textContent = 'unsaved…';
      saveTimer = setTimeout(function(){
        var payload = {title:titleIn.value.trim()||'Untitled', body:bodyIn.value, tags:tagsIn.value.trim()};
        if(!noteData.id){
          post('/api/knowledge/notes',payload).then(function(r){
            if(r.ok){ noteData.id=r.id; status.textContent='saved'; }
          });
        } else {
          put('/api/knowledge/notes/'+noteData.id,payload).then(function(r){
            if(r.ok) status.textContent='saved '+new Date().toLocaleTimeString();
          });
        }
      }, 2000);
    }
    [titleIn,tagsIn,bodyIn].forEach(function(el){ el.addEventListener('input', schedSave); });
  }).catch(function(){ body.innerHTML='<div class="ps-empty">Could not load note.</div>'; });
}

/* ══════════════════════════════════════════════════════════════
   JOURNAL
══════════════════════════════════════════════════════════════ */
var jDate = today();
var jSaveTimer;

function loadJournal(date){
  jDate = date || today();
  body.innerHTML = '<div class="ops-empty">Loading…</div>';
  fetch('/api/knowledge/journal/'+jDate).then(r=>r.json()).then(function(data){
    body.innerHTML = '';
    var jHead = el('div','ps-journal-head');
    var prev = el('button','ps-j-nav','‹');
    prev.title='Previous day';
    prev.addEventListener('click',function(){
      var d=new Date(jDate); d.setDate(d.getDate()-1); loadJournal(d.toISOString().slice(0,10));
    });
    var next = el('button','ps-j-nav','›');
    next.title='Next day';
    next.addEventListener('click',function(){
      var d=new Date(jDate); d.setDate(d.getDate()+1); loadJournal(d.toISOString().slice(0,10));
    });
    var label = el('div','ps-j-date', new Date(jDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}));
    jHead.appendChild(prev); jHead.appendChild(label); jHead.appendChild(next);
    body.appendChild(jHead);

    var jStat = el('div','ps-autosave','');
    body.appendChild(jStat);

    var area = el('textarea','ps-j-area');
    area.placeholder='Your thoughts for the day…';
    area.value = data.body||'';
    body.appendChild(area);
    area.focus();

    area.addEventListener('input', function(){
      clearTimeout(jSaveTimer);
      jStat.textContent='unsaved…';
      jSaveTimer = setTimeout(function(){
        put('/api/knowledge/journal/'+jDate,{body:area.value}).then(function(r){
          if(r.ok) jStat.textContent='saved '+new Date().toLocaleTimeString();
        });
      }, 2000);
    });
  }).catch(function(){ body.innerHTML='<div class="ps-empty">Could not load journal.</div>'; });
}

/* ══════════════════════════════════════════════════════════════
   VOICE
══════════════════════════════════════════════════════════════ */
var mediaRecorder = null, audioChunks = [], recStart = null, recTimer;

function stopRecording(){ if(mediaRecorder && mediaRecorder.state!=='inactive'){ mediaRecorder.stop(); } }

function loadVoice(){
  body.innerHTML = '';

  /* recorder section */
  var recSection = el('div','ps-recorder');
  var recBtn = el('button','ps-rec-btn','🎙');
  var timer = el('div','ps-rec-timer','0:00');
  var status = el('div','ps-rec-status','tap to record');
  recSection.appendChild(recBtn); recSection.appendChild(timer); recSection.appendChild(status);
  body.appendChild(recSection);

  recBtn.addEventListener('click', function(){
    if(mediaRecorder && mediaRecorder.state==='recording'){
      clearInterval(recTimer);
      mediaRecorder.stop();
    } else {
      navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = function(e){ if(e.data.size>0) audioChunks.push(e.data); };
        mediaRecorder.onstop = function(){
          stream.getTracks().forEach(t=>t.stop());
          var blob = new Blob(audioChunks, {type:'audio/webm'});
          var dur = recStart ? Math.round((Date.now()-recStart)/1000)+'s' : '';
          recBtn.className='ps-rec-btn';
          timer.textContent='0:00';
          status.textContent='transcribing…';
          recBtn.textContent='🎙';
          fetch('/api/knowledge/voice', {
            method:'POST', body:blob,
            headers:{'Content-Type':'audio/webm','x-duration':dur}
          }).then(r=>r.json()).then(function(d){
            status.textContent = d.ok ? 'saved & transcribed' : ('error: '+d.error);
            loadVoiceMemos();
          }).catch(function(){ status.textContent='upload failed'; });
        };
        recStart = Date.now();
        mediaRecorder.start();
        recBtn.className='ps-rec-btn recording';
        recBtn.textContent='⏹';
        status.textContent='recording…';
        recTimer = setInterval(function(){
          var s=Math.round((Date.now()-recStart)/1000);
          timer.textContent=Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);
        }, 500);
      }).catch(function(){ status.textContent='microphone access denied'; });
    }
  });

  /* memo list */
  var listWrap = el('div',''); listWrap.id='psVoiceList';
  body.appendChild(listWrap);
  loadVoiceMemos(listWrap);
}

function loadVoiceMemos(container){
  var wrap = container || $('psVoiceList');
  if(!wrap) return;
  wrap.innerHTML = '<div class="ops-empty">Loading…</div>';
  fetch('/api/knowledge/voice').then(r=>r.json()).then(function(memos){
    wrap.innerHTML='';
    if(memos.length===0){ wrap.appendChild(el('div','ps-empty','No voice memos yet.')); return; }
    var h = el('div','ps-list-h','Recent memos ('+memos.length+')');
    h.style.marginBottom='10px';
    wrap.appendChild(h);
    memos.forEach(function(m){
      var card = el('div','ps-memo-card');
      var dateStr = m.date ? new Date(m.date).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      card.appendChild(el('div','ps-memo-date', dateStr+(m.duration?' · '+m.duration:'')));
      card.appendChild(el('div', m.transcript?'ps-memo-text':'ps-memo-pending', esc(m.transcript||'(no transcript)')));
      wrap.appendChild(card);
    });
  }).catch(function(){ if(wrap) wrap.innerHTML='<div class="ps-empty">Could not load memos.</div>'; });
}

/* ══════════════════════════════════════════════════════════════
   TODOS
══════════════════════════════════════════════════════════════ */
var todoFilter = 'active';

function loadTodos(filter){
  todoFilter = filter || 'active';
  body.innerHTML = '';

  /* add input */
  var row = el('div','ps-todo-input-row');
  var inp = el('input','ps-todo-in'); inp.placeholder='Add a task…';
  var addBtn = el('button','ps-btn ps-btn-sm','Add');
  function addTodo(){
    var title=inp.value.trim(); if(!title) return;
    inp.value='';
    post('/api/knowledge/todos',{title:title}).then(function(r){
      if(r.ok) loadTodos(todoFilter);
    });
  }
  addBtn.addEventListener('click',addTodo);
  inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); addTodo(); } });
  row.appendChild(inp); row.appendChild(addBtn);
  body.appendChild(row);

  /* filters */
  var filters = el('div','ps-todo-filters');
  ['all','active','done'].forEach(function(f){
    var btn=el('button','ps-filter-btn'+(todoFilter===f?' on':''),f);
    btn.addEventListener('click',function(){ loadTodos(f); });
    filters.appendChild(btn);
  });
  body.appendChild(filters);

  /* list */
  fetch('/api/knowledge/todos').then(r=>r.json()).then(function(todos){
    var shown = todoFilter==='all' ? todos : todoFilter==='done' ? todos.filter(t=>t.done) : todos.filter(t=>!t.done);
    if(shown.length===0){ body.appendChild(el('div','ps-empty',todoFilter==='done'?'No completed tasks.':'No open tasks.')); return; }
    var list = el('div','');
    shown.forEach(function(todo){
      var item = el('div','ps-todo-item'+(todo.done?' ps-todo-done':''));
      var cb = el('input','ps-todo-cb');
      cb.type='checkbox'; cb.checked=todo.done;
      cb.addEventListener('change',function(){
        put('/api/knowledge/todos/'+todo.id,{done:cb.checked}).then(function(){ loadTodos(todoFilter); });
      });
      var textWrap = el('div','');
      textWrap.appendChild(el('div','ps-todo-text',esc(todo.title)));
      if(todo.pod) textWrap.appendChild(el('div','ps-todo-pod',todo.pod+(todo.due?' · due '+todo.due:'')));
      var del = el('button','ps-todo-del','×');
      del.title='Delete'; del.addEventListener('click',function(){
        fetch('/api/knowledge/todos/'+todo.id,{method:'DELETE'}).then(function(){ loadTodos(todoFilter); });
      });
      item.appendChild(cb); item.appendChild(textWrap); item.appendChild(del);
      list.appendChild(item);
    });
    body.appendChild(list);
  }).catch(function(){ body.appendChild(el('div','ps-empty','Could not load todos.')); });
}

/* ══════════════════════════════════════════════════════════════
   PEOPLE
══════════════════════════════════════════════════════════════ */
function loadPeople(){
  body.innerHTML = '<div class="ops-empty">Loading…</div>';
  fetch('/api/knowledge/people').then(r=>r.json()).then(function(people){
    body.innerHTML = '';

    /* add form (collapsed by default) */
    var addBtn = el('button','ps-btn ps-btn-sm','+ Add person');
    var addForm = el('div','ps-add-form'); addForm.style.display='none';
    var nameIn = el('input','ps-field'); nameIn.placeholder='Name *';
    var roleIn = el('input','ps-field'); roleIn.placeholder='Role / relationship';
    var notesIn = el('textarea','ps-field'); notesIn.placeholder='Notes…'; notesIn.rows=3; notesIn.style.resize='vertical';
    var saveBtn = el('button','ps-btn','Save');
    addForm.appendChild(nameIn); addForm.appendChild(roleIn); addForm.appendChild(notesIn); addForm.appendChild(saveBtn);
    var listHead = el('div','ps-list-head');
    var h = el('div','ps-list-h','People ('+people.length+')');
    listHead.appendChild(h); listHead.appendChild(addBtn);
    body.appendChild(listHead); body.appendChild(addForm);

    addBtn.addEventListener('click',function(){
      addForm.style.display = addForm.style.display==='none' ? '' : 'none';
      if(addForm.style.display!=='none') nameIn.focus();
    });
    saveBtn.addEventListener('click',function(){
      if(!nameIn.value.trim()) return;
      post('/api/knowledge/people',{name:nameIn.value.trim(),role:roleIn.value.trim(),notes:notesIn.value.trim()}).then(function(r){
        if(r.ok) loadPeople();
      });
    });

    if(people.length===0){ body.appendChild(el('div','ps-empty','No people yet.')); return; }
    people.forEach(function(p){
      var card = el('div','ps-person-card');
      var av = el('div','ps-person-av', esc((p.name||'?').charAt(0).toUpperCase()));
      var info = el('div','');
      info.appendChild(el('div','ps-person-name',esc(p.name)));
      if(p.role) info.appendChild(el('div','ps-person-role',esc(p.role)));
      var contact = el('div','ps-person-contact','');
      if(p.lastContact) contact.textContent = fmt(p.lastContact);
      card.appendChild(av); card.appendChild(info); card.appendChild(contact);
      body.appendChild(card);
    });
  }).catch(function(){ body.innerHTML='<div class="ps-empty">Could not load people.</div>'; });
}

})();
