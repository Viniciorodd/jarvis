// JARVIS — Operations view (the cockpit). Reads /api/operations (aggregated from the control-plane) and
// renders four tabs: Leads (approve → the executor actually sends/creates), Opportunities (+ bid analysis),
// Proposals (open & read the draft text), CRM (subcontractors + enriched emails). Self-contained.
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ops = el('ops'), body = el('opsBody');
  let data = { leads: [], opportunities: [], proposals: [], crm: [] };
  let tab = 'leads';
  let loading = false;

  const recClass = (r) => (/^bid$/i.test(r) ? 'go' : /watch/i.test(r) ? 'mid' : 'no');
  const scoreClass = (n) => (n >= 75 ? 'go' : n >= 50 ? 'mid' : 'no');

  async function load() {
    if (loading) return; loading = true;
    body.innerHTML = '<div class="ops-empty">pulling live data from the floor…</div>';
    try {
      const r = await fetch('/api/operations');
      data = await r.json();
      if (data.error) console.warn('operations:', data.error);
    } catch (e) { body.innerHTML = `<div class="ops-empty">couldn't reach the control-plane (${esc(e.message)})</div>`; loading = false; return; }
    counts(); render();
    loading = false;
  }
  function counts() {
    el('cLeads').textContent = (data.leads || []).length || '';
    el('cOpps').textContent = (data.opportunities || []).length || '';
    el('cProps').textContent = (data.proposals || []).length || '';
    el('cCrm').textContent = (data.crm || []).length || '';
  }

  function render() {
    if (tab === 'leads') return renderLeads();
    if (tab === 'opps') return renderOpps();
    if (tab === 'props') return renderProps();
    if (tab === 'crm') return renderCrm();
  }

  function renderLeads() {
    const items = data.leads || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">No approvals waiting. When an agent needs you, it lands here.</div>'; return; }
    body.innerHTML = items.map((l) => `
      <div class="ops-card lead" data-id="${esc(l.id)}">
        <div class="ops-row">
          <span class="tag tag-${esc((l.pod || '').toLowerCase())}">${esc(l.pod || 'system')}</span>
          <span class="tag tag-act">${esc(l.action || '')}</span>
        </div>
        <div class="ops-title">${esc(l.rationale || '(no detail)')}</div>
        ${l.file ? `<div class="ops-sub">📄 ${esc(l.file)}</div>` : ''}
        <div class="ops-actions">
          <button class="btn go" data-approve="${esc(l.id)}">✓ Approve</button>
          <button class="btn ghost" data-pass="${esc(l.id)}">Pass</button>
          <span class="ops-result" id="res-${esc(l.id)}"></span>
        </div>
      </div>`).join('');
  }

  function renderOpps() {
    const items = data.opportunities || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">No scored opportunities yet. Tell Jarvis "scan SAM.gov for janitorial work."</div>'; return; }
    body.innerHTML = items.map((o) => `
      <div class="ops-card">
        <div class="ops-row">
          <span class="score ${scoreClass(o.score)}">${o.score != null ? esc(o.score) : '—'}<small>/100</small></span>
          <span class="rec ${recClass(o.recommendation)}">${esc((o.recommendation || '').toUpperCase() || 'SCORED')}</span>
          ${o.subNeeded ? '<span class="tag tag-act">needs a sub</span>' : ''}
        </div>
        <div class="ops-title">${esc(o.title || 'Untitled opportunity')}</div>
        <div class="ops-meta">
          ${o.setAside ? `<span>🏷 ${esc(o.setAside)}</span>` : ''}
          ${(o.place || o.placeState) ? `<span>📍 ${esc([o.place, o.placeState].filter(Boolean).join(', '))}</span>` : ''}
          ${o.deadline ? `<span>⏳ ${esc(String(o.deadline).slice(0, 10))}</span>` : ''}
          ${o.agency ? `<span>🏛 ${esc(o.agency)}</span>` : ''}
        </div>
        ${o.url ? `<div class="ops-actions"><a class="btn ghost" href="${esc(o.url)}" target="_blank" rel="noreferrer">View on SAM.gov ↗</a></div>` : ''}
      </div>`).join('');
  }

  function renderProps() {
    const items = data.proposals || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">No proposals drafted yet. Bid-worthy opportunities get a draft here.</div>'; return; }
    body.innerHTML = items.map((p) => `
      <div class="ops-card">
        <div class="ops-title">${esc(p.rationale || p.file)}</div>
        <div class="ops-sub">📄 ${esc(p.file)}</div>
        <div class="ops-actions"><button class="btn go" data-open="${esc(p.file)}">Open &amp; read →</button></div>
      </div>`).join('');
  }

  function renderCrm() {
    const items = data.crm || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">CRM empty. Tell Jarvis "find janitorial subs near Wilkes-Barre."</div>'; return; }
    body.innerHTML = items.map((s) => `
      <div class="ops-card">
        <div class="ops-row">
          <span class="ops-title-sm">${esc(s.name || 'unnamed')}</span>
          <span class="tag tag-act">${esc(s.status || 'prospect')}</span>
        </div>
        <div class="ops-meta">
          ${s.trade ? `<span>🧰 ${esc(s.trade)}</span>` : ''}
          ${s.location ? `<span>📍 ${esc(s.location)}</span>` : ''}
          <span class="${s.contact_email ? 'em-ok' : 'em-no'}">✉ ${esc(s.contact_email || 'no email — run enrichment')}</span>
          ${s.phone ? `<span>☎ ${esc(s.phone)}</span>` : ''}
          ${s.quote ? `<span>💲 ${esc(s.quote)}</span>` : ''}
        </div>
      </div>`).join('');
  }

  // ── approve / pass ──
  async function decide(id, decision, btn) {
    const resEl = el('res-' + id);
    if (btn) btn.disabled = true; if (resEl) resEl.textContent = decision === 'approve' ? 'approving…' : 'passing…';
    try {
      const r = await fetch('/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision }) });
      const d = await r.json();
      const ex = d.executed;
      let msg = decision === 'pass' ? 'passed' : '✓ approved';
      if (ex && ex.sent) msg = '✅ sent to ' + (ex.to || 'recipient');
      else if (ex && ex.action === 'email.preview') msg = '✓ approved — auto-send OFF (set GOV_AUTO_SEND=1 to send)';
      else if (ex && ex.action === 'invoice.preview') msg = '✓ approved — auto-create OFF (set FINANCE_AUTO_INVOICE=1)';
      else if (ex && ex.action === 'invoice.created') msg = '✅ payment link created';
      else if (ex && ex.ok === false) msg = '✓ approved, but: ' + (ex.reason || 'action did not complete');
      if (resEl) resEl.textContent = msg;
      // drop the resolved lead after a beat
      setTimeout(() => { data.leads = (data.leads || []).filter((l) => l.id !== id); counts(); if (tab === 'leads') renderLeads(); }, 1400);
    } catch (e) { if (resEl) resEl.textContent = 'error: ' + e.message; if (btn) btn.disabled = false; }
  }

  async function openProposal(file) {
    const reader = el('opsReader');
    el('opsReaderCap').textContent = file;
    el('opsReaderBody').textContent = 'loading…';
    reader.hidden = false;
    try {
      const r = await fetch('/api/proposal?file=' + encodeURIComponent(file));
      const d = await r.json();
      el('opsReaderBody').textContent = d.content || d.error || '(empty)';
    } catch (e) { el('opsReaderBody').textContent = 'error: ' + e.message; }
  }

  // ── events ──
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-approve]'); if (a) return decide(a.getAttribute('data-approve'), 'approve', a);
    const p = e.target.closest('[data-pass]'); if (p) return decide(p.getAttribute('data-pass'), 'pass', p);
    const o = e.target.closest('[data-open]'); if (o) return openProposal(o.getAttribute('data-open'));
  });
  document.querySelectorAll('.ops-tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.ops-tab').forEach((x) => x.classList.remove('on'));
    t.classList.add('on'); tab = t.getAttribute('data-tab'); render();
  }));
  function open() { ops.hidden = false; load(); }
  function close() { ops.hidden = true; }
  el('opsBtn').addEventListener('click', open);
  el('opsX').addEventListener('click', close);
  el('opsRefresh').addEventListener('click', load);
  el('opsReaderX').addEventListener('click', () => { el('opsReader').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ops.hidden) { if (!el('opsReader').hidden) el('opsReader').hidden = true; else close(); } });
})();
