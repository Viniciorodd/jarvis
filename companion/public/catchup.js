// catchup.js — the "While you were away" panel (Trillion Tier 5: held notices, catch-up-on-return).
// On open, anything noteworthy since you last looked is shown ONCE as a calm card at the top of Home:
// brief lines in the Trillion voice (direct, numbers where they exist), one tap to clear. Nothing is
// ever fired into the void and lost — and nothing nags twice. Talks to /api/catchup.
(function () {
  const AGO = (ts) => {
    const m = Math.max(1, Math.round((Date.now() - new Date(ts)) / 60000));
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  };
  const ICON = { 'needs-you': '⭑', error: '⚠', update: '·' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function mount() {
    const home = document.getElementById('jHomeView');
    if (!home || document.getElementById('catchupCard')) return;
    let data;
    try { data = await (await fetch('/api/catchup', { cache: 'no-store' })).json(); } catch { return; }
    if (!data || !data.count) return; // quiet by default — no panel when there's nothing held

    const card = document.createElement('div');
    card.id = 'catchupCard';
    card.style.cssText = 'margin:10px 14px 4px;padding:14px 16px 10px;border:1px solid var(--line,rgba(255,255,255,.08));border-radius:14px;background:var(--panel,rgba(255,255,255,.03));';
    const rows = data.items.map((it) => `
      <div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;font-size:13px;line-height:1.45;">
        <span style="opacity:.7;${it.kind === 'needs-you' ? 'color:var(--warn,#f0b45c);' : it.kind === 'error' ? 'color:var(--err,#ff8f80);' : ''}">${ICON[it.kind] || '·'}</span>
        <span style="flex:1;color:var(--cream,#e8e4da);">${esc(it.text)}</span>
        <span style="opacity:.45;font-size:11px;white-space:nowrap;">${AGO(it.ts)}</span>
      </div>`).join('');
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
        <span style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;">While you were away</span>
        <span style="font-size:11px;opacity:.45;">${data.count} thing${data.count === 1 ? '' : 's'}</span>
      </div>
      ${rows}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
        <button id="catchupSay" type="button" title="Hear it in Jarvis's voice" style="background:none;border:1px solid var(--line,rgba(255,255,255,.14));border-radius:99px;padding:5px 14px;font-size:12px;color:var(--cream,#e8e4da);cursor:pointer;">🔊 Brief me</button>
        <button id="catchupDone" type="button" style="background:none;border:1px solid var(--line,rgba(255,255,255,.14));border-radius:99px;padding:5px 16px;font-size:12px;color:var(--cream,#e8e4da);cursor:pointer;">Caught up ✓</button>
      </div>`;
    home.insertBefore(card, home.firstChild);
    // 🔊 the Trillion touch: the catch-up SPOKEN, brief and direct, in her voice (app.js's speak()).
    document.getElementById('catchupSay').addEventListener('click', () => {
      const needs = data.items.filter((i) => i.kind === 'needs-you');
      const parts = [`While you were away: ${data.count} thing${data.count === 1 ? '' : 's'}.`];
      if (needs.length) parts.push(`${needs.length} need${needs.length === 1 ? 's' : ''} you: ${needs.slice(0, 3).map((i) => i.text).join('. ')}.`);
      const rest = data.items.filter((i) => i.kind !== 'needs-you').slice(0, 3).map((i) => i.text);
      if (rest.length) parts.push(rest.join('. ') + '.');
      const say = parts.join(' ');
      if (typeof window.speak === 'function') window.speak(say);
      else if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(say));
    });
    document.getElementById('catchupDone').addEventListener('click', async () => {
      try { await fetch('/api/catchup/seen', { method: 'POST' }); } catch { /* dismiss anyway */ }
      card.style.transition = 'opacity .25s'; card.style.opacity = '0';
      setTimeout(() => card.remove(), 260);
    });
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
