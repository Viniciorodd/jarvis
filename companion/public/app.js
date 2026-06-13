// JARVIS Companion frontend — Phase A chat + action chips + browser voice (Phase B-lite).
// Voice in: webkitSpeechRecognition (push-to-talk + a basic "Jarvis ..." wake mode).
// Voice out: speechSynthesis now (ElevenLabs upgrade later). Orb reacts to state.
'use strict';
const $ = (id) => document.getElementById(id);
const transcript = $('transcript');
const input = $('input');
const stateEl = $('state');
const hint = $('hint');

const history = [];
let busy = false;
let speakOn = true;

function setState(s, label) { if (window.Orb) Orb.setState(s); stateEl.textContent = label || s; }

function addMsg(who, text) {
  const el = document.createElement('div');
  if (who === 'you') { el.className = 'msg you'; el.textContent = text; }
  else if (who === 'err') { el.className = 'msg err'; el.textContent = '⚠ ' + text; }
  else { el.className = 'msg j'; el.innerHTML = '<span class="who">JARVIS</span>'; el.append(document.createTextNode(text)); }
  transcript.appendChild(el); transcript.scrollTop = transcript.scrollHeight; return el;
}
function addActions(actions) {
  if (!actions || !actions.length) return;
  const wrap = document.createElement('div'); wrap.className = 'acts';
  for (const a of actions) {
    const c = document.createElement('span'); c.className = 'act' + (a.ok ? '' : ' bad');
    c.textContent = (a.ok ? '✦ ' : '✕ ') + a.label; wrap.appendChild(c);
  }
  transcript.appendChild(wrap); transcript.scrollTop = transcript.scrollHeight;
}
function addTyping() {
  const el = document.createElement('div'); el.className = 'msg j';
  el.innerHTML = '<span class="who">JARVIS</span><span class="typing"><span></span><span></span><span></span></span>';
  transcript.appendChild(el); transcript.scrollTop = transcript.scrollHeight; return el;
}

// ── voice out (browser TTS) ──────────────────────────────────────────────
let preferredVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  preferredVoice = vs.find((v) => /en/i.test(v.lang) && /(female|samantha|zira|aria|jenny|libby)/i.test(v.name))
    || vs.find((v) => /en/i.test(v.lang)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!speakOn || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (preferredVoice) u.voice = preferredVoice;
  u.rate = 1.04; u.pitch = 1.0;
  u.onend = () => { if (!busy) setState(wakeOn ? 'listening' : 'idle', wakeOn ? 'listening' : 'standby'); };
  speechSynthesis.speak(u);
}

// ── the brain ────────────────────────────────────────────────────────────
async function sendToJarvis(text) {
  if (busy || !text.trim()) return;
  busy = true; if (hint) hint.style.display = 'none';
  addMsg('you', text); history.push({ role: 'user', content: text });
  setState('thinking', 'thinking…'); const typing = addTyping();
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history }) });
    const data = await r.json(); typing.remove();
    if (!r.ok || data.error) { addMsg('err', data.error || ('error ' + r.status)); setState('idle', 'standby'); busy = false; return; }
    addActions(data.actions);
    setState('speaking', 'speaking'); addMsg('j', data.text);
    history.push({ role: 'assistant', content: data.text });
    speak(data.text);
    if (!speakOn) setTimeout(() => setState(wakeOn ? 'listening' : 'idle', wakeOn ? 'listening' : 'standby'), Math.min(5000, 1000 + data.text.length * 16));
  } catch (e) { typing.remove(); addMsg('err', e.message); setState('idle', 'standby'); }
  busy = false;
}

$('composer').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; sendToJarvis(v); });
$('orb').addEventListener('click', () => { input.focus(); if (!busy) startListen(false); });

// ── voice in (browser STT) ───────────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, wakeOn = false, listening = false;

function ensureRec() {
  if (!SR) return null;
  if (rec) return rec;
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (ev) => {
    const said = ev.results[ev.results.length - 1][0].transcript.trim();
    if (wakeOn) {
      const m = said.match(/jarvis[,\s]+(.*)/i);
      if (m && m[1]) sendToJarvis(m[1]);            // "Jarvis, do X" → command = X
      else if (/^jarvis\b/i.test(said)) { /* just her name, wait */ }
    } else if (said) { sendToJarvis(said); }
  };
  rec.onerror = () => { listening = false; };
  rec.onend = () => { listening = false; if (wakeOn) { try { rec.start(); listening = true; } catch {} } else if (!busy) setState('idle', 'standby'); };
  return rec;
}
function startListen(continuous) {
  const r = ensureRec();
  if (!r) { addMsg('j', "Your browser doesn't support speech input — try Chrome or Edge, or just type. (ElevenLabs/Deepgram voice comes in the next phase.)"); return; }
  try { r.start(); listening = true; setState('listening', continuous ? 'listening' : 'listening…'); } catch {}
}

$('mic').addEventListener('click', () => { if (!SR) return startListen(false); if (listening && !wakeOn) { rec.stop(); } else startListen(false); });

$('wakeBtn').addEventListener('click', () => {
  wakeOn = !wakeOn; $('wakeBtn').classList.toggle('on', wakeOn);
  $('wakeBtn').textContent = `‘‘ Hello Jarvis ’’ : ${wakeOn ? 'on' : 'off'}`;
  if (wakeOn) { startListen(true); addMsg('j', "Hands-free on. Say “Jarvis” followed by what you need."); }
  else { try { rec && rec.stop(); } catch {} setState('idle', 'standby'); }
});

$('voiceBtn').addEventListener('click', () => {
  speakOn = !speakOn; $('voiceBtn').classList.toggle('on', speakOn);
  $('voiceBtn').textContent = speakOn ? '🔊 voice' : '🔇 muted';
  if (!speakOn && 'speechSynthesis' in window) speechSynthesis.cancel();
});
$('voiceBtn').classList.add('on');

$('floorBtn').addEventListener('click', () => window.open('http://localhost:8099', '_blank'));

// greeting
setState('idle', 'standby');
setTimeout(() => { const g = "Online. Good to see you, Vinicio — what are we working on?"; addMsg('j', g); speak(g); }, 700);
