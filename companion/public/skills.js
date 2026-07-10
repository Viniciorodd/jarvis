// skills.js — the SKILLS RAIL (Trillion's left panel: "all of the different skills… so I can see
// which one's being invoked as I ask her to do certain tasks"). A slim ⚡ tab on the left edge slides
// out a dark rail listing what Jarvis can actually do — derived from the event log, so it's the real
// capability set — with the ones firing RIGHT NOW pulsing gold, recent ones bright, older ones dim
// with an age stamp. Self-contained; data from /api/skills (pure reduction in pods/skills.mjs).
(function () {
  let open = false, timer = null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount() {
    if (document.getElementById('skillsTab')) return;
    const css = document.createElement('style');
    css.textContent = '@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.45}}'
      + '#skillsRail::-webkit-scrollbar{width:0}';
    document.head.appendChild(css);

    const tab = document.createElement('button');
    tab.id = 'skillsTab'; tab.type = 'button'; tab.title = 'Skills — what Jarvis can do (lights up as they run)';
    tab.textContent = '⚡';
    tab.style.cssText = 'position:fixed;right:0;top:45%;z-index:55;width:26px;height:52px;border:1px solid var(--line,rgba(255,255,255,.12));border-right:none;'
      + 'border-radius:10px 0 0 10px;background:var(--panel,rgba(18,22,31,.92));color:var(--dim,#8b909a);font-size:14px;cursor:pointer;';
    document.body.appendChild(tab);

    const rail = document.createElement('div');
    rail.id = 'skillsRail';
    rail.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:252px;z-index:56;transform:translateX(105%);transition:transform .22s ease;'
      + 'background:var(--panel2,rgba(14,17,24,.97));border-left:1px solid var(--line,rgba(255,255,255,.1));padding:16px 14px;overflow-y:auto;backdrop-filter:blur(8px);';
    rail.innerHTML = '<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim,#8b909a);margin-bottom:10px;">Skills · live</div><div id="skillsList"></div>';
    document.body.appendChild(rail);

    tab.addEventListener('click', () => toggle());
    document.addEventListener('click', (ev) => { if (open && !rail.contains(ev.target) && ev.target !== tab) toggle(false); });
  }

  function toggle(force) {
    open = force != null ? force : !open;
    const rail = document.getElementById('skillsRail');
    rail.style.transform = open ? 'translateX(0)' : 'translateX(105%)'; // rail lives on the RIGHT now (HUD owns the left)
    document.getElementById('skillsTab').style.color = open ? 'var(--warn,#f0b45c)' : 'var(--dim,#8b909a)';
    if (open) { refresh(); timer = setInterval(refresh, 20000); }
    else if (timer) { clearInterval(timer); timer = null; }
  }

  function rowHtml(s) {
    const color = s.live ? 'var(--warn,#f0b45c)' : s.recent ? 'var(--cream,#e8e4da)' : 'var(--dim,#8b909a)';
    const pulse = s.live ? 'animation:skPulse 1.4s ease-in-out infinite;' : '';
    return `<div style="display:flex;align-items:baseline;gap:8px;padding:5px 2px;border-bottom:1px solid var(--line,rgba(255,255,255,.04));">
      <span style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;align-self:center;background:${s.live ? 'var(--warn,#f0b45c)' : s.recent ? 'var(--ok,#5dcaa5)' : 'var(--line,rgba(255,255,255,.15))'};${pulse}"></span>
      <span style="flex:1;font-size:12.5px;color:${color};">${esc(s.label)}</span>
      <span style="font-size:10px;color:var(--dim,#8b909a);opacity:.6;flex:0 0 auto;">${esc(s.agoText || '')}</span>
    </div>`;
  }

  async function refresh() {
    try {
      const d = await (await fetch('/api/skills', { cache: 'no-store' })).json();
      const list = document.getElementById('skillsList');
      if (!list) return;
      const byPod = {};
      for (const s of (d.skills || [])) (byPod[s.pod] = byPod[s.pod] || []).push(s);
      list.innerHTML = Object.entries(byPod).map(([pod, rows]) => `
        <div style="margin-bottom:12px;">
          <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim,#8b909a);opacity:.7;margin:6px 0 2px;">${esc(pod)}</div>
          ${rows.map(rowHtml).join('')}
        </div>`).join('') || '<div style="font-size:12px;color:var(--dim,#8b909a);">No activity yet — skills appear as Jarvis works.</div>';
    } catch { /* rail is a window, never an error surface */ }
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
