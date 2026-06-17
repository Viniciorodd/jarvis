// JARVIS — Map view. A real US map (states outlined in a contour-line style), ALWAYS shown — even with no
// opportunities. Each opportunity/contract is a glowing pin at its place of performance; the side log is
// deadline-sorted. Uses d3-geo + us-atlas (loaded from CDN, browser-side); falls back to the log if offline.
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const daysUntil = (d) => { if (!d) return null; const t = new Date(d); if (isNaN(t)) return null; return Math.ceil((t - Date.now()) / 864e5); };
  const pinColor = (du) => (du != null && du <= 7 ? 'var(--warn)' : 'var(--teal)');
  const ST = { AL: [-86.8, 32.8], AZ: [-111.6, 34.2], AR: [-92.4, 34.9], CA: [-119.4, 37.2], CO: [-105.5, 39.0], CT: [-72.7, 41.6], DE: [-75.5, 39.0], FL: [-82.4, 28.6], GA: [-83.4, 32.6], ID: [-114.6, 44.4], IL: [-89.2, 40.0], IN: [-86.3, 39.9], IA: [-93.5, 42.0], KS: [-98.4, 38.5], KY: [-85.3, 37.5], LA: [-92.0, 31.0], ME: [-69.2, 45.4], MD: [-76.8, 39.0], MA: [-71.8, 42.3], MI: [-85.4, 44.3], MN: [-94.3, 46.3], MS: [-89.7, 32.7], MO: [-92.5, 38.4], MT: [-109.6, 47.0], NE: [-99.8, 41.5], NV: [-116.6, 39.3], NH: [-71.6, 43.7], NJ: [-74.7, 40.2], NM: [-106.1, 34.4], NY: [-75.6, 42.9], NC: [-79.4, 35.6], ND: [-100.5, 47.5], OH: [-82.8, 40.3], OK: [-97.5, 35.6], OR: [-120.5, 44.0], PA: [-77.8, 40.9], RI: [-71.6, 41.7], SC: [-80.9, 33.9], SD: [-100.2, 44.4], TN: [-86.4, 35.9], TX: [-99.3, 31.5], UT: [-111.7, 39.3], VT: [-72.7, 44.1], VA: [-78.9, 37.5], WA: [-120.4, 47.4], WV: [-80.6, 38.6], WI: [-89.9, 44.6], WY: [-107.5, 43.0], DC: [-77.0, 38.9] };
  const W = 640, H = 388;
  let projection = null, statesPath = '', meshPath = '', geoTried = false, geoOk = false;

  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });

  async function ensureGeo() {
    if (geoTried) return geoOk;
    geoTried = true;
    try {
      if (!(window.d3 && window.d3.geoAlbersUsa)) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js');
      if (!window.topojson) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/topojson-client/3.1.0/topojson-client.min.js');
      const topo = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then((r) => r.json());
      const states = window.topojson.feature(topo, topo.objects.states);
      const mesh = window.topojson.mesh(topo, topo.objects.states, (a, b) => a !== b);
      projection = window.d3.geoAlbersUsa().fitSize([W, H], states);
      const path = window.d3.geoPath(projection);
      statesPath = states.features.map((f) => path(f)).join(' ');
      meshPath = path(mesh) || '';
      geoOk = true;
    } catch (e) { console.warn('map: geo unavailable —', e.message); geoOk = false; }
    return geoOk;
  }

  const stateOf = (o) => {
    const s = String(o.placeState || '').toUpperCase().match(/[A-Z]{2}/);
    if (s && ST[s[0]]) return s[0];
    const m = String(o.place || '').toUpperCase().match(/,\s*([A-Z]{2})\b/);
    return m && ST[m[1]] ? m[1] : null;
  };

  function mapSvg(pins) {
    const dots = pins.map((p) => {
      const xy = projection ? projection(ST[p.st]) : null;
      if (!xy) return '';
      return `<g class="us-pin"><circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="9" style="fill:${p.color}" class="us-pin-glow"/><circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="3.6" style="fill:${p.color}"><title>${esc(p.title)} (${p.st})</title></circle></g>`;
    }).join('');
    return `<svg class="us-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <path d="${statesPath}" style="fill:rgba(var(--teal-rgb),.035); stroke:rgba(var(--teal-rgb),.32); stroke-width:0.7; stroke-linejoin:round"/>
      <path d="${meshPath}" style="fill:none; stroke:rgba(var(--teal-rgb),.5); stroke-width:0.4"/>
      ${dots}
    </svg>`;
  }

  async function load() {
    const panel = el('mapPins'), log = el('mapLog');
    log.innerHTML = '<div class="ops-empty">loading…</div>';
    await ensureGeo();
    let data; try { data = await (await fetch('/api/operations')).json(); } catch (e) { data = { opportunities: [] }; }
    const opps = (data.opportunities || []).map((o) => ({ ...o, st: stateOf(o), du: daysUntil(o.deadline) }));
    const placed = opps.filter((o) => o.st);

    if (geoOk) {
      panel.innerHTML = mapSvg(placed.map((o) => ({ st: o.st, title: o.title || 'opportunity', color: pinColor(o.du) }))) + '<div class="map-compass">N</div>';
    } else {
      panel.innerHTML = '<div class="map-compass">N</div><div class="ops-empty" style="padding-top:40px">US map needs internet to draw — opportunities are listed at right.</div>';
    }

    const urgent = placed.filter((o) => o.du != null && o.du <= 7).length;
    el('mapStat').innerHTML = `<span style="color:var(--teal)">●</span> ${placed.length} located &nbsp; <span style="color:var(--warn)">●</span> ${urgent} closing &le;7d`;
    const byDeadline = placed.slice().sort((a, b) => (a.du == null ? 1e9 : a.du) - (b.du == null ? 1e9 : b.du));
    log.innerHTML = byDeadline.length ? byDeadline.map((o) => `
      <div class="map-row" style="border-left-color:${pinColor(o.du)}">
        <div class="map-row-t">${esc(o.title || 'opportunity')}</div>
        <div class="map-row-s">
          <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${esc([o.place, o.st].filter(Boolean).join(', ') || o.st)}</span>
          ${o.du != null ? `<span style="color:${pinColor(o.du)}">⏳ ${o.du < 0 ? 'closed' : 'due in ' + o.du + 'd'}</span>` : ''}
          ${o.score != null ? `<span>◎ ${esc(o.score)}/100</span>` : ''}
        </div>
      </div>`).join('') : '<div class="ops-empty">No located opportunities yet — the map is ready for when they land.</div>';
  }

  function open() { el('mapView').hidden = false; load(); }
  function close() { el('mapView').hidden = true; }
  el('mapBtn').addEventListener('click', open);
  el('mapX').addEventListener('click', close);
  el('mapRefresh').addEventListener('click', load);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('mapView').hidden) close(); });
})();
