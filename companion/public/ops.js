// JARVIS — Operations cockpit. A BUSINESS switcher (Gov / Fiverr / SaaS) sits above the tabs; each business
// shows its own operations. Gov: Leads / Opportunities (→ full detail + real RFP docs from SAM) / Proposals
// (draft + RFP & files) / CRM. Fiverr & SaaS: Leads + Activity. Reads /api/operations + /api/pod-events.
'use strict';
(function () {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ops = el('ops'), body = el('opsBody');
  let data = { leads: [], opportunities: [], proposals: [], crm: [] };
  let oppByNotice = {}, leadById = {};
  let loading = false;
  let agentChat = [];        // conversation with the bid analyst, scoped to the open opportunity
  let curDetail = {};        // { noticeId, file } of the opportunity detail currently open

  // The businesses. `pods` = which control-plane pods feed this business's Leads (gov also absorbs the
  // central exec/finance/system approvals so money gates stay visible). `tabs` = the views it shows.
  const BUSINESSES = [
    { id: 'gov', label: '🏛 Gov Contracting', pods: ['gov', 'exec', 'chief-of-staff', 'system'], tabs: ['leads', 'opps', 'props', 'crm'] },
    { id: 'fiverr', label: '🎨 Fiverr Studio', pods: ['fiverr'], tabs: ['activity', 'leads'] },
    { id: 'saas', label: '🖥 SaaS / Recon', pods: ['saas'], tabs: ['activity', 'leads'] },
  ];
  const TAB_LABELS = { leads: '⚑ Leads', opps: '◎ Opportunities', props: '▤ Proposals', crm: '⚇ CRM', activity: '⟁ Activity' };
  let biz = 'gov', tab = 'leads';
  const curBiz = () => BUSINESSES.find((b) => b.id === biz) || BUSINESSES[0];

  const recClass = (r) => (/^bid$/i.test(r) ? 'go' : /watch/i.test(r) ? 'mid' : 'no');
  const scoreClass = (n) => (n >= 75 ? 'go' : n >= 50 ? 'mid' : 'no');
  const daysUntil = (d) => { if (!d) return null; const t = new Date(d); if (isNaN(t)) return null; return Math.ceil((t - Date.now()) / 864e5); };
  const dueChip = (d) => { const du = daysUntil(d); if (du == null) return ''; const c = du <= 7 ? 'var(--warn)' : 'var(--dim)'; return `<span style="color:${c}">⏳ ${du < 0 ? 'closed' : 'due in ' + du + 'd'}</span>`; };
  const when = (t) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const leadsFor = (b) => (data.leads || []).filter((l) => b.pods.includes((l.pod || 'system')));

  async function load() {
    if (loading) return; loading = true;
    body.innerHTML = '<div class="ops-empty">pulling live data from the floor…</div>';
    try {
      const r = await fetch('/api/operations');
      data = await r.json();
      if (data.error) console.warn('operations:', data.error);
    } catch (e) { body.innerHTML = `<div class="ops-empty">couldn't reach the control-plane (${esc(e.message)})</div>`; loading = false; return; }
    oppByNotice = {}; for (const o of (data.opportunities || [])) if (o.noticeId) oppByNotice[o.noticeId] = o;
    leadById = {}; for (const l of (data.leads || [])) leadById[l.id] = l;
    renderBizBar(); renderTabs(); render();
    loading = false;
  }

  function renderBizBar() {
    el('opsBiz').innerHTML = BUSINESSES.map((b) => {
      const n = leadsFor(b).length;
      return `<button class="ops-bizbtn${b.id === biz ? ' on' : ''}" data-biz="${b.id}">${esc(b.label)}${n ? `<span class="ops-c">${n}</span>` : ''}</button>`;
    }).join('');
  }
  function tabCount(t) {
    if (t === 'leads') return leadsFor(curBiz()).length;
    if (t === 'opps') return (data.opportunities || []).length;
    if (t === 'props') return (data.proposals || []).length;
    if (t === 'crm') return (data.crm || []).length;
    return 0;
  }
  function renderTabs() {
    el('opsTabs').innerHTML = curBiz().tabs.map((t) => {
      const n = tabCount(t);
      return `<button class="ops-tab${t === tab ? ' on' : ''}" data-tab="${t}">${TAB_LABELS[t] || t}${n ? `<span class="ops-c">${n}</span>` : ''}</button>`;
    }).join('');
  }

  function render() {
    if (tab === 'leads') return renderLeads();
    if (tab === 'opps') return renderOpps();
    if (tab === 'props') return renderProps();
    if (tab === 'crm') return renderCrm();
    if (tab === 'activity') return renderActivity(curBiz().pods[0]);
  }

  function renderLeads() {
    const items = leadsFor(curBiz());
    if (!items.length) { body.innerHTML = '<div class="ops-empty">No approvals waiting for this business. When an agent needs you, it lands here.</div>'; return; }
    body.innerHTML = items.map((l) => {
      const canReview = !!(l.file || l.noticeId);
      return `
      <div class="ops-card lead" data-id="${esc(l.id)}">
        <div class="ops-row">
          <span class="tag tag-${esc((l.pod || '').toLowerCase())}">${esc(l.pod || 'system')}</span>
          <span class="tag tag-act">${esc(l.action || '')}</span>
        </div>
        <div class="ops-title">${esc(l.rationale || '(no detail)')}</div>
        ${l.file ? `<div class="ops-sub">📄 ${esc(l.file)}</div>` : ''}
        <div class="ops-actions">
          ${canReview ? `<button class="btn" data-review="${esc(l.id)}">🔍 Review</button>` : ''}
          <button class="btn go" data-approve="${esc(l.id)}">✓ Approve</button>
          <button class="btn ghost" data-pass="${esc(l.id)}">Pass</button>
          <span class="ops-result" id="res-${esc(l.id)}"></span>
        </div>
      </div>`;
    }).join('');
  }

  function renderOpps() {
    const items = data.opportunities || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">No scored opportunities yet. Tell Jarvis "scan SAM.gov for janitorial work."</div>'; return; }
    body.innerHTML = items.map((o) => `
      <div class="ops-card opp${o.noticeId ? ' clickable' : ''}" ${o.noticeId ? `data-opp="${esc(o.noticeId)}"` : ''}>
        <div class="ops-row">
          <span class="score ${scoreClass(o.score)}">${o.score != null ? esc(o.score) : '—'}<small>/100</small></span>
          <span class="rec ${recClass(o.recommendation)}">${esc((o.recommendation || '').toUpperCase() || 'SCORED')}</span>
          ${o.subNeeded ? '<span class="tag tag-act">needs a sub</span>' : ''}
          ${o.proposalFile ? '<span class="tag tag-act">📝 drafted</span>' : ''}
        </div>
        <div class="ops-title">${esc(o.title || 'Untitled opportunity')}</div>
        <div class="ops-meta">
          ${o.setAside ? `<span>🏷 ${esc(o.setAside)}</span>` : ''}
          ${(o.place || o.placeState) ? `<span>📍 ${esc([o.place, o.placeState].filter(Boolean).join(', '))}</span>` : ''}
          ${dueChip(o.deadline)}
          ${o.agency ? `<span>🏛 ${esc(o.agency)}</span>` : ''}
        </div>
        <div class="ops-actions">
          ${o.noticeId ? `<button class="btn go" data-opp-btn="${esc(o.noticeId)}">Details &amp; RFP →</button>` : ''}
          ${o.url ? `<a class="btn ghost" href="${esc(o.url)}" target="_blank" rel="noreferrer">SAM.gov ↗</a>` : ''}
        </div>
      </div>`).join('');
  }

  function renderProps() {
    const items = data.proposals || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">No proposals drafted yet. Bid-worthy opportunities get a draft here.</div>'; return; }
    body.innerHTML = items.map((p) => `
      <div class="ops-card">
        <div class="ops-title">${esc(p.rationale || p.file)}</div>
        <div class="ops-sub">📄 ${esc(p.file)}</div>
        <div class="ops-actions">
          <button class="btn go" data-open="${esc(p.file)}">Open &amp; read →</button>
          ${p.noticeId ? `<button class="btn" data-docs="${esc(p.noticeId)}">📎 RFP &amp; files</button>` : ''}
          ${p.approvalId ? `<button class="btn" data-approve="${esc(p.approvalId)}">✓ Approve</button><span class="ops-result" id="res-${esc(p.approvalId)}"></span>` : ''}
        </div>
      </div>`).join('');
  }

  function renderCrm() {
    const items = data.crm || [];
    if (!items.length) { body.innerHTML = '<div class="ops-empty">CRM empty. Tell Jarvis "find janitorial subs near Wilkes-Barre."</div>'; return; }
    body.innerHTML = items.map((s) => `
      <div class="ops-card opp clickable" data-sub="${esc(s.id || '')}">
        <div class="ops-row">
          <span class="ops-title-sm">${esc(s.name || 'unnamed')}</span>
          <span class="tag tag-act">${esc(s.status || 'prospect')}</span>
        </div>
        <div class="ops-meta">
          ${s.trade ? `<span>🧰 ${esc(s.trade)}</span>` : ''}
          ${s.location ? `<span>📍 ${esc(s.location)}</span>` : ''}
          <span class="${s.contact_email ? 'em-ok' : 'em-no'}">✉ ${esc(s.contact_email || 'no email — open to find one')}</span>
          ${s.phone ? `<span>☎ ${esc(s.phone)}</span>` : ''}
        </div>
        <div class="ops-actions"><button class="btn go" data-sub-open="${esc(s.id || '')}">Open profile &amp; fit →</button></div>
      </div>`).join('');
  }

  async function openSubDetail(id) {
    if (!id) return;
    el('oppDetailCap').textContent = 'Subcontractor';
    el('oppDetailBody').innerHTML = '<div class="ops-empty">loading profile, reviews &amp; fit…</div>';
    el('oppDetail').hidden = false;
    let d; try { d = await (await fetch('/api/sub-info?id=' + encodeURIComponent(id))).json(); } catch (e) { el('oppDetailBody').innerHTML = `<div class="ops-empty">couldn't load: ${esc(e.message)}</div>`; return; }
    if (d.error) { el('oppDetailBody').innerHTML = `<div class="ops-empty">${esc(d.error)}</div>`; return; }
    const s = d.sub || {}, pl = d.places, fit = d.fit;
    el('oppDetailCap').textContent = String(s.name || 'Subcontractor').slice(0, 70);
    const fitClass = fit && /GREAT/.test(fit.verdict) ? 'go' : fit && /POOR/.test(fit.verdict) ? 'no' : 'mid';
    let h = `<div class="od-title">${esc(s.name || 'Subcontractor')}</div>
      <div class="ops-meta">
        ${s.trade ? `<span>🧰 ${esc(s.trade)}</span>` : ''}
        ${s.location ? `<span>📍 ${esc(s.location)}</span>` : ''}
        ${pl && pl.rating ? `<span>⭐ ${esc(pl.rating)} (${esc(pl.total)} reviews)</span>` : ''}
        <span class="rec ${fitClass}">${esc((fit && fit.verdict) || 'PROSPECT')}</span>
      </div>
      <div class="ops-actions">
        ${s.website ? `<a class="btn ghost" href="${esc(s.website)}" target="_blank" rel="noreferrer">Website ↗</a>` : ''}
        <button class="btn go" data-reach="${esc(s.id)}">📧 Have Hector reach out</button>
        <span class="od-act-result" id="odActResult"></span>
      </div>
      <div class="od-sec"><div class="od-sec-h">Contact</div>
        <div class="od-contact">${s.contact_email ? `✉ <a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>` : '✉ no email yet — “reach out” will try to find one'}${s.phone ? ' · ☎ ' + esc(s.phone) : ''}</div>
      </div>`;
    if (fit && fit.why) h += `<div class="od-sec"><div class="od-sec-h">Our fit assessment (Hector)</div><div class="od-desc">${esc(fit.why)}</div></div>`;
    if (pl && pl.reviews && pl.reviews.length) h += `<div class="od-sec"><div class="od-sec-h">Reviews (Google)</div>${pl.reviews.map((rv) => `<div class="od-review">${rv.rating ? '★'.repeat(Math.round(rv.rating)) + ' ' : ''}${esc(rv.author)}<div class="od-review-t">${esc(String(rv.text).slice(0, 300))}</div></div>`).join('')}</div>`;
    else if (pl) h += '<div class="od-sec"><div class="od-sec-h">Reviews (Google)</div><div class="ops-empty">No reviews returned for this business.</div></div>';
    if (s.notes) h += `<div class="od-sec"><div class="od-sec-h">Notes</div><div class="od-desc">${esc(s.notes)}</div></div>`;
    el('oppDetailBody').innerHTML = h;
  }
  async function runCompliance(file) {
    const sec = el('odComplianceSec'), box = el('odCompliance'); if (!sec) return;
    sec.hidden = false; box.innerHTML = '<div class="ops-empty">reading the RFP requirements + checking the proposal…</div>';
    try {
      const d = await (await fetch('/api/compliance-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId: curDetail.noticeId, file }) })).json();
      if (d.error) { box.innerHTML = `<div class="ops-empty">${esc(d.error)}</div>`; return; }
      const vc = d.verdict === 'PASS' ? 'go' : d.verdict === 'FAIL' ? 'no' : 'mid';
      let h = `<div class="cmp-line"><span class="rec ${vc}">${esc(d.verdict || '?')}</span><span class="cmp-summary">${esc(d.summary || '')}</span></div>`;
      if ((d.items || []).length) h += '<div class="cmp-items">' + d.items.map((it) => `<div class="cmp-item ${it.ok ? 'ok' : 'bad'}">${it.ok ? '✓' : '✗'} <b>${esc(it.req)}</b>${it.note ? ' — ' + esc(it.note) : ''}</div>`).join('') + '</div>';
      if ((d.gaps || []).length) h += '<div class="cmp-gaps"><b>Fix before submitting:</b><ul>' + d.gaps.map((g) => `<li>${esc(g)}</li>`).join('') + '</ul></div>';
      if (d.needs_sub_past_performance) h += '<div class="cmp-gaps">⚠ Needs a subcontractor\'s past performance — use a CRM prospect\'s “reach out” to request it.</div>';
      box.innerHTML = h;
    } catch (e) { box.innerHTML = `<div class="ops-empty">error: ${esc(e.message)}</div>`; }
  }
  async function reachSub(id) {
    const r = el('odActResult'); if (r) r.textContent = 'Hector is finding an email + drafting the intro…';
    try {
      const res = await fetch('/api/sub-reach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
      const d = await res.json();
      if (r) r.textContent = d.ok ? (d.email ? `✅ drafted to ${d.email} — review & send in Leads` : '✅ drafted, but no email found — add one, then send') : 'couldn’t draft: ' + (d.error || 'try again');
    } catch (e) { if (r) r.textContent = 'error: ' + e.message; }
  }

  async function renderActivity(pod) {
    body.innerHTML = '<div class="ops-empty">loading activity…</div>';
    try {
      const d = await (await fetch('/api/pod-events?pod=' + encodeURIComponent(pod))).json();
      const evs = d.events || [];
      if (!evs.length) { body.innerHTML = '<div class="ops-empty">No activity logged for this business yet. Tell Jarvis to start a job (e.g. "make a YouTube thumbnail").</div>'; return; }
      body.innerHTML = evs.map((e) => `
        <div class="ops-card${e.status === 'error' ? ' lead' : ''}">
          <div class="ops-row">
            <span class="tag tag-act">${esc(e.action || '')}</span>
            <span class="ops-sub">${esc(when(e.ts))}${e.actor ? ' · ' + esc(e.actor) : ''}</span>
          </div>
          <div class="ops-title" style="font-size:13.5px">${esc(e.rationale || '')}</div>
        </div>`).join('');
    } catch (e) { body.innerHTML = `<div class="ops-empty">couldn't load activity: ${esc(e.message)}</div>`; }
  }

  // ── approve confirmation: tell the user EXACTLY what approving will do, before it happens ──
  let pendingApproveId = null;
  function moneyIn(text) { const m = String(text || '').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/); return m ? m[1] : null; }
  async function confirmApprove(id) {
    const l = leadById[id]; if (!l) return decide(id, 'approve');
    pendingApproveId = id;
    const act = String(l.action || '').toLowerCase();
    const bodyEl = el('opsConfirmBody');
    bodyEl.innerHTML = `<div class="ocf-what">${esc(l.rationale || l.action || 'this action')}</div><div class="ops-empty">checking what will happen…</div>`;
    el('opsConfirm').hidden = false;
    let html = '';
    if (/submit/.test(act)) {
      html = `<p>✅ <b>Marks this proposal ready to submit.</b></p>
        <p>Government proposals are <b>not emailed</b> — you submit them yourself on the <b>SAM.gov portal</b>. Approving logs it as ready and (optionally) notifies you; <b>nothing is auto-sent</b>.</p>
        <p class="ocf-tip">Tip: open the proposal + the real RFP documents first (Proposals tab → “RFP &amp; files”) to confirm we meet every requirement before you submit.</p>`;
    } else if (/send|email|outreach/.test(act)) {
      let to = null;
      if (l.file) { try { const d = await (await fetch('/api/proposal?file=' + encodeURIComponent(l.file))).json(); to = ((d.content || '').match(/^To:\s*(.+)$/m) || [])[1] || null; } catch { /* */ } }
      if (to) html = `<p>✉ <b>Emails this outreach</b> from the Rodgate mailbox to:</p><p class="ocf-to">${esc(to)}</p><p class="ocf-tip">It only actually sends if auto-send is on (GOV_AUTO_SEND); otherwise you’ll get a preview of what would go out.</p>`;
      else html = `<p>⚠ <b>This won’t send anything yet.</b></p><p>There’s <b>no recipient email</b> for this subcontractor on file, so approving can’t email it. First ask Hector to find the email (say <i>“find emails for the subs”</i>), then approve.</p>`;
    } else if (/invoice|payment|charge|bill/.test(act) || moneyIn(l.rationale)) {
      const amt = moneyIn(l.rationale);
      html = `<p>💲 <b>Creates a Stripe payment link${amt ? ' for $' + esc(amt) : ''}</b> and writes a ready-to-send invoice email.</p><p class="ocf-tip">Only creates a real link if auto-create is on (FINANCE_AUTO_INVOICE); otherwise you’ll see a preview.</p>`;
    } else {
      html = `<p>Approving runs this action through the gated executor and logs the result. You’ll see exactly what happened right after.</p>`;
    }
    bodyEl.innerHTML = `<div class="ocf-what">${esc(l.rationale || l.action || 'this action')}</div>${html}`;
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
      setTimeout(() => { data.leads = (data.leads || []).filter((l) => l.id !== id); renderBizBar(); renderTabs(); if (tab === 'leads') renderLeads(); }, 1400);
    } catch (e) { if (resEl) resEl.textContent = 'error: ' + e.message; if (btn) btn.disabled = false; }
  }

  function reviewLead(id) {
    const l = leadById[id]; if (!l) return;
    if (l.file) return openProposal(l.file);
    if (l.noticeId) return openOppDetail(l.noticeId);
  }

  async function openProposal(file) {
    el('opsReaderCap').textContent = file;
    el('opsReaderBody').textContent = 'loading…';
    el('opsReader').hidden = false;
    try {
      const r = await fetch('/api/proposal?file=' + encodeURIComponent(file));
      const d = await r.json();
      el('opsReaderBody').textContent = d.content || d.error || '(empty)';
    } catch (e) { el('opsReaderBody').textContent = 'error: ' + e.message; }
  }

  // ── opportunity / RFP detail ──
  function renderOppDetail(d) {
    const k = oppByNotice[d.noticeId] || {};
    const title = d.title || k.title || 'Opportunity';
    const deadline = d.deadline || k.deadline, setAside = d.setAside || k.setAside, agency = d.agency || k.agency, samUrl = d.url || k.url;
    let h = `<div class="od-title">${esc(title)}</div>
      <div class="ops-meta">
        ${k.score != null ? `<span class="score ${scoreClass(k.score)}">${esc(k.score)}<small>/100</small></span>` : ''}
        ${k.recommendation ? `<span class="rec ${recClass(k.recommendation)}">${esc(k.recommendation.toUpperCase())}</span>` : ''}
        ${agency ? `<span>🏛 ${esc(agency)}</span>` : ''}
        ${setAside ? `<span>🏷 ${esc(setAside)}</span>` : ''}
        ${(k.place || k.placeState) ? `<span>📍 ${esc([k.place, k.placeState].filter(Boolean).join(', '))}</span>` : ''}
        ${d.naics ? `<span>NAICS ${esc(d.naics)}</span>` : ''}
        ${deadline ? dueChip(deadline) : ''}
      </div>
      <div class="ops-actions">
        ${samUrl ? `<a class="btn ghost" href="${esc(samUrl)}" target="_blank" rel="noreferrer">View on SAM.gov ↗</a>` : ''}
        ${k.proposalFile ? `<button class="btn go" data-open="${esc(k.proposalFile)}">Open our proposal draft →</button><button class="btn" data-redraft="${esc(k.proposalFile)}">✎ Apply redraft</button><button class="btn" data-compliance="${esc(k.proposalFile)}">🛡 Compliance check</button>` : `<button class="btn go" data-pursue="${esc(d.noticeId)}">🎯 Pursue — draft a proposal</button>`}
        <span class="od-act-result" id="odActResult"></span>
      </div>`;
    if (k.proposalFile) h += '<div class="od-sec" id="odComplianceSec" hidden><div class="od-sec-h">🛡 Compliance check — before you submit</div><div id="odCompliance"></div></div>';
    h += `<div class="od-sec"><div class="od-sec-h">📎 Solicitation documents (the real RFP)</div>`;
    if (d.error) h += `<div class="ops-empty">${esc(d.error)}</div>`;
    else if (!(d.documents || []).length) h += '<div class="ops-empty">No files attached to this notice — read the requirements below or open it on SAM.gov.</div>';
    else h += '<div class="od-docs">' + d.documents.map((doc) => `<a class="od-doc" href="${esc(doc.url)}" target="_blank" rel="noreferrer">⬇ ${esc(doc.name)}</a>`).join('') + '</div>';
    h += '</div>';
    if ((d.contact || []).length) {
      h += '<div class="od-sec"><div class="od-sec-h">☎ Contracting contact</div>' + d.contact.map((c) => `<div class="od-contact">${esc(c.name || 'contact')}${c.title ? ' · ' + esc(c.title) : ''}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${c.phone ? ' · ' + esc(c.phone) : ''}</div>`).join('') + '</div>';
    }
    if (d.description) h += `<div class="od-sec"><div class="od-sec-h">📋 Description &amp; requirements</div><div class="od-desc">${esc(d.description)}</div></div>`;
    // chat with the bid analyst about THIS opportunity/proposal
    curDetail = { noticeId: d.noticeId, file: k.proposalFile || null };
    h += `<div class="od-sec"><div class="od-sec-h">💬 Discuss with Patricia (bid analyst)</div>
      <div class="ag-thread" id="agThread"></div>
      <div class="ag-input"><input id="agMsg" placeholder="Ask, give feedback, or point out what's missing…" autocomplete="off"><button class="btn go" id="agSend">Send</button></div>
      <div class="ag-hint">She knows this opportunity, the draft, and our subs. ${k.proposalFile ? 'Type your edits, then tap <b>✎ Apply redraft</b> above to have her revise the proposal.' : 'Tap <b>🎯 Pursue</b> above to have her draft the proposal.'}</div>
    </div>`;
    el('oppDetailBody').innerHTML = h;
    renderChatThread();
  }
  function renderChatThread() {
    const t = el('agThread'); if (!t) return;
    t.innerHTML = agentChat.length
      ? agentChat.map((m) => `<div class="ag-msg ag-${m.role === 'agent' ? 'a' : 'u'}">${esc(m.content)}</div>`).join('')
      : '<div class="ag-empty">Start a conversation — e.g. “does this need a sub, and do we have one?” or “the sub’s past performance is missing.”</div>';
    t.scrollTop = t.scrollHeight;
  }
  async function sendChat() {
    const inp = el('agMsg'); if (!inp) return;
    const msg = inp.value.trim(); if (!msg) return;
    inp.value = ''; agentChat.push({ role: 'user', content: msg });
    agentChat.push({ role: 'agent', content: '…' }); renderChatThread();
    try {
      const r = await fetch('/api/agent-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: curDetail.file, history: agentChat.filter((m) => m.content !== '…') }) });
      const d = await r.json();
      agentChat[agentChat.length - 1] = { role: 'agent', content: d.reply || d.error || '(no reply)' };
    } catch (e) { agentChat[agentChat.length - 1] = { role: 'agent', content: 'error: ' + e.message }; }
    renderChatThread();
  }
  async function pursueOpp(noticeId) {
    const r = el('odActResult'); if (r) r.textContent = 'drafting… (Patricia is writing the proposal)';
    try {
      const res = await fetch('/api/pursue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ noticeId, op: oppByNotice[noticeId] || null }) });
      const d = await res.json();
      if (r) r.textContent = d.ok ? '✅ drafted — find it in Proposals (review & submit)' : 'couldn’t draft: ' + (d.error || 'try again');
    } catch (e) { if (r) r.textContent = 'error: ' + e.message; }
  }
  async function applyRedraft(file) {
    const fb = (el('agMsg') && el('agMsg').value.trim()) || (agentChat.filter((m) => m.role === 'user').slice(-1)[0] || {}).content || '';
    const r = el('odActResult'); if (r) r.textContent = 'revising the proposal with your feedback…';
    try {
      const res = await fetch('/api/redraft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file, feedback: fb }) });
      const d = await res.json();
      if (r) r.textContent = d.ok && d.saved ? '✅ proposal revised — open it to read the new version' : 'redraft failed: ' + (d.error || 'try again');
    } catch (e) { if (r) r.textContent = 'error: ' + e.message; }
  }
  async function openOppDetail(noticeId) {
    if (!noticeId) return;
    agentChat = []; // fresh conversation per opportunity
    const k = oppByNotice[noticeId] || {};
    el('oppDetailCap').textContent = k.title ? String(k.title).slice(0, 70) : 'Opportunity';
    el('oppDetailBody').innerHTML = '<div class="ops-empty">pulling the RFP from SAM.gov…</div>';
    el('oppDetail').hidden = false;
    try {
      const d = await (await fetch('/api/opp-docs?noticeId=' + encodeURIComponent(noticeId))).json();
      d.noticeId = noticeId;
      renderOppDetail(d);
    } catch (e) { el('oppDetailBody').innerHTML = `<div class="ops-empty">couldn't load: ${esc(e.message)}</div>`; }
  }

  // ── events ──
  body.addEventListener('click', (e) => {
    const a = e.target.closest('[data-approve]'); if (a) return confirmApprove(a.getAttribute('data-approve'));
    const p = e.target.closest('[data-pass]'); if (p) return decide(p.getAttribute('data-pass'), 'pass', p);
    const rv = e.target.closest('[data-review]'); if (rv) return reviewLead(rv.getAttribute('data-review'));
    const o = e.target.closest('[data-open]'); if (o) return openProposal(o.getAttribute('data-open'));
    const dc = e.target.closest('[data-docs]'); if (dc) return openOppDetail(dc.getAttribute('data-docs'));
    const ob = e.target.closest('[data-opp-btn]'); if (ob) return openOppDetail(ob.getAttribute('data-opp-btn'));
    const so = e.target.closest('[data-sub-open]'); if (so) return openSubDetail(so.getAttribute('data-sub-open'));
    const sub = e.target.closest('.ops-card[data-sub]'); if (sub) return openSubDetail(sub.getAttribute('data-sub'));
    const card = e.target.closest('.opp.clickable[data-opp]'); if (card) return openOppDetail(card.getAttribute('data-opp'));
  });
  el('oppDetailBody').addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]'); if (o) return openProposal(o.getAttribute('data-open'));
    const pu = e.target.closest('[data-pursue]'); if (pu) return pursueOpp(pu.getAttribute('data-pursue'));
    const rd = e.target.closest('[data-redraft]'); if (rd) return applyRedraft(rd.getAttribute('data-redraft'));
    const cc = e.target.closest('[data-compliance]'); if (cc) return runCompliance(cc.getAttribute('data-compliance'));
    const rs = e.target.closest('[data-reach]'); if (rs) return reachSub(rs.getAttribute('data-reach'));
    if (e.target.closest('#agSend')) return sendChat();
  });
  el('oppDetailBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'agMsg') { e.preventDefault(); sendChat(); } });
  // business switcher + tabs (delegated, since both bars are re-rendered)
  el('opsBiz').addEventListener('click', (e) => {
    const b = e.target.closest('[data-biz]'); if (!b) return;
    biz = b.getAttribute('data-biz'); tab = curBiz().tabs[0];
    renderBizBar(); renderTabs(); render();
  });
  el('opsTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    tab = t.getAttribute('data-tab'); renderTabs(); render();
  });

  function open() { ops.hidden = false; load(); }
  function close() { ops.hidden = true; }
  // Exposed so the Map view can drill straight into an opportunity's full detail (RFP docs + actions).
  window.JarvisOps = {
    async openOpportunity(noticeId) {
      if (!noticeId) return;
      const mv = el('mapView'); if (mv) mv.hidden = true;
      ops.hidden = false;
      if (!Object.keys(oppByNotice).length) { try { await load(); } catch { /* */ } }
      biz = 'gov'; tab = 'opps'; renderBizBar(); renderTabs(); render();
      openOppDetail(noticeId);
    },
  };
  el('opsBtn').addEventListener('click', open);
  el('opsX').addEventListener('click', close);
  el('opsRefresh').addEventListener('click', load);
  el('opsReaderX').addEventListener('click', () => { el('opsReader').hidden = true; });
  el('oppDetailX').addEventListener('click', () => { el('oppDetail').hidden = true; });
  el('opsConfirmCancel').addEventListener('click', () => { el('opsConfirm').hidden = true; pendingApproveId = null; });
  el('opsConfirmGo').addEventListener('click', () => { const id = pendingApproveId; el('opsConfirm').hidden = true; pendingApproveId = null; if (id) decide(id, 'approve'); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || ops.hidden) return;
    if (!el('opsConfirm').hidden) { el('opsConfirm').hidden = true; pendingApproveId = null; }
    else if (!el('opsReader').hidden) el('opsReader').hidden = true;
    else if (!el('oppDetail').hidden) el('oppDetail').hidden = true;
    else close();
  });
})();
