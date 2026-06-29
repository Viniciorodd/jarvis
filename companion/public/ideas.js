/* ideas.js — the "Ideas to Approve" inbox. Lists ideas the vault idea-miner proposed (free, local);
   Approve → becomes a task in your vault; Dismiss → it won't nag again. Mine now → run a fresh scan. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function getJSON(url, opts) { try { const r = await fetch(url, opts); return await r.json(); } catch (e) { return { error: e.message }; } }

  function render(data) {
    const list = $('idList'); list.innerHTML = '';
    const pending = (data.pending || []);
    $('idLast').textContent = data.lastRun ? '· last run ' + new Date(data.lastRun).toLocaleString() : '· not run yet';
    const c = data.counts || {};
    $('idCounts').innerHTML = `<span>${pending.length} pending</span><span>${c.approved || 0} approved</span><span>${c.dismissed || 0} dismissed</span>`;
    if (!pending.length) { list.innerHTML = `<div class="gc-empty">No pending ideas. Tap <b>Mine now</b> to scan your vault.</div>`; return; }
    pending.forEach((it) => {
      const row = document.createElement('div'); row.className = 'id-row id-fade'; row.dataset.id = it.id;
      row.innerHTML = `<div class="id-eff ${esc(it.effort)}">${esc(it.effort || 'M')}</div>`
        + `<div class="id-body"><div class="id-title">${esc(it.title)}</div>`
        + `${it.why ? `<div class="id-why">${esc(it.why)}</div>` : ''}`
        + `${it.category ? `<span class="id-cat">${esc(it.category)}</span>` : ''}</div>`
        + `<div class="id-actions"><button class="id-btn approve">Approve</button><button class="id-btn dismiss">Dismiss</button></div>`;
      row.querySelector('.approve').onclick = () => decide(it.id, 'approve', row);
      row.querySelector('.dismiss').onclick = () => decide(it.id, 'dismiss', row);
      list.appendChild(row);
    });
  }

  async function decide(id, action, row) {
    row.style.opacity = '.4';
    const r = await getJSON('/api/ideas/' + action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    if (r && (r.ok || r.idea)) {
      $('idStatus').textContent = action === 'approve' ? '✓ Approved — added to your vault tasks.' : '✓ Dismissed.';
      row.remove();
      if (!$('idList').querySelector('.id-row')) load(); // refresh counts/empty state
    } else { row.style.opacity = '1'; $('idStatus').textContent = 'Error: ' + ((r && (r.reason || r.error)) || 'failed'); }
  }

  async function load() { const data = await getJSON('/api/ideas'); if (data.error) { $('idEmpty').textContent = 'Error: ' + data.error; return; } render(data); }

  $('idMine').onclick = async () => {
    const b = $('idMine'); b.disabled = true; const t = b.textContent; b.textContent = '⏳ Mining (local)…';
    $('idStatus').textContent = 'Scanning your vault on the free local model — this can take a moment…';
    const r = await getJSON('/api/ideas/run', { method: 'POST' });
    b.disabled = false; b.textContent = t;
    if (r && r.ok) { $('idStatus').textContent = `✓ Found ${r.added} new idea(s) via ${r.provider || 'local'}.`; load(); }
    else { $('idStatus').textContent = 'Mining failed: ' + ((r && r.reason) || 'unknown') + ' (is Ollama running with a model loaded?)'; }
  };

  load();
})();
