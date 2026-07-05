// agents.js — TEAM BUCKETS (Trillion's top-bar pattern: one avatar per sub-agent; tap → drop-down
// with role, model, what they're on, and anything waiting on your approval — approve inline). An
// agent with an open gate glows gold and jumps to the front, like Trillion's approval orb floating
// up. Self-contained like brain.js / health.js; data from /api/team; approvals via /api/approve
// (the SAME control-plane gate every other surface uses — nothing new can slip past doctrine §9).
(function () {
  const POD_HUE = { gov: '#c9a862', exec: '#7ea6d9', 'chief-of-staff': '#9b8ec4', fiverr: '#d98a7e', saas: '#6fbf8f', vault: '#8a8fa0', 'research-risk': '#d9b47e', re: '#7ec4b8', legal: '#b0b6c9', personal: '#c98aa8' };
  const DOT = { need: 'var(--warn,#f59e0b)', work: 'var(--ok,#10b981)', idle: 'rgba(255,255,255,.25)' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let team = [];

  function mount() {
    const home = document.getElementById('jHomeView');
    if (!home || document.getElementById('teamRow')) return;
    const row = document.createElement('div');
    row.id = 'teamRow';
    row.style.cssText = 'display:none;align-items:center;gap:10px;margin:10px 14px 0;padding:2px 4px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;';
    home.insertBefore(row, home.firstChild);
    document.addEventListener('click', (ev) => { // tap-away closes any open bucket
      const b = document.getElementById('agentBucket');
      if (b && !b.contains(ev.target) && !ev.target.closest('.agent-av')) b.remove();
    });
    refresh();
  }

  function avatar(a) {
    const hue = POD_HUE[a.pod] || '#8a8fa0';
    const glow = a.state === 'need' ? `box-shadow:0 0 10px 2px rgba(245,158,11,.45);` : '';
    const pulse = a.state === 'work' ? 'animation:agPulse 2.2s ease-in-out infinite;' : '';
    return `<button class="agent-av" data-cn="${esc(a.codename)}" title="${esc(a.nickname)} — ${esc(a.title)}" type="button" style="position:relative;flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:1.5px solid ${hue};${glow}${pulse}background:var(--panel,rgba(255,255,255,.05));color:var(--cream,#e8e4da);font:600 13px Georgia,serif;cursor:pointer;">
      ${esc((a.nickname || '?')[0])}
      <span style="position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:${DOT[a.state] || DOT.idle};border:2px solid var(--bg,#0a0d12);"></span>
    </button>`;
  }

  function paint() {
    const row = document.getElementById('teamRow');
    if (!row) return;
    if (!team.length) { row.style.display = 'none'; return; }
    if (!document.getElementById('agPulseCss')) {
      const st = document.createElement('style'); st.id = 'agPulseCss';
      st.textContent = '@keyframes agPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}';
      document.head.appendChild(st);
    }
    row.innerHTML = `<span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#8a8fa0);flex:0 0 auto;">Team</span>` + team.map(avatar).join('');
    row.style.display = 'flex';
    row.querySelectorAll('.agent-av').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); openBucket(b.dataset.cn, b); }));
  }

  function openBucket(cn, anchor) {
    const old = document.getElementById('agentBucket'); if (old) { old.remove(); if (old.dataset.cn === cn) return; }
    const a = team.find((t) => t.codename === cn); if (!a) return;
    const hue = POD_HUE[a.pod] || '#8a8fa0';
    const card = document.createElement('div');
    card.id = 'agentBucket'; card.dataset.cn = cn;
    const r = anchor.getBoundingClientRect();
    card.style.cssText = `position:fixed;left:${Math.min(Math.max(8, r.left - 60), window.innerWidth - 288)}px;top:${r.bottom + 8}px;width:280px;z-index:60;`
      + 'background:var(--panel2,#12161f);border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.5);';
    const gates = (a.approvals || []).map((g) => `
      <div style="border-top:1px solid var(--line,rgba(255,255,255,.08));padding:8px 0 4px;">
        <div style="font-size:12px;line-height:1.4;color:var(--cream,#e8e4da);margin-bottom:6px;">⭑ ${esc(g.rationale || g.action)}</div>
        <div style="display:flex;gap:6px;">
          <button data-id="${esc(g.id)}" data-d="approve" class="ag-gate" type="button" style="flex:1;border:1px solid rgba(16,185,129,.5);color:var(--ok,#10b981);background:none;border-radius:8px;padding:4px 0;font-size:11.5px;cursor:pointer;">Approve</button>
          <button data-id="${esc(g.id)}" data-d="reject" class="ag-gate" type="button" style="flex:1;border:1px solid var(--line,rgba(255,255,255,.15));color:var(--muted,#8a8fa0);background:none;border-radius:8px;padding:4px 0;font-size:11.5px;cursor:pointer;">Deny</button>
        </div>
      </div>`).join('');
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="width:34px;height:34px;border-radius:50%;border:1.5px solid ${hue};display:inline-flex;align-items:center;justify-content:center;font:600 14px Georgia,serif;color:var(--cream,#e8e4da);">${esc((a.nickname || '?')[0])}</span>
        <div style="flex:1;">
          <div style="font:400 15px Georgia,serif;color:var(--cream,#e8e4da);">${esc(a.nickname)} <span style="opacity:.5;font-size:12px;">· ${esc(a.title)}</span></div>
          <div style="font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#8a8fa0);">${esc(a.pod)} · ${esc(a.model)}${a.state === 'work' ? ' · working' : a.state === 'need' ? ' · needs you' : ''}</div>
        </div>
      </div>
      ${a.text ? `<div style="font-size:12px;color:var(--muted,#aab;);opacity:.85;line-height:1.45;margin:4px 0 6px;">“${esc(a.text)}”</div>` : ''}
      ${a.does ? `<div style="font-size:11.5px;color:var(--muted,#8a8fa0);line-height:1.45;margin-bottom:4px;">${esc(a.does)}</div>` : ''}
      ${gates || ''}`;
    document.body.appendChild(card);
    card.querySelectorAll('.ag-gate').forEach((btn) => btn.addEventListener('click', async () => {
      btn.textContent = '…';
      try { await fetch('/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: btn.dataset.id, decision: btn.dataset.d }) }); } catch { /* gate surface shows it */ }
      card.remove(); refresh();
    }));
  }

  async function refresh() {
    try { const d = await (await fetch('/api/team', { cache: 'no-store' })).json(); team = d.team || []; } catch { team = []; }
    paint();
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
  setInterval(refresh, 30000);
})();
