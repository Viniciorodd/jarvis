// hud.js — the COMMAND-WALL LEFT PANEL, living on the JARVIS tab: lifetime banked · net · AI spend ·
// opportunities · needs-you · proposals ready · subcontractors · pipeline value, plus the agent
// roster and connectors — the same numbers and math as the Command wall (command.js), pulled from the
// same four endpoints, so the two can never disagree. Desktop only (≥1100px; the phone Home already
// carries the strip + team row). Glass over the brain; gold headers; tap a stat to jump.
(function () {
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stateColor = (s) => s === 'need' ? 'var(--warn,#f0b45c)' : (s && s !== 'idle') ? 'var(--active,#5dcaa5)' : 'var(--line,rgba(255,255,255,.22))';
  let data = null;

  function mount() {
    if (document.getElementById('jarvisHud')) return;
    const hud = document.createElement('aside');
    hud.id = 'jarvisHud';
    hud.style.cssText = 'position:fixed;left:14px;top:64px;bottom:96px;width:236px;z-index:3;display:none;'
      + 'overflow-y:auto;scrollbar-width:none;padding:14px;border:1px solid var(--line,rgba(255,255,255,.08));'
      + 'border-radius:14px;background:var(--panel,rgba(12,15,21,.72));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);';
    document.body.appendChild(hud);
    const sync = () => {
      const on = document.getElementById('jTalkView')?.classList.contains('active') && innerWidth >= 1100;
      hud.style.display = on ? 'block' : 'none';
      if (on && !data) refresh();
    };
    new MutationObserver(sync).observe(document.getElementById('jTalkView') || document.body, { attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', sync);
    sync();
    setInterval(() => { if (hud.style.display !== 'none') refresh(); }, 60000);
  }

  function tile(k, v, sub, warn, href) {
    return `<a href="${href || '#'}" ${href ? '' : 'onclick="return false"'} style="display:block;text-decoration:none;padding:8px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.05));">
      <div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim,#8a8fa0);">${esc(k)}</div>
      <div style="font:400 19px var(--font,Inter,sans-serif);color:${warn ? 'var(--warn,#f0b45c)' : 'var(--teal,#43e6d4)'};line-height:1.3;">${esc(v)}</div>
      ${sub ? `<div style="font-size:10px;color:var(--dim,#8a8fa0);opacity:.75;">${esc(sub)}</div>` : ''}
    </a>`;
  }

  async function refresh() {
    const j = (p) => fetch(p, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
    const [dash, ops, floor, conn] = await Promise.all([j('/api/dashboard'), j('/api/operations'), j('/api/floor'), j('/api/connectors')]);
    data = true;
    // identical derivations to command.js render() — one source of math, two surfaces
    const leads = (ops.leads || []).length, opps = (ops.opportunities || []).length;
    const props = (ops.proposals || []).length, crm = (ops.crm || []).length;
    const aiSpend = (dash.spend && dash.spend.total) || 0;
    const aiToday = (dash.spend && dash.spend.today) || 0;
    const income = (dash.hq && dash.hq.earned) || 0;
    const net = income - aiSpend;
    const bids = (ops.opportunities || []).filter((o) => /bid/i.test(o.recommendation || '')).length;

    const people = [];
    for (const r of (floor.rooms || [])) for (const p of (r.people || [])) people.push({ ...p, podLabel: r.label });
    const active = people.filter((p) => p.state && p.state !== 'idle').length;
    const workers = people.filter((p) => p.state && p.state !== 'idle').slice(0, 6);

    document.getElementById('jarvisHud').innerHTML = `
      <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal,#43e6d4);margin-bottom:4px;font-family:var(--font,Inter,sans-serif);">Command</div>
      ${tile('Lifetime banked', money(income), 'from HQ floor')}
      ${tile('Net (income − AI)', money(net), net < 0 ? 'AI running ahead of income' : 'income minus AI cost', net < 0)}
      ${tile('AI spend', money(aiSpend), 'today ' + money(aiToday))}
      ${tile('Opportunities', opps, 'scored on SAM.gov', false, '/govcon')}
      ${tile('Needs you', leads, leads > 0 ? 'waiting on approval' : 'queue clear', leads > 0)}
      ${tile('Proposals ready', props, 'drafted — you sign & send', props > 0, '/govcon')}
      ${tile('Subcontractors', crm, 'in CRM')}
      ${tile('Pipeline value', bids ? '~' + money(bids * 40000) : '$0', 'bid-worthy × avg', false, '/dealroom')}
      <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal,#43e6d4);margin:14px 0 4px;font-family:var(--font,Inter,sans-serif);">Agents <span style="color:var(--dim,#8a8fa0);letter-spacing:0;text-transform:none;">${active}/${people.length} active</span></div>
      ${(workers.length ? workers : people.slice(0, 6)).map((p) => `
        <div style="display:flex;gap:7px;align-items:baseline;padding:3px 0;font-size:11.5px;color:var(--cream,#e8e4da);">
          <span style="width:7px;height:7px;border-radius:50%;flex:0 0 auto;align-self:center;background:${stateColor(p.state)};"></span>
          <span style="flex:0 0 auto;">${esc(p.nickname)}</span>
          <span style="color:var(--dim,#8a8fa0);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.text || p.title || '')}</span>
        </div>`).join('')}
      <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--teal,#43e6d4);margin:14px 0 4px;font-family:var(--font,Inter,sans-serif);">Connectors</div>
      ${((conn.connectors || []).map((c) => `
        <div style="display:flex;gap:7px;align-items:center;padding:2px 0;font-size:11px;color:var(--cream,#e8e4da);">
          <span style="width:6px;height:6px;border-radius:50%;background:${c.on ? 'var(--active,#5dcaa5)' : 'var(--line,rgba(255,255,255,.2))'};"></span>${esc(c.name)}
        </div>`).join('')) || '<span style="font-size:11px;color:var(--dim,#8a8fa0);">none configured</span>'}`;
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
