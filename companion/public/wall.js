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
    font:600 clamp(20px,4.2vw,34px)/1.28 var(--font,Inter,sans-serif);
    color:var(--cream,#f3f4f6); text-transform:uppercase; letter-spacing:.035em;
    text-shadow:0 2px 26px rgba(var(--teal-rgb,67,230,212),.4), 0 1px 4px rgba(0,0,0,.7);
  }
  #jTalkView #transcript .msg.j {
    font:400 clamp(15px,2.7vw,20px)/1.55 var(--font,Inter,sans-serif);
    color:var(--cream,#f3f4f6); text-shadow:0 1px 18px rgba(0,0,0,.75);
  }
  #jTalkView #transcript .msg.j .who {
    display:block; font:600 10px/1 var(--font,Inter,sans-serif);
    color:var(--teal,#43e6d4); letter-spacing:.28em; margin-bottom:7px;
  }
  #jTalkView #transcript .msg.err { color:var(--err,#ff8f80); font-size:14px; }
  /* only the current exchange lives on the wall — history stays in the dock/log */
  #jTalkView #transcript .msg:not(:nth-last-child(-n+3)) { display:none; }
  @keyframes wallIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
  /* the JARVIS tab is the hub: when she pulls up files / data / maps / results (the tool visual
     panel), it floats as a glass card over the brain — readable, closable, never a buried box */
  #jTalkView .visual{
    position:fixed !important; left:50% !important; top:auto !important; bottom:190px !important;
    transform:translateX(-50%); width:min(680px,94vw); max-height:46vh; overflow:auto; z-index:4;
    background:var(--panel,rgba(14,17,24,.92)) !important; border:1px solid rgba(var(--teal-rgb,67,230,212),.35) !important;
    border-radius:14px !important; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
    box-shadow:0 18px 60px rgba(0,0,0,.55); pointer-events:auto;
  }
  #jTalkView .visual img{ max-width:100%; border-radius:10px; }
  /* the open-conversation chip */
  #handsFreeChip {
    position:fixed; right:14px; bottom:132px; z-index:3;
    border:1px solid var(--line,rgba(255,255,255,.09)); border-radius:99px; padding:6px 14px;
    background:var(--panel,rgba(14,17,24,.85)); color:var(--dim,#8b909a); font:500 11.5px var(--font,Inter,sans-serif);
    letter-spacing:.04em; cursor:pointer; display:none; backdrop-filter:blur(6px);
  }
  #handsFreeChip.on { color:var(--teal,#43e6d4); border-color:rgba(var(--teal-rgb,67,230,212),.45); }
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
  // end). We re-open the mic THROUGH THE MIC BUTTON's own handler — that's the router that picks the
  // right capture path per device (Deepgram record→VAD on PC/Brave/Electron where browser speech
  // doesn't exist; browser speech elsewhere). The old startListen() call was browser-speech-only,
  // which is why open conversation worked on the iPhone and broke on the PC.
  // A short delay keeps her last syllable out of the next capture; barge-in stays in force.
  function hookAfterSpeak() {
    const tryHook = () => {
      if (typeof window.afterSpeak === 'function' && !window.afterSpeak._wall) {
        const orig = window.afterSpeak;
        window.afterSpeak = function () {
          orig();
          if (enabled && !document.hidden) {
            setTimeout(() => { try { const m = document.getElementById('mic'); if (m) m.click(); } catch { /* mic denied — chip still shows state */ } }, 600);
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
