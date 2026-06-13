// JARVIS Companion frontend logic — Phase A: text chat to the Claude brain, orb reacts.
// Voice (Phase B) and tools (later) hook into the same sendToJarvis() + Orb states.
'use strict';
const $ = (id) => document.getElementById(id);
const transcript = $('transcript');
const input = $('input');
const stateEl = $('state');
const hint = $('hint');

const history = []; // [{role, content}]
let busy = false;

function setState(s, label) {
  if (window.Orb) Orb.setState(s);
  stateEl.textContent = label || s;
}

function addMsg(who, text) {
  const el = document.createElement('div');
  if (who === 'you') { el.className = 'msg you'; el.textContent = text; }
  else if (who === 'err') { el.className = 'msg err'; el.textContent = '⚠ ' + text; }
  else { el.className = 'msg j'; el.innerHTML = '<span class="who">JARVIS</span>'; el.append(document.createTextNode(text)); }
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'msg j';
  el.innerHTML = '<span class="who">JARVIS</span><span class="typing"><span></span><span></span><span></span></span>';
  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;
  return el;
}

async function sendToJarvis(text) {
  if (busy || !text.trim()) return;
  busy = true;
  if (hint) hint.style.display = 'none';
  addMsg('you', text);
  history.push({ role: 'user', content: text });
  setState('thinking', 'thinking…');
  const typing = addTyping();

  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await r.json();
    typing.remove();
    if (!r.ok || data.error) { addMsg('err', data.error || ('error ' + r.status)); setState('idle', 'standby'); busy = false; return; }
    setState('speaking', 'speaking');
    addMsg('j', data.text);
    history.push({ role: 'assistant', content: data.text });
    // (Phase B: pipe data.text to ElevenLabs here, hold 'speaking' until audio ends)
    setTimeout(() => setState('idle', 'standby'), Math.min(6000, 1200 + data.text.length * 18));
  } catch (e) {
    typing.remove();
    addMsg('err', e.message);
    setState('idle', 'standby');
  }
  busy = false;
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input.value; input.value = '';
  sendToJarvis(v);
});

// tap the orb to focus / "wake" (voice activation comes in Phase C)
$('orb').addEventListener('click', () => { input.focus(); setState('listening', 'listening'); setTimeout(() => !busy && setState('idle', 'standby'), 1500); });

// mic button — placeholder until Phase B voice
$('mic').addEventListener('click', () => {
  addMsg('j', "Voice is coming in the next phase — type to me for now and I'll keep up.");
  $('mic').classList.add('coming');
});

// HQ toggle — opens the pod floor (the dashboard already built)
$('floorBtn').addEventListener('click', () => {
  window.open('http://localhost:8099', '_blank');
});

// greeting
setState('idle', 'standby');
setTimeout(() => addMsg('j', "Online. Good to see you, Vinicio — what are we working on?"), 600);
