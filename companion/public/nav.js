/* nav.js — bottom nav + view switching */

(function(){

var views = {
  home: document.getElementById('jHomeView'),
  today: document.getElementById('jTodayView'),
  talk: document.getElementById('jTalkView'),
  more: document.getElementById('jMoreView')
};

var navBtns = {
  home: document.getElementById('jNavHome'),
  today: document.getElementById('jNavToday'),
  talk: document.getElementById('jNavTalk'),
  ops:  document.getElementById('jNavOps'),
  more: document.getElementById('jNavMore')
};

var currentView = 'home';

/* ── every full-screen overlay. One place so the bottom nav can always close them ── */
var OVERLAY_IDS = ['bizView','ops','mapView','floorView','commandView','activityView','hqView','settingsView','personalView','govView','taxReviewView'];
function closeAllOverlays(){
  OVERLAY_IDS.forEach(function(id){ var o = document.getElementById(id); if(o && !o.hidden) o.hidden = true; });
}

/* ── switch inline view (also drops you out of any overlay, so a tab is always an exit) ── */
function showView(name){
  closeAllOverlays();
  Object.keys(views).forEach(function(k){
    var v = views[k];
    if(!v) return;
    if(k === name){
      v.classList.add('active');
    } else {
      v.classList.remove('active');
    }
  });
  Object.keys(navBtns).forEach(function(k){
    var b = navBtns[k];
    if(!b) return;
    b.classList.toggle('active', k === name);
  });
  currentView = name;
}

/* ── trigger ghost button for overlay views (only one overlay open at a time) ── */
function triggerGhost(id){
  closeAllOverlays();
  var btn = document.getElementById(id);
  if(btn) btn.click();
}

/* ── bottom nav wiring ── */
if(navBtns.home){
  navBtns.home.addEventListener('click', function(){ showView('home'); });
}

if(navBtns.today){
  navBtns.today.addEventListener('click', function(){ showView('today'); });
}

if(navBtns.talk){
  navBtns.talk.addEventListener('click', function(){
    showView('talk');
    /* fire resize so the orb canvas re-measures after the view becomes display:flex */
    setTimeout(function(){
      window.dispatchEvent(new Event('resize'));
      var inp = document.getElementById('input');
      if(inp) inp.focus();
    }, 50);
  });
}

if(navBtns.ops){
  navBtns.ops.addEventListener('click', function(){
    triggerGhost('bizBtn'); /* the Businesses hub is the new Ops default; old Ops is reachable from inside it */
  });
}

if(navBtns.more){
  navBtns.more.addEventListener('click', function(){ showView('more'); });
}

/* ── More menu items ── */
var moreItems = {
  /* Gov Pipeline + Ops gov + GovCon merged into ONE surface (2026-07-05): everything gov → /govcon */
  jMoreGovcon:  function(){ window.location.href = '/govcon'; },
  jMoreIdeas:   function(){ window.location.href = '/ideas'; },  /* proactive vault idea-miner inbox */
  jMoreFocus:   function(){ window.location.href = '/focus'; },  /* Forest replacement — time/focus dashboard */
  jMoreQuickwins: function(){ window.location.href = '/quickwins'; },  /* wide-net one-off/quick jobs */
  jMoreCapability: function(){ window.open('/capability', '_blank'); },  /* 1-page capability statement → print-to-PDF */
  jMoreMap:     function(){ triggerGhost('mapBtn'); },
  jMoreFloor:   function(){ triggerGhost('floorBtn'); },
  jMoreHQ:      function(){ triggerGhost('hqBtn'); },
  jMoreCommand: function(){ triggerGhost('commandBtn'); },
  jMoreActivity:function(){ triggerGhost('activityBtn'); }
};

Object.keys(moreItems).forEach(function(id){
  var btn = document.getElementById(id);
  if(btn) btn.addEventListener('click', moreItems[id]);
});

/* ── Composer bar always sends to Talk view ── */
var composer = document.getElementById('composer');
if(composer){
  composer.addEventListener('submit', function(){
    /* if user submits from Home or More, switch to Talk so they see response */
    if(currentView !== 'talk'){
      showView('talk');
      /* update nav active state too */
      Object.keys(navBtns).forEach(function(k){
        if(navBtns[k]) navBtns[k].classList.toggle('active', k === 'talk');
      });
    }
  }, true); /* capture phase so this fires before app.js submit handler */
}

/* ── mic button: also switch to talk ── */
var mic = document.getElementById('mic');
if(mic){
  mic.addEventListener('click', function(){
    if(currentView !== 'talk') showView('talk');
  }, true);
}

/* ── Escape always backs you out of any overlay (consistent exit everywhere) ── */
document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeAllOverlays(); });

/* ── Start on Talk (voice-first home): orb + today's to-dos + recent activity ── */
showView('talk');
setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 60); /* let the orb canvas measure */

})();
