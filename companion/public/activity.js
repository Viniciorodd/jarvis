// JARVIS — Activity view. The whole-org activity log with a month CALENDAR (counts per day, click a day to
// filter), a drill-in detail per activity (with actions), and ARCHIVE so handled items stop sitting there.
// Reads /api/activity (control-plane events, archived ones filtered out); archive posts an append-only event.
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = (t) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  let items = [], byDay = {}, sel = null, calMonth = null, archivedCount = 0, hb = [], hbSum = null;
  const ago = (m) => m == null ? 'never' : m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';

  async function load() {
    el('activityLog').innerHTML = '<div class="ops-empty">loading…</div>';
    const arch = el('actShowArchived') && el('actShowArchived').checked ? '?archived=1' : '';
    let d; try { d = await (await fetch('/api/activity' + arch)).json(); } catch (e) { el('activityLog').innerHTML = `<div class="ops-empty">${esc(e.message)}</div>`; return; }
    items = d.items || []; byDay = d.byDay || {}; archivedCount = d.archivedCount || 0; hb = d.heartbeats || []; hbSum = d.heartbeatSummary || null;
    if (!calMonth) { const f = items[0] ? new Date(items[0].ts) : new Date(); calMonth = new Date(f.getFullYear(), f.getMonth(), 1); }
    renderCal(); renderLog();
  }

  function renderCal() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="cal-cell empty"></div>';
    for (let dd = 1; dd <= days; dd++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const n = byDay[iso] || 0;
      cells += `<div class="cal-cell${n ? ' has' : ''}${sel === iso ? ' sel' : ''}" data-day="${iso}"><span class="cal-d">${dd}</span>${n ? `<span class="cal-n">${n}</span>` : ''}</div>`;
    }
    el('activityCal').innerHTML = `
      <div class="cal-head">
        <button class="cal-nav" data-mon="-1">‹</button>
        <span class="cal-title">${MON[m]} ${y}</span>
        <button class="cal-nav" data-mon="1">›</button>
      </div>
      <div class="cal-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      ${sel ? `<button class="btn ghost cal-clear" id="calClear">showing ${esc(sel)} — show all</button>` : '<div class="cal-hint">click a day to filter</div>'}`;
  }

  // Heartbeats — proof each agent actually ran (rests included). No silent clicks.
  function heartbeatStrip() {
    if (!hb.length) return '';
    const chips = hb.map((h) => {
      const stale = h.minsAgo == null || h.minsAgo > 1440;
      const cls = stale ? 'hb-stale' : h.rested ? 'hb-rest' : 'hb-work';
      const note = h.rested ? 'rested' : esc(h.action || 'ran');
      return `<span class="hb-chip ${cls}" title="${esc(h.pod)} · ${esc(h.action)} · ${esc(h.rationale || '')}">${esc(h.actor)} <em>${note} · ${ago(h.minsAgo)}</em></span>`;
    }).join('');
    return `<div class="hb-wrap"><div class="hb-head">🫀 Agent heartbeats${hbSum ? ` — ${esc(hbSum.text)}` : ''}</div><div class="hb-chips">${chips}</div></div>`;
  }

  function renderLog() {
    let view = items.slice();
    if (sel) view = view.filter((it) => (it.ts || '').slice(0, 10) === sel);
    el('activityStat').textContent = `${view.length} activit${view.length === 1 ? 'y' : 'ies'}${sel ? ' on ' + sel : ''} · ${archivedCount} archived`;
    const strip = sel ? '' : heartbeatStrip(); // heartbeats are "now", not per-day — hide when filtering a day
    if (!view.length) { el('activityLog').innerHTML = strip + `<div class="ops-empty">No activity${sel ? ' on ' + esc(sel) : ' yet'}.</div>`; return; }
    el('activityLog').innerHTML = strip + view.map((it) => `
      <div class="act-row${it.status === 'error' ? ' err' : ''}${it.archived ? ' archived' : ''}" data-id="${esc(it.id)}">
        <div class="act-main">
          <div class="act-top"><span class="tag tag-act">${esc(it.action)}</span><span class="act-pod">${esc(it.pod)}</span><span class="act-t">${esc(when(it.ts))}</span>${it.archived ? '<span class="act-arch-tag">archived</span>' : ''}</div>
          <div class="act-r">${esc(it.rationale || '(no detail)')}</div>
        </div>
        ${it.archived ? '' : `<button class="act-archive" data-archive="${esc(it.id)}" title="Archive">✕</button>`}
      </div>`).join('');
  }

  function openDetail(id) {
    const it = items.find((x) => x.id === id); if (!it) return;
    el('actDetailCap').textContent = it.action + ' · ' + it.pod;
    let h = `<div class="od-title">${esc(it.rationale || it.action)}</div>
      <div class="ops-meta">
        <span>🕒 ${esc(when(it.ts))}</span>
        <span>🏷 ${esc(it.action)}</span>
        <span>▦ ${esc(it.pod)}</span>
        ${it.actor ? `<span>${esc(it.actor)}</span>` : ''}
        ${it.status ? `<span>${esc(it.status)}</span>` : ''}
        ${it.cost ? `<span>$${esc(it.cost)}</span>` : ''}
      </div>
      <div class="ops-actions">
        ${it.noticeId ? `<button class="btn go" data-act-opp="${esc(it.noticeId)}">Open the opportunity →</button>` : ''}
        ${it.file ? `<button class="btn" data-act-file="${esc(it.file)}">Open the file →</button>` : ''}
        <button class="btn ghost" data-archive="${esc(it.id)}">Archive</button>
      </div>`;
    el('actDetailBody').innerHTML = h;
    el('actDetail').hidden = false;
  }

  async function archive(id) {
    try { await fetch('/api/activity/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); } catch { /* */ }
    items = items.filter((x) => x.id !== id); archivedCount++;
    const day = items.length ? null : sel; void day;
    byDay = {}; for (const it of items) { const d = (it.ts || '').slice(0, 10); if (d) byDay[d] = (byDay[d] || 0) + 1; }
    el('actDetail').hidden = true; renderCal(); renderLog();
  }

  function open() { el('activityView').hidden = false; load(); }
  function close() { el('activityView').hidden = true; }
  el('activityBtn').addEventListener('click', open);
  el('activityX').addEventListener('click', close);
  el('activityRefresh').addEventListener('click', load);
  el('actShowArchived').addEventListener('change', () => { if (el('actShowArchived').checked) { /* refetch to include archived */ } load(); });
  el('activityCal').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-mon]'); if (nav) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(nav.getAttribute('data-mon')), 1); renderCal(); return; }
    if (e.target.closest('#calClear')) { sel = null; renderCal(); renderLog(); return; }
    const cell = e.target.closest('.cal-cell[data-day]'); if (cell) { const day = cell.getAttribute('data-day'); sel = sel === day ? null : day; renderCal(); renderLog(); }
  });
  el('activityLog').addEventListener('click', (e) => {
    const arch = e.target.closest('[data-archive]'); if (arch) { e.stopPropagation(); return archive(arch.getAttribute('data-archive')); }
    const row = e.target.closest('.act-row[data-id]'); if (row) openDetail(row.getAttribute('data-id'));
  });
  el('actDetailBody').addEventListener('click', (e) => {
    const a = e.target.closest('[data-archive]'); if (a) return archive(a.getAttribute('data-archive'));
    const o = e.target.closest('[data-act-opp]'); if (o) { el('activityView').hidden = true; if (window.JarvisOps) window.JarvisOps.openOpportunity(o.getAttribute('data-act-opp')); return; }
  });
  el('actDetailX').addEventListener('click', () => { el('actDetail').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('activityView').hidden) { if (!el('actDetail').hidden) el('actDetail').hidden = true; else close(); } });
})();
