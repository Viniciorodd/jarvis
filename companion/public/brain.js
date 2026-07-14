// brain.js — a tiny "which brain is answering" chip in the top bar. Shows the current model mode
// (Auto / Local / Claude / OpenRouter) and lets the operator tap to cycle it. Talks to /api/brain.
// Auto = free-first with fallback (the default). Tap cycles Auto → Local → Claude → OpenRouter → Auto.
// Dependency-free; styled from the shared theme CSS vars so it matches light/dark.
(function () {
  const MODES = ['auto', 'local', 'claude', 'openrouter'];
  const LABEL = { auto: 'Auto', local: 'Local', claude: 'Claude', openrouter: 'OpenRouter' };
  // Friendly name for the active local Ollama model, so the chip reads "Hermes 3" — the free local brain —
  // instead of a generic "Local". Keeps Jarvis's brain visible, not invisible plumbing.
  const MODEL_NAME = (id) => { const s = String(id || '').toLowerCase();
    if (s.includes('hermes')) return 'Hermes 3'; if (s.includes('gemma')) return 'Gemma';
    if (s.includes('qwen')) return 'Qwen'; if (s.includes('glm')) return 'GLM';
    return id ? id.split(':')[0] : 'Local'; };

  function mount() {
    const bar = document.getElementById('jTop');
    if (!bar || document.getElementById('brainChip')) return;
    const btn = document.createElement('button');
    btn.id = 'brainChip';
    btn.className = 'j-icon-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Brain mode');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;width:auto;padding:0 10px;font-size:12px;font-weight:500;letter-spacing:.02em;white-space:nowrap;';
    btn.innerHTML = '<span id="brainDot" style="width:8px;height:8px;border-radius:50%;background:var(--dim,#8b909a);display:inline-block"></span><span id="brainLbl">…</span>';
    // place it just before the settings button if present, else append
    const settings = document.getElementById('settingsBtn');
    if (settings) bar.insertBefore(btn, settings); else bar.appendChild(btn);
    btn.addEventListener('click', cycle);
    refresh();
  }

  let state = { prefer: 'auto', have: {}, models: {} };

  function paint() {
    const lbl = document.getElementById('brainLbl');
    const dot = document.getElementById('brainDot');
    if (!lbl || !dot) return;
    const m = state.models || {};
    const localName = MODEL_NAME(m.local);
    // Name the local brain (Hermes 3) when it's the active mode — it reads as a real brain, not "Local".
    lbl.textContent = state.prefer === 'local' ? localName : (LABEL[state.prefer] || 'Auto');
    const have = state.have || {};
    // green = a free brain is reachable (so "never goes dark" holds); amber = only Claude; grey = unknown
    const free = have.local || have.openrouter;
    const color = state.prefer === 'claude' ? (have.claude ? 'var(--teal,#43e6d4)' : 'var(--err,#ff8f80)')
      : free ? 'var(--ok,#5dcaa5)' : (have.claude ? 'var(--warn,#f0b45c)' : 'var(--dim,#8b909a)');
    dot.style.background = color;
    document.getElementById('brainChip').title =
      `Brain: ${state.prefer === 'local' ? localName + ' (local, free)' : LABEL[state.prefer]}\n` +
      `Claude: ${have.claude ? '✓' : '✗'}   ${localName} (local): ${have.local ? '✓' : 'start Ollama'}   OpenRouter: ${have.openrouter ? '✓' : 'add key'}\n` +
      `Tap to cycle. Auto = free-first (${localName} local), falls back so Jarvis never goes dark.`;
  }

  async function refresh() {
    try { const r = await fetch('/api/brain'); state = await r.json(); } catch { /* offline */ }
    paint();
  }

  async function cycle() {
    const i = MODES.indexOf(state.prefer);
    const next = MODES[(i + 1) % MODES.length];
    try {
      const r = await fetch('/api/brain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: next }) });
      state = await r.json();
    } catch { state.prefer = next; }
    paint();
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
  setInterval(refresh, 30000); // keep availability fresh (e.g. Ollama just started)
})();
