/* nav.js — bottom nav + view switching */

(function(){

var views = {
  home: document.getElementById('jHomeView'),
  talk: document.getElementById('jTalkView'),
  more: document.getElementById('jMoreView')
};

var navBtns = {
  home: document.getElementById('jNavHome'),
  talk: document.getElementById('jNavTalk'),
  ops:  document.getElementById('jNavOps'),
  more: document.getElementById('jNavMore')
};

var currentView = 'home';

/* ── switch inline view ── */
function showView(name){
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

/* ── trigger ghost button for overlay views ── */
function triggerGhost(id){
  var btn = document.getElementById(id);
  if(btn) btn.click();
}

/* ── bottom nav wiring ── */
if(navBtns.home){
  navBtns.home.addEventListener('click', function(){ showView('home'); });
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
    triggerGhost('opsBtn');
  });
}

if(navBtns.more){
  navBtns.more.addEventListener('click', function(){ showView('more'); });
}

/* ── More menu items ── */
var moreItems = {
  jMoreMap:     function(){ triggerGhost('mapBtn'); },
  jMoreFloor:   function(){ triggerGhost('floorBtn'); },
  jMoreHQ:      function(){ triggerGhost('hqBtn'); },
  jMoreCommand: function(){ triggerGhost('commandBtn'); },
  jMoreActivity:function(){ triggerGhost('activityBtn'); },
  jMoreDash:    function(){ triggerGhost('dashBtn'); }
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

/* ── Start on home ── */
showView('home');

})();
