// health.js — a small "is the brain reachable" pill in the top bar. The companion (this UI) can load
// even when the control-plane on the NAS is unreachable — but then approvals, commands, "walk me
// through it", and the live gov board silently do nothing. This pill makes that state VISIBLE: green
// when the control-plane answers, red ("brain offline") when it doesn't — so "Jarvis isn't working"
// becomes a specific, self-explaining signal instead of a dead-feeling shell. Talks to /api/health.
// Same self-contained pattern as brain.js; styled from the shared theme vars.
(function () {
  function mount() {
    const bar = document.getElementById('jTop');
    if (!bar || document.getElementById('healthChip')) return;
    const btn = document.createElement('button');
    btn.id = 'healthChip';
    btn.className = 'j-icon-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'System health');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;width:auto;padding:0 10px;font-size:12px;font-weight:500;letter-spacing:.02em;white-space:nowrap;';
    btn.innerHTML = '<span id="healthDot" style="width:8px;height:8px;border-radius:50%;background:var(--muted,#888);display:inline-block"></span><span id="healthLbl" style="display:none"></span>';
    // place it just before the brain chip / settings button
    const anchor = document.getElementById('brainChip') || document.getElementById('settingsBtn');
    if (anchor) bar.insertBefore(btn, anchor); else bar.appendChild(btn);
    btn.addEventListener('click', refresh); // tap to re-check immediately
    refresh();
  }

  function paint(h) {
    const dot = document.getElementById('healthDot');
    const lbl = document.getElementById('healthLbl');
    const chip = document.getElementById('healthChip');
    if (!dot || !chip) return;
    const ok = h && h.controlPlane;
    const unknown = !h;
    dot.style.background = unknown ? 'var(--muted,#888)' : ok ? 'var(--ok,#10b981)' : 'var(--danger,#e44)';
    // only show a text label when something is WRONG — keep the bar calm when healthy
    if (lbl) {
      if (!ok && !unknown) { lbl.textContent = 'brain offline'; lbl.style.display = 'inline'; lbl.style.color = 'var(--danger,#e44)'; }
      else { lbl.style.display = 'none'; }
    }
    chip.title = unknown
      ? 'Checking the control-plane…'
      : ok
        ? `Brain online — control-plane reachable (${h.cpUrl}, ${h.ms}ms).\nApprovals, commands and the gov board are live. Tap to re-check.`
        : `⚠ Brain OFFLINE — cannot reach the control-plane at ${h.cpUrl}${h.error ? ' (' + h.error + ')' : ''}.\nThe screen loads but approvals/commands/gov board won't respond. Start the control-plane (or fix the NAS/Tailscale link). Tap to re-check.`;
  }

  async function refresh() {
    try { const r = await fetch('/api/health', { cache: 'no-store' }); paint(await r.json()); }
    catch { paint({ controlPlane: false, cpUrl: 'companion', error: 'companion unreachable' }); }
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
  setInterval(refresh, 30000);
})();
