// strip.js — the Trillion-style ALWAYS-VISIBLE status strip (from Kevin Fremon's UI breakdown:
// "$6,910 · 520 TH/s" pinned to the canvas — live numbers on every screen, never buried in a menu).
// Jarvis's version: Pipeline $ · Projected profit · Waiting-on-you · Open deals, straight from the
// deal ledger (/api/deals). Tap anywhere on it to open the Deal Room. Self-contained like brain.js.
(function () {
  const fmt$ = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  function mount() {
    const home = document.getElementById('jHomeView');
    if (!home || document.getElementById('statusStrip')) return;
    const el = document.createElement('a');
    el.id = 'statusStrip';
    el.href = '/dealroom';
    el.title = 'Live from the deal ledger — tap for the Deal Room';
    el.style.cssText = 'display:none;align-items:center;gap:14px;margin:8px 14px 0;padding:9px 16px;'
      + 'border:1px solid var(--line,rgba(255,255,255,.08));border-radius:99px;background:var(--panel,rgba(255,255,255,.03));'
      + 'font-size:12.5px;text-decoration:none;color:var(--muted,#8a8fa0);overflow-x:auto;white-space:nowrap;-webkit-tap-highlight-color:transparent;';
    home.insertBefore(el, home.firstChild);
    refresh();
  }

  function chip(label, value, hot) {
    return `<span style="display:inline-flex;gap:6px;align-items:baseline;">`
      + `<b style="font-family:Georgia,serif;font-weight:400;font-size:15px;color:${hot ? 'var(--warn,#f59e0b)' : 'var(--accent,#7fd6c2)'};">${value}</b>`
      + `<span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.75;">${label}</span></span>`;
  }

  async function refresh() {
    const el = document.getElementById('statusStrip');
    if (!el) return;
    try {
      const d = await (await fetch('/api/deals', { cache: 'no-store' })).json();
      const open = (d.deals || []).filter((x) => x.stage !== 'closed').length;
      if (!open && !d.pipeline) { el.style.display = 'none'; return; } // quiet until there's something to show
      el.innerHTML = [
        chip('pipeline', fmt$(d.pipeline)),
        chip('profit', fmt$(d.profit)),
        chip('need you', String(d.needsYou || 0), (d.needsYou || 0) > 0),
        chip('open deals', String(open)),
      ].join('<span style="opacity:.25;">·</span>');
      el.style.display = 'flex';
    } catch { /* strip is glanceable sugar — never an error surface */ }
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
  setInterval(refresh, 60000);
})();
