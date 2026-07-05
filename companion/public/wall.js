// wall.js — the TALK tab becomes the TRILLION WALL. In Kevin Fremon's videos the conversation IS the
// interface: a full-bleed particle brain (neural.js) with the exchange rendered as big cinematic text
// over it — "HEY TRILLION WHAT DO YOU THINK" / her reply beneath — no chat bubbles, no side columns.
// This transforms #jTalkView with CSS only (the brain already sits behind at z-index:-1), and adds
// OPEN CONVERSATION: when she finishes speaking, the mic re-opens by itself (the VAD auto-stop app.js
// already has closes the loop) — talk → she answers → talk again, no clicking. Barge-in still works.
// Toggle lives on the wall ("🎙 open conversation"), persisted; hooks afterSpeak (both voice paths).
(function () {
  const CSS = `
  /* ── the wall: brain + cinematic transcript, nothing else ─────────────────────────────── */
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
  #jTalkView #transcript .msg {
    background:none !important; border:none !important; box-shadow:none !important;
    max-width:100% !important; padding:0 !important; margin:0 !important;
    animation:wallIn .45s ease both;
  }
  #jTalkView #transcript .msg.you {
    font:600 clamp(20px,4.2vw,34px)/1.28 Georgia,'Times New Roman',serif;
    color:#fff; text-transform:uppercase; letter-spacing:.035em;
    text-shadow:0 2px 26px rgba(45,212,168,.4), 0 1px 4px rgba(0,0,0,.7);
  }
  #jTalkView #transcript .msg.j {
    font:400 clamp(15px,2.7vw,20px)/1.55 Georgia,'Times New Roman',serif;
    color:#ece8de; text-shadow:0 1px 18px rgba(0,0,0,.75);
  }
  #jTalkView #transcript .msg.j .who {
    display:block; font:600 10px/1 -apple-system,'Segoe UI',sans-serif;
    color:#c9a862; letter-spacing:.28em; margin-bottom:7px;
  }
  #jTalkView #transcript .msg.err { color:#d98a7e; font-size:14px; }
  /* only the current exchange lives on the wall — history stays in the dock/log */
  #jTalkView #transcript .msg:not(:nth-last-child(-n+3)) { display:none; }
  @keyframes wallIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
  /* the open-conversation chip */
  #handsFreeChip {
    position:fixed; right:14px; bottom:132px; z-index:3;
    border:1px solid rgba(255,255,255,.14); border-radius:99px; padding:6px 14px;
    background:rgba(14,17,24,.85); color:#8a8fa0; font:500 11.5px -apple-system,'Segoe UI',sans-serif;
    letter-spacing:.04em; cursor:pointer; display:none; backdrop-filter:blur(6px);
  }
  #handsFreeChip.on { color:#c9a862; border-color:rgba(201,168,98,.45); }
  `;

  const KEY = 'jarvisHandsFree';
  let enabled = localStorage.getItem(KEY) !== '0'; // default ON — open conversation is the point

  function mount() {
    if (document.getElementById('wallCss')) return;
    const st = document.createElement('style'); st.id = 'wallCss'; st.textContent = CSS;
    document.head.appendChild(st);

    const chip = document.createElement('button');
    chip.id = 'handsFreeChip'; chip.type = 'button';
    document.body.appendChild(chip);
    chip.addEventListener('click', () => { enabled = !enabled; localStorage.setItem(KEY, enabled ? '1' : '0'); paint(); });

    // the chip only shows on the Talk wall
    const sync = () => { chip.style.display = document.getElementById('jTalkView')?.classList.contains('active') ? 'inline-flex' : 'none'; };
    new MutationObserver(sync).observe(document.getElementById('jTalkView') || document.body, { attributes: true, attributeFilter: ['class'] });
    sync(); paint();
    hookAfterSpeak();
  }

  function paint() {
    const chip = document.getElementById('handsFreeChip');
    if (!chip) return;
    chip.classList.toggle('on', enabled);
    chip.textContent = enabled ? '🎙 open conversation · on' : '🎙 open conversation · off';
    chip.title = enabled
      ? 'When Jarvis finishes speaking, the mic re-opens by itself — just talk. Silence sends. Tap to turn off.'
      : 'Tap to enable open conversation — no more clicking the mic for every turn.';
  }

  // OPEN CONVERSATION: afterSpeak() fires on BOTH voice paths (Kokoro/Eleven audio end + browser TTS
  // end). Function declarations are mutable global bindings, so wrapping it here affects app.js's own
  // calls. A short delay keeps her last syllable out of the next capture; app.js's don't-transcribe-
  // while-speaking guard and barge-in stay in force.
  function hookAfterSpeak() {
    const tryHook = () => {
      if (typeof window.afterSpeak === 'function' && !window.afterSpeak._wall) {
        const orig = window.afterSpeak;
        window.afterSpeak = function () {
          orig();
          if (enabled && !document.hidden && typeof window.startListen === 'function') {
            setTimeout(() => { try { window.startListen(false); } catch { /* mic busy/denied — chip still shows state */ } }, 450);
          }
        };
        window.afterSpeak._wall = true;
        return true;
      }
      return false;
    };
    if (!tryHook()) { const iv = setInterval(() => { if (tryHook()) clearInterval(iv); }, 1200); }
  }

  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
