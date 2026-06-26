// JARVIS Cockpit — one calm screen. Reads /api/cockpit, renders the panels, and writes back to the
// vault (add/complete/capture) + the control-plane (approvals). Vanilla JS, no deps.
'use strict';
const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const esc = (s) => String(s == null ? '' : s);

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) { let m = r.status; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
  return r.json();
}

// ── time helpers ────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'all day';     // all-day event (date only)
  const d = new Date(iso); if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const dayKey = (iso) => String(iso).slice(0, 10);
const greetWord = () => { const h = new Date().getHours(); return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function tickClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) +
    '  ·  ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ── render ──────────────────────────────────────────────────────────────────
function renderOneThing(d) {
  const o = d.oneThing;
  $('#oneThing').textContent = o ? o.text : 'Nothing pressing — pick the highest-leverage move. 🎯';
  const meta = $('#oneMeta'); meta.innerHTML = '';
  if (o && o.kind === 'gov') { meta.appendChild(el('span', 'tag gov', 'Gov · #1 priority')); }
  else if (o && o.kind === 'approval') { meta.appendChild(el('span', 'tag gov', 'Awaiting your sign-off')); }
  else if (o && o.kind === 'task') { meta.appendChild(el('span', 'tag', 'From your tasks')); }
  if (o && o.deadline) meta.appendChild(el('span', '', 'due ' + o.deadline));
}

function renderTodayCal(d) {
  const wrap = $('#todayCal'); wrap.innerHTML = '';
  const evs = d.todayCalendar || [];
  if (!evs.length) { wrap.appendChild(el('div', 'none', d.hasGoogle ? 'No events today — clear runway.' : 'Calendar not connected.')); return; }
  for (const e of evs) {
    const row = el('div', 'ev');
    row.appendChild(el('span', 't', fmtTime(e.start)));
    const s = el('span', '', e.summary || '(busy)');
    if (e.location) s.appendChild(el('span', 'muted small', '  · ' + e.location));
    row.appendChild(s);
    wrap.appendChild(row);
  }
}

function taskRow(t) {
  const li = el('li');
  const box = el('span', 'box'); box.title = 'Complete';
  box.onclick = () => completeTask(t, li);
  const body = el('div', 'body');
  body.appendChild(el('div', 'txt', t.text));
  const meta = el('div', 'meta');
  if (t.due) meta.appendChild(el('span', 'due', '📅 ' + t.due));
  if (t.priority && (t.priority === 'high' || t.priority === 'highest')) meta.appendChild(el('span', 'hi', '↑ ' + t.priority));
  for (const tag of (t.tags || []).slice(0, 3)) meta.appendChild(el('span', 'tg', '#' + tag));
  if (meta.childNodes.length) body.appendChild(meta);
  li.appendChild(box); li.appendChild(body);
  return li;
}

function renderTasks(d) {
  const tk = d.tasks || { dueToday: [], active: [] };
  const due = tk.dueToday || [], active = tk.active || [];
  $('#taskCount').textContent = (due.length ? due.length + ' due · ' : '') + active.length + ' active';
  const dueList = $('#dueList'); dueList.innerHTML = '';
  if (!due.length) $('#dueWrap').classList.add('hidden'); else { $('#dueWrap').classList.remove('hidden'); due.forEach((t) => dueList.appendChild(taskRow(t))); }
  const activeList = $('#activeList'); activeList.innerHTML = '';
  if (!active.length) activeList.appendChild(el('div', 'empty', 'Nothing active. Add a task above.'));
  else active.slice(0, 25).forEach((t) => activeList.appendChild(taskRow(t)));
}

function renderWeek(d) {
  const status = $('#calStatus');
  if (d.calError === 'not-connected') status.textContent = 'not connected';
  else if (d.calError) status.textContent = 'error';
  else status.textContent = (d.week || []).length + ' events';
  const wrap = $('#weekList'); wrap.innerHTML = '';
  const evs = d.week || [];
  if (!evs.length) { wrap.appendChild(el('div', 'week-empty', d.hasGoogle ? 'Nothing scheduled in the next 7 days.' : 'Connect Google Calendar to see your week.')); return; }
  const byDay = {};
  for (const e of evs) { const k = dayKey(e.start); (byDay[k] ||= []).push(e); }
  const today = d.date;
  Object.keys(byDay).sort().forEach((k) => {
    const day = el('div', 'week-day' + (k === today ? ' is-today' : ''));
    const dt = new Date(k + 'T12:00:00');
    const dh = el('div', 'd');
    dh.appendChild(el('span', 'dow', dt.toLocaleDateString([], { weekday: 'short' })));
    dh.appendChild(document.createTextNode('  ' + dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) + (k === today ? '  · today' : '')));
    day.appendChild(dh);
    for (const e of byDay[k]) {
      const ev = el('div', 'ev');
      ev.appendChild(el('span', 't', fmtTime(e.start)));
      ev.appendChild(el('span', '', e.summary || '(busy)'));
      day.appendChild(ev);
    }
    wrap.appendChild(day);
  });
}

function renderApprovals(d) {
  const strip = $('#approvals'); strip.innerHTML = '';
  const aps = d.approvals || [];
  if (!aps.length) { strip.classList.add('hidden'); return; }
  strip.classList.remove('hidden');
  strip.appendChild(el('span', 'a-label', '⏳ ' + aps.length + ' awaiting you'));
  for (const a of aps.slice(0, 3)) {
    const item = el('div', 'a-item');
    const b = el('b'); b.textContent = a.title || a.action; b.title = a.rationale || ''; item.appendChild(b);
    const ok = el('button', 'ok', 'Approve'); ok.onclick = () => decide(a.id, 'approve');
    const no = el('button', 'no', 'Pass'); no.onclick = () => decide(a.id, 'pass');
    item.appendChild(ok); item.appendChild(no);
    strip.appendChild(item);
  }
  if (aps.length > 3) strip.appendChild(el('a', 'more', '+' + (aps.length - 3) + ' more')).setAttribute('href', '/index.html#operations');
}

function render(d) {
  if (d.error) { $('#subtitle').textContent = 'Error: ' + d.error; return; }
  $('#greeting').textContent = greetWord() + '.';
  const tk = d.tasks || {}; const due = (tk.dueToday || []).length; const aps = (d.approvals || []).length;
  $('#subtitle').textContent = [due ? due + ' due today' : 'nothing due', aps ? aps + ' awaiting you' : null].filter(Boolean).join(' · ');
  renderApprovals(d); renderOneThing(d); renderTodayCal(d); renderTasks(d); renderWeek(d);
}

// ── actions ───────────────────────────────────────────────────────────────────
let loading = false;
async function load() {
  if (loading) return; loading = true;
  try { render(await api('/api/cockpit')); }
  catch (e) { $('#subtitle').textContent = 'Could not load: ' + e.message; }
  finally { loading = false; }
}

async function completeTask(t, li) {
  li.classList.add('gone');
  try { await api('/api/cockpit/task/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, file: t.file, raw: t.raw }) }); setTimeout(load, 350); }
  catch (e) { li.classList.remove('gone'); alert('Could not complete: ' + e.message); }
}

async function decide(id, decision) {
  try { await api('/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision }) }); load(); }
  catch (e) { alert('Approval failed: ' + e.message); }
}

// Quick-add: parse inline "📅 2026-07-01" and "#tags" out of the text (rest is the title).
function parseQuickAdd(raw) {
  let text = raw;
  const due = (text.match(/📅\s*(\d{4}-\d{2}-\d{2})/) || text.match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1] || '';
  const tags = [...text.matchAll(/#([A-Za-z0-9_/-]+)/g)].map((m) => m[1]);
  text = text.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').replace(/#[A-Za-z0-9_/-]+/g, '').replace(/\s+/g, ' ').trim();
  return { text, due, tags };
}

function wire() {
  $('#refresh').onclick = load;
  $('#addForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#addInput').value.trim(); if (!v) return;
    const body = parseQuickAdd(v); if (!body.text) return;
    $('#addInput').value = '';
    try { await api('/api/cockpit/task/add', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); load(); }
    catch (err) { alert('Could not add: ' + err.message); $('#addInput').value = v; }
  };
  $('#captureForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#captureInput').value.trim(); if (!v) return;
    $('#captureInput').value = '';
    const toast = $('#captureToast');
    try { await api('/api/cockpit/capture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: v }) }); toast.textContent = '✓ captured to the vault'; setTimeout(() => (toast.textContent = ''), 2500); load(); }
    catch (err) { toast.style.color = 'var(--coral)'; toast.textContent = 'Failed: ' + err.message; }
  };
}

tickClock(); setInterval(tickClock, 30000);
wire(); load(); setInterval(load, 60000);
