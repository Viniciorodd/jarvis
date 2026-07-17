// wall.js — the JARVIS (Talk) screen style + open-conversation voice.
//
// TWO STYLES, one toggle (Settings → "Jarvis screen"), persisted in localStorage 'jarvis-talk-style':
//   • 'calm'  (DEFAULT, 2026-07-18 — the Stitch redesign): the normal Talk view — the orb + the two glance
//              columns (Today / Latest) + the transcript. Quiet. This is what the operator is testing this week.
//   • 'wall'  (the cinematic "Trillion Wall", the old default): a full-bleed neural brain (neural.js) with the
//              exchange rendered as big centered text, no side columns — modeled on Kevin Fremon's videos.
// The operator can flip between them any time; the choice sticks. Nothing is deleted — 'wall' is one tap away.
//
// OPEN CONVERSATION (hands-free) is INDEPENDENT of the look and stays available in BOTH styles: when Jarvis
// finishes speaking, the mic re-opens by itself (VAD auto-stop closes the loop) — talk → she answers → talk,
// no clicking. Toggle is the "🎙 open conversation" chip on the Talk screen; barge-in still works.
(function () {
  // The cinematic transform — applied ONLY in 'wall' style.
  const WALL_CSS = `
  #jTalkView #orb, #jTalkView .j-talk-top, #jTalkView .j-talk-glance { display:none !important; }
  #jTalkView .j-stage { position:static !important; min-height:0 !important; background:none !important; }
  #jTalkView .orb-center { position:fixed !important; left:50%; bottom:132px; top:auto !important; transform:translateX(-50%); z-index:2; }
  #jTalkView .orb-center .hint { font-size:12px; letter-spacing:.14em; text-transform:uppercase; opacity:.45; }
  #jTalkView #transcript {
    position:fixed; left:50%; top:40%; transform:translate(-50%,-50%);
    width:min(760px,92vw); max-height:58vh; overflow:hidden;
    display:flex; flex-direction:column; justify-content:flex-end; align-items:center;
    gap:16px; text-align:center; background:none !important; border:none !important; padding:0 !important;
    pointer-events:none; z-index:1;
  }
  #jTalkView #transcript .msg { background:none !important; border:none !important; box-shadow:none !important; max-width:100% !important; padding:0 !important; margin:0 !important; animation:wallIn .45s ease both; }
  #jTalkView #transcript .msg.you { font:600 clamp(20px,4.2vw,34px)/1.28 var(--font,Inter,sans-serif); color:var(--cream,#f3f4f6); text-transform:uppercase; letter-spacing:.035em; text-shadow:0 2px 26px rgba(var(--teal-rgb,67,230,212),.4), 0 1px 4px rgba(0,0,0,.7); }
  #jTalkView #transcript .msg.j { font:400 clamp(15px,2.7vw,20px)/1.55 var(--font,Inter,sans-serif); color:var(--cream,#f3f4f6); text-shadow:0 1px 18px rgba(0,0,0,.75); }
  #jTalkView #transcript .msg.j .who { display:block; font:600 10px/1 var(--font,Inter,sans-serif); color:var(--teal,#43e6d4); letter-spacing:.28em; margin-bottom:7px; }
  #jTalkView #transcript .msg.err { color:var(--err,#ff8f80); font-size:14px; }
  #jTalkView #transcript .msg:not(:nth-last-child(-n+3)) { display:none; }
  @keyframes wallIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
  #jTalkView .visual{ position:fixed !important; left:50% !important; top:auto !important; bottom:190px !important; transform:translateX(-50%); width:min(680px,94vw); max-height:46vh; overflow:auto; z-index:4; background:var(--panel,rgba(14,17,24,.92)) !important; border:1px solid rgba(var(--teal-rgb,67,230,212),.35) !important; border-radius:14px !important; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); box-shadow:0 18px 60px rgba(0,0,0,.55); pointer-events:auto; }
  #jTalkView .visual img{ max-width:100%; border-radius:10px; }
  `;
  // The open-conversation chip — styled in BOTH styles (it's a voice control, not a look).
  const CHIP_CSS = `
  #handsFreeChip { position:fixed; right:14px; bottom:132px; z-index:3; border:1px solid var(--line,rgba(255,255,255,.09)); border-radius:99px; padding:6px 14px; background:var(--panel,rgba(14,17,24,.85)); color:var(--dim,#8b909a); font:500 11.5px var(--font,Inter,sans-serif); letter-spacing:.04em; cursor:pointer; display:none; backdrop-filter:blur(6px); }
  #handsFreeChip.on { color:var(--teal,#43e6d4); border-color:rgba(var(--teal-rgb,67,230,212),.45); }
  `;

  const STYLE_KEY = 'jarvis-talk-style';
  const HF_KEY = 'jarvisHandsFree';
  function getStyle() { try { return localStorage.getItem(STYLE_KEY) === 'wall' ? 'wall' : 'calm'; } catch (e) { return 'calm'; } }
  let enabled = (function () { try { return localStorage.getItem(HF_KEY) !== '0'; } catch (e) { return true; } })(); // hands-free default ON

  function addStyleEl(id, css) { if (document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s); }

  function applyWallStyle() {
    const wall = getStyle() === 'wall';
    const existing = document.getElementById('wallCss');
    if (wall && !existing) addStyleEl('wallCss', WALL_CSS);
    else if (!wall && existing) existing.remove();
    paintStyleBtn();
  }

  function setStyle(s) { try { localStorage.setItem(STYLE_KEY, s === 'wall' ? 'wall' : 'calm'); } catch (e) { /* */ } applyWallStyle(); }

  function paintStyleBtn() {
    const b = document.getElementById('jarvisStyleBtn'); if (!b) return;
    const wall = getStyle() === 'wall';
    b.textContent = wall ? '🖥 Jarvis screen: Wall (cinematic)' : '🖥 Jarvis screen: Calm';
    b.title = wall ? 'Cinematic wall — neural brain + big transcript. Tap for the calm orb view.' : 'Calm — orb + your Today/Latest glance + transcript (the new default). Tap for the cinematic wall.';
  }

  function mount() {
    addStyleEl('handsFreeCss', CHIP_CSS);
    applyWallStyle();

    // the open-conversation chip (both styles)
    if (!document.getElementById('handsFreeChip')) {
      const chip = document.createElement('button');
      chip.id = 'handsFreeChip'; chip.type = 'button';
      document.body.appendChild(chip);
      chip.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(HF_KEY, enabled ? '1' : '0'); } catch (e) { /* */ } paintChip(); });
      const sync = () => { chip.style.display = document.getElementById('jTalkView') && document.getElementById('jTalkView').classList.contains('active') ? 'inline-flex' : 'none'; };
      new MutationObserver(sync).observe(document.getElementById('jTalkView') || document.body, { attributes: true, attributeFilter: ['class'] });
      sync();
    }
    paintChip();

    // the Settings toggle
    const styleBtn = document.getElementById('jarvisStyleBtn');
    if (styleBtn && !styleBtn._wired) { styleBtn._wired = true; styleBtn.addEventListener('click', () => setStyle(getStyle() === 'wall' ? 'calm' : 'wall')); }
    paintStyleBtn();

    hookAfterSpeak();
    window.JarvisTalk = { setStyle: setStyle, getStyle: getStyle };
  }

  function paintChip() {
    const chip = document.getElementById('handsFreeChip'); if (!chip) return;
    chip.classList.toggle('on', enabled);
    chip.textContent = enabled ? '🎙 open conversation · on' : '🎙 open conversation · off';
    chip.title = enabled ? 'When Jarvis finishes speaking, the mic re-opens by itself — just talk. Silence sends. Tap to turn off.' : 'Tap to enable open conversation — no more clicking the mic for every turn.';
  }

  // OPEN CONVERSATION — re-open the mic through the mic button's own handler (the router that picks the
  // right capture path per device). Works in BOTH styles. A short delay keeps her last syllable out.
  function hookAfterSpeak() {
    const tryHook = () => {
      if (typeof window.afterSpeak === 'function' && !window.afterSpeak._wall) {
        const orig = window.afterSpeak;
        window.afterSpeak = function () { orig(); if (enabled && !document.hidden) { setTimeout(() => { try { const m = document.getElementById('mic'); if (m) m.click(); } catch (e) { /* mic denied */ } }, 600); } };
        window.afterSpeak._wall = true; return true;
      }
      return false;
    };
    if (!tryHook()) { const iv = setInterval(() => { if (tryHook()) clearInterval(iv); }, 1200); }
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
