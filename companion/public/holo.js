/* holo.js — the holographic workspace. Jarvis MATERIALISES things; you grab them.
 *
 * Operator, 2026-08-01: "Jarvis should be an operating system — you can drag things, drag files, open files,
 * visualize everything, open images, videos, browse... Right now it's just bringing the data to the chat and
 * reading it to me like it's Claude or ChatGPT. We're not building what we actually wanna build. Do you know
 * how Jarvis pops up information in a hologram? That's what we want."
 *
 * He is right, and it is a fair hit on everything before this. A chat that recites data is a chatbot with
 * tools. This is the layer that was missing: a canvas over the whole app where a note, an image, a table, a
 * board or a live page appears as a PANEL — draggable, resizable, focusable, closable, and drivable by voice
 * and by hand.
 *
 * Two rules this must not break:
 *   1. EVERY panel shows REAL data, from the same endpoints the rest of Jarvis reads. A hologram of invented
 *      numbers is the confabulation problem with better lighting.
 *   2. Voice and gesture drive it, but the mouse ALWAYS works. His words: "at the moment Jarvis is not very
 *      cooperative" — so the manual path is never the thing that breaks.
 *
 * window.HOLO.open({ kind, title, ... }) is the one entry point; everything else is chrome.
 */
'use strict';
(function () {
  var layer = null, z = 40, panels = [];

  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function ensureLayer() {
    if (layer) return layer;
    layer = el('div', 'holo-layer'); layer.id = 'holoLayer';
    document.body.appendChild(layer);
    return layer;
  }

  // Stagger, so a second panel never lands exactly on the first and looks like nothing happened.
  function nextPos(w, h) {
    var n = panels.length;
    return {
      x: Math.max(12, Math.min(window.innerWidth - w - 12, 70 + (n % 4) * 36)),
      y: Math.max(12, Math.min(window.innerHeight - h - 12, 80 + (n % 4) * 32)),
    };
  }

  function focus(p) {
    p.node.style.zIndex = ++z;
    panels.forEach(function (q) { q.node.classList.toggle('focused', q === p); });
  }

  function close(p) {
    p.node.classList.add('closing');
    setTimeout(function () { if (p.node.parentNode) p.node.parentNode.removeChild(p.node); }, 200);
    panels = panels.filter(function (q) { return q !== p; });
  }

  function drag(p, handle) {
    var sx, sy, ox, oy, moving = false;
    function down(e) {
      if (e.target.closest('.holo-btn')) return;              // buttons are not a drag handle
      moving = true; focus(p);
      var pt = e.touches ? e.touches[0] : e;
      sx = pt.clientX; sy = pt.clientY; ox = p.node.offsetLeft; oy = p.node.offsetTop;
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
      e.preventDefault();
    }
    function move(e) {
      if (!moving) return;
      var pt = e.touches ? e.touches[0] : e;
      // Clamped: a panel can never be dragged off-screen and stranded where its close button is unreachable.
      p.node.style.left = Math.max(-40, Math.min(window.innerWidth - 90, ox + pt.clientX - sx)) + 'px';
      p.node.style.top = Math.max(0, Math.min(window.innerHeight - 44, oy + pt.clientY - sy)) + 'px';
      if (e.cancelable) e.preventDefault();
    }
    function up() {
      moving = false;
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up);
    }
    handle.addEventListener('mousedown', down);
    handle.addEventListener('touchstart', down, { passive: false });
  }

  function resize(p, grip) {
    var sx, sy, ow, oh, sizing = false;
    function down(e) {
      sizing = true; focus(p);
      var pt = e.touches ? e.touches[0] : e;
      sx = pt.clientX; sy = pt.clientY; ow = p.node.offsetWidth; oh = p.node.offsetHeight;
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
      e.preventDefault(); e.stopPropagation();
    }
    function move(e) {
      if (!sizing) return;
      var pt = e.touches ? e.touches[0] : e;
      p.node.style.width = Math.max(280, ow + pt.clientX - sx) + 'px';
      p.node.style.height = Math.max(170, oh + pt.clientY - sy) + 'px';
      if (e.cancelable) e.preventDefault();
    }
    function up() {
      sizing = false;
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move); document.removeEventListener('touchend', up);
    }
    grip.addEventListener('mousedown', down);
    grip.addEventListener('touchstart', down, { passive: false });
  }

  function render(p, spec) {
    var b = p.body; b.innerHTML = '';
    if (spec.kind === 'image') {
      var im = el('img', 'holo-img'); im.src = spec.src; im.alt = spec.title || ''; b.appendChild(im);
    } else if (spec.kind === 'web') {
      var f = el('iframe', 'holo-frame'); f.src = spec.src; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer'; b.appendChild(f);
    } else if (spec.kind === 'rows') {
      var list = el('div', 'holo-rows');
      (spec.rows || []).forEach(function (r) {
        var row = el('div', 'holo-row');
        row.appendChild(el('div', 'holo-row-l', r.label != null ? String(r.label) : ''));
        if (r.value != null) row.appendChild(el('div', 'holo-row-v', String(r.value)));
        if (r.sub) row.appendChild(el('div', 'holo-row-s', String(r.sub)));
        list.appendChild(row);
      });
      if (!(spec.rows || []).length) list.appendChild(el('div', 'holo-empty', spec.empty || 'Nothing here.'));
      b.appendChild(list);
    } else {
      b.appendChild(el('div', 'holo-text', spec.text || ''));
    }
  }

  function open(spec) {
    spec = spec || {};
    ensureLayer();
    var w = spec.w || 520, h = spec.h || 380, pos = nextPos(w, h);

    var node = el('div', 'holo-panel materialize');
    node.style.width = w + 'px'; node.style.height = h + 'px';
    node.style.left = pos.x + 'px'; node.style.top = pos.y + 'px';
    node.style.zIndex = ++z;

    var bar = el('div', 'holo-bar');
    bar.appendChild(el('span', 'holo-dot'));
    bar.appendChild(el('span', 'holo-title', spec.title || 'Panel'));
    var btns = el('span', 'holo-btns');
    var maxB = el('button', 'holo-btn', '⛶'); maxB.title = 'Expand / restore';
    var closeB = el('button', 'holo-btn x', '✕'); closeB.title = 'Close';
    btns.appendChild(maxB); btns.appendChild(closeB);
    bar.appendChild(btns);

    var body = el('div', 'holo-body'), grip = el('div', 'holo-grip');
    node.appendChild(bar); node.appendChild(body); node.appendChild(grip);
    layer.appendChild(node);

    var p = { node: node, body: body, title: spec.title || 'Panel', kind: spec.kind || 'text' };
    panels.push(p);
    drag(p, bar); resize(p, grip);
    closeB.addEventListener('click', function () { close(p); });
    maxB.addEventListener('click', function () { node.classList.toggle('max'); focus(p); });
    node.addEventListener('mousedown', function () { focus(p); });
    focus(p);
    render(p, spec);
    setTimeout(function () { node.classList.remove('materialize'); }, 450);
    return p;
  }

  function focused() { return panels.filter(function (p) { return p.node.classList.contains('focused'); })[0] || panels[panels.length - 1] || null; }

  window.HOLO = {
    open: open,
    count: function () { return panels.length; },
    closeTop: function () { var p = focused(); if (p) close(p); return !!p; },
    closeAll: function () { panels.slice().forEach(close); },
    expand: function () { var p = focused(); if (!p) return false; p.node.classList.toggle('max'); return true; },
    // Coarse on purpose — a voice command should never need pixel precision.
    move: function (dir) {
      var p = focused(); if (!p) return false;
      var step = Math.round(window.innerWidth * 0.22);
      var x = p.node.offsetLeft + (dir === 'left' ? -step : dir === 'right' ? step : 0);
      var y = p.node.offsetTop + (dir === 'up' ? -step : dir === 'down' ? step : 0);
      p.node.style.left = Math.max(-40, Math.min(window.innerWidth - 90, x)) + 'px';
      p.node.style.top = Math.max(0, Math.min(window.innerHeight - 44, y)) + 'px';
      return true;
    },
    cycle: function (back) {
      if (panels.length < 2) return false;
      var i = panels.indexOf(focused());
      var n = ((back ? i - 1 : i + 1) + panels.length) % panels.length;
      focus(panels[n]);
      panels[n].node.classList.add('pulse');
      setTimeout(function () { panels[n].node.classList.remove('pulse'); }, 520);
      return true;
    },
  };
})();
