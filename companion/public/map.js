// JARVIS — Map view. A real US map (states outlined contour-style, each labeled with its abbreviation),
// ALWAYS shown. Each opportunity is a glowing pin at its place of performance; click a pin OR a side-list
// row to open that opportunity's full detail (RFP docs + actions) via the Operations view. Filter out
// closed and by days-to-deadline. Geometry is baked into us-geo.js (no runtime CDN — works offline).
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const daysUntil = (d) => { if (!d) return null; const t = new Date(d); if (isNaN(t)) return null; return Math.ceil((t - Date.now()) / 864e5); };
  const pinColor = (du) => (du != null && du <= 7 ? 'var(--warn)' : 'var(--teal)');
  const ST = { AL: [-86.8, 32.8], AZ: [-111.6, 34.2], AR: [-92.4, 34.9], CA: [-119.4, 37.2], CO: [-105.5, 39.0], CT: [-72.7, 41.6], DE: [-75.5, 39.0], FL: [-82.4, 28.6], GA: [-83.4, 32.6], ID: [-114.6, 44.4], IL: [-89.2, 40.0], IN: [-86.3, 39.9], IA: [-93.5, 42.0], KS: [-98.4, 38.5], KY: [-85.3, 37.5], LA: [-92.0, 31.0], ME: [-69.2, 45.4], MD: [-76.8, 39.0], MA: [-71.8, 42.3], MI: [-85.4, 44.3], MN: [-94.3, 46.3], MS: [-89.7, 32.7], MO: [-92.5, 38.4], MT: [-109.6, 47.0], NE: [-99.8, 41.5], NV: [-116.6, 39.3], NH: [-71.6, 43.7], NJ: [-74.7, 40.2], NM: [-106.1, 34.4], NY: [-75.6, 42.9], NC: [-79.4, 35.6], ND: [-100.5, 47.5], OH: [-82.8, 40.3], OK: [-97.5, 35.6], OR: [-120.5, 44.0], PA: [-77.8, 40.9], RI: [-71.6, 41.7], SC: [-80.9, 33.9], SD: [-100.2, 44.4], TN: [-86.4, 35.9], TX: [-99.3, 31.5], UT: [-111.7, 39.3], VT: [-72.7, 44.1], VA: [-78.9, 37.5], WA: [-120.4, 47.4], WV: [-80.6, 38.6], WI: [-89.9, 44.6], WY: [-107.5, 43.0], DC: [-77.0, 38.9] };
  let W = 640, H = 388, statesPath = '', meshPath = '', pins = {}, geoTried = false, geoOk = false;
  let allOpps = []; // last fetched, for re-filtering without a refetch

  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });

  async function ensureGeo() {
    if (geoTried) return geoOk;
    geoTried = true;
    try {
      if (!window.US_GEO) await loadScript('us-geo.js'); // baked locally — no CDN, works offline
      const g = window.US_GEO;
      if (g && g.statesPath) { W = g.W || W; H = g.H || H; statesPath = g.statesPath; meshPath = g.meshPath || ''; pins = g.pins || {}; geoOk = true; }
    } catch (e) { console.warn('map: local geo unavailable —', e.message); geoOk = false; }
    return geoOk;
  }

  const stateOf = (o) => {
    const s = String(o.placeState || '').toUpperCase().match(/[A-Z]{2}/);
    if (s && ST[s[0]]) return s[0];
    const m = String(o.place || '').toUpperCase().match(/,\s*([A-Z]{2})\b/);
    return m && ST[m[1]] ? m[1] : null;
  };

  function mapSvg(view) {
    // faint state-abbreviation labels for every state (context), drawn under the pins
    const labels = Object.entries(pins).map(([code, xy]) => `<text x="${xy[0].toFixed(1)}" y="${(xy[1] + 3).toFixed(1)}" class="us-st-label">${code}</text>`).join('');
    const dots = view.filter((o) => pins[o.st]).map((o) => {
      const xy = pins[o.st]; const c = pinColor(o.du);
      return `<g class="us-pin clickable" data-notice="${esc(o.noticeId || '')}" tabindex="0" role="button">
        <circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="9" style="fill:${c}" class="us-pin-glow"/>
        <circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="3.8" style="fill:${c}"><title>${esc(o.title || 'opportunity')} (${o.st}) — click to open</title></circle>
      </g>`;
    }).join('');
    return `<svg class="us-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <path d="${statesPath}" style="fill:rgba(var(--teal-rgb),.035); stroke:rgba(var(--teal-rgb),.32); stroke-width:0.7; stroke-linejoin:round"/>
      <path d="${meshPath}" style="fill:none; stroke:rgba(var(--teal-rgb),.5); stroke-width:0.4"/>
      ${labels}
      ${dots}
    </svg>`;
  }

  // apply the filter controls + (re)draw pins, side list, and the stat line — no refetch
  function render() {
    const panel = el('mapPins'), log = el('mapLog');
    const hideClosed = el('mapHideClosed') ? el('mapHideClosed').checked : true;
    const maxDays = el('mapDays') ? Number(el('mapDays').value) : 0;
    let view = allOpps.filter((o) => o.st);
    if (hideClosed) view = view.filter((o) => o.du == null || o.du >= 0);
    if (maxDays) view = view.filter((o) => o.du != null && o.du >= 0 && o.du <= maxDays);

    if (geoOk) panel.innerHTML = mapSvg(view) + '<div class="map-compass">N</div>';
    else panel.innerHTML = '<div class="map-compass">N</div><div class="ops-empty" style="padding-top:40px">map data (us-geo.js) didn\'t load — opportunities are listed at right.</div>';

    const urgent = view.filter((o) => o.du != null && o.du >= 0 && o.du <= 7).length;
    el('mapStat').innerHTML = `<span style="color:var(--teal)">●</span> ${view.length} shown &nbsp; <span style="color:var(--warn)">●</span> ${urgent} closing &le;7d`;
    const byDeadline = view.slice().sort((a, b) => (a.du == null ? 1e9 : a.du) - (b.du == null ? 1e9 : b.du));
    log.innerHTML = byDeadline.length ? byDeadline.map((o) => `
      <div class="map-row clickable" data-notice="${esc(o.noticeId || '')}" style="border-left-color:${pinColor(o.du)}">
        <div class="map-row-t">${esc(o.title || 'opportunity')}</div>
        <div class="map-row-s">
          <span>📍 ${esc([o.place, o.st].filter(Boolean).join(', ') || o.st)}</span>
          ${o.du != null ? `<span style="color:${pinColor(o.du)}">⏳ ${o.du < 0 ? 'closed' : 'due in ' + o.du + 'd'}</span>` : ''}
          ${o.score != null ? `<span>◎ ${esc(o.score)}/100</span>` : ''}
          <span class="map-open">open ›</span>
        </div>
      </div>`).join('') : '<div class="ops-empty">No opportunities match the filter.</div>';
  }

  async function load() {
    const log = el('mapLog');
    log.innerHTML = '<div class="ops-empty">loading…</div>';
    await ensureGeo();
    let data; try { data = await (await fetch('/api/operations')).json(); } catch (e) { data = { opportunities: [] }; }
    allOpps = (data.opportunities || []).map((o) => ({ ...o, st: stateOf(o), du: daysUntil(o.deadline) }));
    render();
  }

  // open the full opportunity detail (RFP docs + actions) via the Operations view
  function openOpp(noticeId) { if (noticeId && window.JarvisOps) window.JarvisOps.openOpportunity(noticeId); }

  function open() { el('mapView').hidden = false; load(); }
  function close() { el('mapView').hidden = true; }
  el('mapBtn').addEventListener('click', open);
  el('mapX').addEventListener('click', close);
  el('mapRefresh').addEventListener('click', load);
  if (el('mapHideClosed')) el('mapHideClosed').addEventListener('change', render);
  if (el('mapDays')) el('mapDays').addEventListener('change', render);
  el('mapPins').addEventListener('click', (e) => { const g = e.target.closest('[data-notice]'); if (g) openOpp(g.getAttribute('data-notice')); });
  el('mapLog').addEventListener('click', (e) => { const r = e.target.closest('[data-notice]'); if (r) openOpp(r.getAttribute('data-notice')); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('mapView').hidden) close(); });
})();
