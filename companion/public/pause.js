// pause.js — the KILL SWITCH chip (Trillion Tier 6). One tap pauses ALL proactive behavior — the
// scheduler stops firing, no agent acts on its own — while you can still talk to Jarvis. Tap again to
// resume. Same self-contained top-bar pattern as brain.js / health.js. Talks to /api/pause.
(function () {
  let cur = { active: false, needsDeploy: false, unknown: true };

  function mount() {
    const bar = document.getElementById('jTop');
    if (!bar || document.getElementById('pauseChip')) return;
    const btn = document.createElement('button');
    btn.id = 'pauseChip';
    btn.className = 'j-icon-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Pause proactive behavior');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;width:auto;padding:0 10px;font-size:12px;font-weight:500;letter-spacing:.02em;white-space:nowrap;';
    btn.innerHTML = '<span id="pauseIco">⏸</span><span id="pauseLbl" style="display:none"></span>';
    const anchor = document.getElementById('healthChip') || document.getElementById('brainChip') || document.getElementById('settingsBtn');
    if (anchor) bar.insertBefore(btn, anchor); else bar.appendChild(btn);
    btn.addEventListener('click', toggle);
    refresh();
  }

  function paint() {
    const ico = document.getElementById('pauseIco');
    const lbl = document.getElementById('pauseLbl');
    const chip = document.getElementById('pauseChip');
    if (!chip) return;
    if (cur.needsDeploy || cur.unknown) {
      ico.textContent = '⏸'; ico.style.opacity = '.35'; lbl.style.display = 'none';
      chip.title = cur.needsDeploy ? 'Kill switch needs the latest control-plane deployed (scripts/update-nas.sh).' : 'Checking…';
      return;
    }
    if (cur.active) {
      ico.textContent = '▶'; ico.style.opacity = '1';
      lbl.textContent = 'paused'; lbl.style.display = 'inline'; lbl.style.color = 'var(--warn,#f0b45c)';
      chip.title = `⏸ Proactive behavior is PAUSED${cur.until ? ' until ' + new Date(cur.until).toLocaleTimeString() : ''} — no scans, no scheduled jobs, no agent acts on its own. You can still talk to Jarvis. Tap to resume.`;
    } else {
      ico.textContent = '⏸'; ico.style.opacity = '.8'; lbl.style.display = 'none';
      chip.title = 'Proactive behavior is LIVE (scheduler running on cadence). Tap to pause everything — Jarvis stops acting on her own until you resume.';
    }
  }

  async function refresh() {
    try { cur = await (await fetch('/api/pause', { cache: 'no-store' })).json(); cur.unknown = false; }
    catch { cur = { unknown: true }; }
    paint();
  }

  async function toggle() {
    if (cur.needsDeploy || cur.unknown) { refresh(); return; }
    try {
      cur = await (await fetch('/api/pause', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: !cur.active }) })).json();
      cur.unknown = false;
    } catch { /* keep prior state */ }
    paint();
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
  setInterval(refresh, 60000);
})();
