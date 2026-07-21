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
  jMoreTeaming: function(){ window.location.href = '/teaming'; },  /* primes who need small-biz subs */
  jMoreCapability: function(){ window.open('/capability', '_blank'); },  /* 1-page capability statement → print-to-PDF */
  jMoreLend:    function(){ window.location.href = '/lendability'; },  /* Victor's business-credit & lendability desk */
  /* The redesign (U1/U4, 2026-07-17): ONE gov system + ONE money desk. These supersede the scattered
     pages above; the old ones stay reachable until U2 ports the last of their unique panels. */
  jMoreGovconOs: function(){ window.location.href = '/govcon-os'; },
  jMoreFinances: function(){ window.location.href = '/finances'; },
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

/* ── Collapsible desktop rail (2026-07-18) — operator: "the panel is in the way and I can't close it".
   A ☰ button at the top of the rail hides it (content reclaims the width); tap again to bring it back.
   Desktop-only (CSS hides #railToggle on mobile, where the bottom bar stays). Remembered across loads. ── */
(function(){
  var nav = document.getElementById('jNav'); if(!nav) return;
  var t = document.createElement('button');
  t.id = 'railToggle'; t.type = 'button'; t.setAttribute('aria-label','Hide or show the menu'); t.title = 'Hide / show the menu';
  t.innerHTML = '<i class="ti ti-menu-2" aria-hidden="true"></i>';
  nav.insertBefore(t, nav.firstChild);
  function apply(){ document.documentElement.classList.toggle('rail-collapsed', localStorage.getItem('jarvis-rail') === 'collapsed'); }
  t.addEventListener('click', function(){
    var collapsed = localStorage.getItem('jarvis-rail') === 'collapsed';
    try { localStorage.setItem('jarvis-rail', collapsed ? 'open' : 'collapsed'); } catch(e){}
    apply();
  });
  apply();
})();

/* ── Left nav drawer (2026-07-20): ONE flat, toggleable menu with every destination. Each item delegates
   to its existing nav button (.click()) so ALL routing logic is reused — no navigation is re-implemented.
   Replaces the bottom-bar + "More" drill-down at every screen size. ── */
(function(){
  var burger = document.getElementById('jBurger');
  var drawer = document.getElementById('jDrawer');
  var backdrop = document.getElementById('jDrawerBackdrop');
  if(!burger || !drawer || !backdrop) return;
  function openD(){ drawer.classList.add('open'); backdrop.hidden = false; requestAnimationFrame(function(){ backdrop.classList.add('show'); }); document.documentElement.classList.add('drawer-open'); }
  function closeD(){ drawer.classList.remove('open'); backdrop.classList.remove('show'); document.documentElement.classList.remove('drawer-open'); setTimeout(function(){ backdrop.hidden = true; }, 220); }
  burger.addEventListener('click', function(){ drawer.classList.contains('open') ? closeD() : openD(); });
  backdrop.addEventListener('click', closeD);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeD(); });
  var items = drawer.querySelectorAll('.j-drawer-item');
  items.forEach(function(item){
    item.addEventListener('click', function(){
      var target = document.getElementById(item.getAttribute('data-nav'));
      items.forEach(function(b){ b.classList.remove('active'); });
      item.classList.add('active');
      closeD();
      if(target) setTimeout(function(){ target.click(); }, 70); /* let the drawer close first */
    });
  });
  var home = drawer.querySelector('[data-nav="jNavHome"]'); if(home) home.classList.add('active');
})();

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

/* ── Start on HOME — the calm glance (fixed 2026-07-17). We used to land on Talk, which meant the
   ONE THING, the approvals ticker and today's tasks were all one tap AWAY from the front door, and
   jNavHome carried class="active" while a different view was showing (the nav lied on every load).
   Home is the doctrine's front door: lead with the ONE thing + who's next. Talk is one tap away. ── */
showView('home');
setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 60); /* let the orb canvas measure */

})();
