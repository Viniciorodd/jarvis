// JARVIS Companion frontend.
// Chat + action chips + voice (Deepgram/ElevenLabs when keyed, browser STT/TTS fallback)
// + live dashboard (spend/tokens/pod income/tasks/urgent/emails) + visual panel (maps/images/web)
// + drag-drop documents. Orb reacts to state.
'use strict';
const $ = (id) => document.getElementById(id);
const transcript = $('transcript');
const input = $('input');
const stateEl = $('state');
const hint = $('hint');

const history = [];
let busy = false;
let openConvo = false;   // keep listening so he can talk freely (no wake needed) within the window
let lastConvo = 0;       // timestamp of the last voice interaction
const CONVO_WINDOW = 30000;
let speakOn = true;
let hasVoice = false;   // ElevenLabs available?
let hasStt = false;     // Deepgram available?
let hasVosk = false;    // offline Vosk wake model downloaded?
let hqUrl = 'http://192.168.6.121:8099';

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

// ── voice out ──────────────────────────────────────────────────────────────
let preferredVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  preferredVoice = vs.find((v) => /en/i.test(v.lang) && /(female|samantha|zira|aria|jenny|libby)/i.test(v.name))
    || vs.find((v) => /en/i.test(v.lang)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let curAudio = null;
function afterSpeak() { if (!busy) setState(wakeOn ? 'listening' : 'idle', wakeOn ? 'listening' : 'standby'); }
function browserSpeak(text) {
  if (!('speechSynthesis' in window)) { afterSpeak(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (preferredVoice) u.voice = preferredVoice;
  u.rate = 1.04; u.pitch = 1.0; u.onend = afterSpeak;
  speechSynthesis.speak(u);
}
async function speak(text) {
  if (!speakOn) { afterSpeak(); return; }
  if (hasVoice) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        if (curAudio) { curAudio.pause(); }
        curAudio = new Audio(url);
        curAudio.onended = () => { URL.revokeObjectURL(url); afterSpeak(); };
        await curAudio.play(); return;
      }
    } catch { /* fall through to browser voice */ }
  }
  browserSpeak(text);
}

// ── the brain ────────────────────────────────────────────────────────────
async function sendToJarvis(text) {
  if (busy || !text.trim()) return;
  busy = true; lastConvo = Date.now(); if (hint) hint.style.display = 'none';
  addMsg('you', text); history.push({ role: 'user', content: text });
  setState('thinking', 'thinking…'); const typing = addTyping();
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history }) });
    const data = await r.json(); typing.remove();
    if (!r.ok || data.error) { addMsg('err', data.error || ('error ' + r.status)); setState('idle', 'standby'); busy = false; return; }
    addActions(data.actions);
    if (data.visuals && data.visuals.length) data.visuals.forEach(showVisual);
    setState('speaking', 'speaking'); addMsg('j', data.text);
    history.push({ role: 'assistant', content: data.text });
    speak(data.text);
    loadDash(); // a turn may have changed spend/tokens/HQ
    if (!speakOn) setTimeout(() => setState(wakeOn ? 'listening' : 'idle', wakeOn ? 'listening' : 'standby'), Math.min(5000, 1000 + data.text.length * 16));
  } catch (e) { typing.remove(); addMsg('err', e.message); setState('idle', 'standby'); }
  busy = false;
}

$('composer').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; sendToJarvis(v); });
$('orb').addEventListener('click', () => { input.focus(); if (!busy && !hasStt) startListen(false); });

// ── visual panel ───────────────────────────────────────────────────────────
function showVisual(v) {
  if (!v || !v.url) return;
  const body = $('visualBody'); body.innerHTML = '';
  if (v.type === 'image') { const im = document.createElement('img'); im.src = v.url; im.alt = v.caption || ''; body.appendChild(im); }
  else { const f = document.createElement('iframe'); f.src = v.url; f.loading = 'lazy'; f.allow = 'fullscreen'; f.referrerPolicy = 'no-referrer'; body.appendChild(f); }
  $('visualCap').textContent = (v.type === 'map' ? '🗺  ' : v.type === 'image' ? '🖼  ' : '🌐  ') + (v.caption || v.url);
  $('visual').hidden = false;
}
$('visualX').addEventListener('click', () => { $('visual').hidden = true; $('visualBody').innerHTML = ''; });

// ── dashboard ────────────────────────────────────────────────────────────
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kfmt = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n); };
function fillList(id, items, render, empty) {
  const ul = $(id); ul.innerHTML = '';
  if (!items || !items.length) { ul.innerHTML = `<li class="ds-empty">${empty}</li>`; return; }
  for (const it of items) ul.appendChild(render(it));
}
function li(cls, html) { const el = document.createElement('li'); if (cls) el.className = cls; el.innerHTML = html; return el; }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function loadDash() {
  try {
    const r = await fetch('/api/dashboard'); if (!r.ok) return;
    const d = await r.json();
    const income = d.hq ? d.hq.earned : 0;
    $('mIncome').textContent = money(income);
    $('mXp').textContent = d.hq ? `XP ${kfmt(d.hq.xp)} · streak ${d.hq.streak}` : 'HQ offline';
    $('mSpend').textContent = money(d.spend.total);
    $('mSpendToday').textContent = 'today ' + money(d.spend.today);
    $('mTokens').textContent = kfmt(d.tokens.total);
    $('mCalls').textContent = `${kfmt(d.tokens.in)} in · ${kfmt(d.tokens.out)} out`;
    $('mNet').textContent = money(income - d.spend.total);

    fillList('urgentList', d.urgent, (u) => li('urgent', esc(u.title || u) + (u.sub ? `<span class="li-sub">${esc(u.sub)}</span>` : '')), 'nothing urgent');
    $('nUrgent').textContent = (d.urgent || []).length;
    fillList('emailList', d.emails, (e) => li('', esc(e.from || e.title || e) + (e.subject ? `<span class="li-sub">${esc(e.subject)}</span>` : '')), 'inbox quiet');
    $('nEmails').textContent = (d.emails || []).length;
    fillList('taskList', d.tasks, (t) => li('', esc(t.title || t) + (t.sub ? `<span class="li-sub">${esc(t.sub)}</span>` : '')), 'no open tasks');
    $('nTasks').textContent = (d.tasks || []).length;

    const ops = d.hq ? d.hq.operators : [];
    fillList('opsList', ops, (o) => li('op', esc(o.name) + `<span class="li-sub">${esc(o.state)} — ${esc(o.text || '')}</span>`), d.hq ? 'idle' : 'HQ offline');
    const feed = d.hq ? d.hq.feed : [];
    // approvals fold into the feed-top so he sees what's waiting
    const approvals = (d.hq && d.hq.approvals || []).map((a) => '⚑ awaiting approval: ' + a);
    fillList('feedList', approvals.concat(feed || []), (s) => li('', esc(s)), 'quiet');
  } catch { /* leave last values */ }
}
$('dashRefresh').addEventListener('click', loadDash);
$('dashBtn').addEventListener('click', () => $('dash').classList.toggle('hidden'));

// ── home view: command-center greeting + at-a-glance metrics (XSIAM-style headline) ──
function greetWord() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
async function updateHome() {
  const g = $('homeGreet'); if (g) g.textContent = `${greetWord()}, Vinicio`;
  try {
    const [ops, dash] = await Promise.all([
      fetch('/api/operations').then((r) => r.json()).catch(() => ({})),
      fetch('/api/dashboard').then((r) => r.json()).catch(() => ({})),
    ]);
    const collected = (dash.money && typeof dash.money.collected === 'number') ? dash.money.collected : ((dash.hq && dash.hq.earned) || 0);
    const rows = [
      ['Opportunities', String((ops.opportunities || []).length)],
      ['Needs you', String((ops.leads || []).length)],
      ['Collected', money(collected)],
      ['AI spend', dash.spend ? money(dash.spend.total) : '$0.00'],
    ];
    const el = $('homeMetrics');
    if (el) el.innerHTML = rows.map(([k, v]) => `<div class="hm"><div class="hm-v">${esc(v)}</div><div class="hm-k">${esc(k)}</div></div>`).join('');
  } catch { /* leave last values */ }
}

// ── drag-drop documents ────────────────────────────────────────────────────
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); if (++dragDepth === 1) $('dropmask').classList.add('show'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('dropmask').classList.remove('show'); } });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('dropmask').classList.remove('show');
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  for (const f of files) {
    try {
      addMsg('you', `📎 dropped: ${f.name}`);
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'x-filename': encodeURIComponent(f.name) }, body: f });
      const d = await r.json();
      if (!r.ok || d.error) { addMsg('err', d.error || 'upload failed'); continue; }
      sendToJarvis(`I just dropped a file for you. It's saved at "${d.path}". Please read it and tell me what it is and anything I should know — then wait for what I want done with it.`);
    } catch (err) { addMsg('err', err.message); }
  }
});

// ── voice in (browser STT fallback — note: not available inside the Electron app) ──
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, wakeOn = false, listening = false;
function ensureRec() {
  if (!SR) return null;
  if (rec) return rec;
  rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (ev) => {
    const said = ev.results[ev.results.length - 1][0].transcript.trim();
    const now = Date.now();
    if (wakeOn) {
      if (/\bjarvis\b/i.test(said)) {
        const cmd = said.replace(/^.*?\bjarvis\b[\s,:.!-]*/i, '').trim();
        lastConvo = now;
        if (cmd.length > 1) sendToJarvis(cmd); else { addMsg('j', 'Yes?'); speak('Yes?'); }
      } else if (openConvo && (now - lastConvo) < CONVO_WINDOW && said) { sendToJarvis(said); }
    } else if (said) sendToJarvis(said);
  };
  rec.onerror = () => { listening = false; };
  rec.onend = () => { listening = false; if (wakeOn && !usingDgWake) { try { rec.start(); listening = true; } catch {} } else if (!busy) setState('idle', 'standby'); };
  return rec;
}
function startListen(continuous) {
  const r = ensureRec();
  if (!r) { addMsg('j', "Browser speech isn't available here — use the 🎙 mic button (Deepgram) to talk, or just type."); return; }
  try { r.start(); listening = true; setState('listening', continuous ? 'listening' : 'listening…'); } catch {}
}

$('mic').addEventListener('click', () => {
  if (hasStt) return toggleRecord();        // Deepgram push-to-talk (works in Electron)
  if (!SR) return startListen(false);
  if (listening && !wakeOn) rec.stop(); else startListen(false);
});

// ── hands-free wake ─────────────────────────────────────────────────────────
// In the Electron app the browser speech API is absent, so when Deepgram is present we
// run a continuous record→transcribe loop and trigger on "Jarvis …". Bulletproof always-on
// hotword (offline) is a Porcupine upgrade noted for later.
let usingDgWake = false, usingVoskWake = false, dgWakeStop = false, dgRec = null, dgStream = null;
async function dgWakeSegment() {
  if (dgWakeStop) return;
  if (!dgStream) { try { dgStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { addMsg('err', 'Mic blocked — allow microphone access for hands-free.'); stopWake(); return; } }
  const chunks = [];
  dgRec = new MediaRecorder(dgStream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {});
  dgRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  dgRec.onstop = async () => {
    const speaking = curAudio && !curAudio.paused && !curAudio.ended; // don't transcribe her own voice
    if (!busy && !speaking && chunks.length) {
      try {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const r = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: blob });
        const d = await r.json(); const said = (d.text || '').trim();
        const now = Date.now();
        if (/\bjarvis\b/i.test(said)) {                       // "Hey/Hello Jarvis ..." wake
          const cmd = said.replace(/^.*?\bjarvis\b[\s,:.!-]*/i, '').trim();
          lastConvo = now;
          if (cmd.length > 1) sendToJarvis(cmd); else { addMsg('j', 'Yes?'); speak('Yes?'); }
        } else if (openConvo && (now - lastConvo) < CONVO_WINDOW && said.length > 1) {
          sendToJarvis(said);                                  // open conversation: no wake needed
        }
      } catch { /* ignore a dropped segment */ }
    }
    if (!dgWakeStop) dgWakeSegment(); // next segment
  };
  dgRec.start();
  setTimeout(() => { try { dgRec && dgRec.state === 'recording' && dgRec.stop(); } catch {} }, 5000);
}
function startWake() {
  if (hasVosk && window.VoskWake) {                 // best: 100% offline, private, always-on
    usingVoskWake = true;
    window.VoskWake.start((cmd) => sendToJarvis(cmd), (st, label) => {
      if (st === 'error') addMsg('err', 'wake: ' + label);
      if (!busy) setState('listening', label || 'listening');
    });
    addMsg('j', 'Hands-free on — offline. Say “Hey Jarvis” then what you need.');
    return;
  }
  if (hasStt) { usingDgWake = true; dgWakeStop = false; dgWakeSegment(); }
  else { usingDgWake = false; startListen(true); }
  setState('listening', 'listening');
  addMsg('j', 'Hands-free on. Say “Hey Jarvis” then what you need.');
}
function stopWake() {
  wakeOn = false; dgWakeStop = true; usingDgWake = false;
  if (usingVoskWake) { try { window.VoskWake.stop(); } catch {} usingVoskWake = false; }
  try { dgRec && dgRec.stop(); } catch {}
  try { dgStream && dgStream.getTracks().forEach((t) => t.stop()); } catch {} dgStream = null;
  try { rec && rec.stop(); } catch {}
  $('wakeBtn').classList.remove('on'); $('wakeBtn').textContent = '‘‘ Hey Jarvis ’’ : off';
  setState('idle', 'standby');
}
$('wakeBtn').addEventListener('click', () => {
  wakeOn = !wakeOn; $('wakeBtn').classList.toggle('on', wakeOn);
  $('wakeBtn').textContent = `‘‘ Hey Jarvis ’’ : ${wakeOn ? 'on' : 'off'}`;
  if (wakeOn) startWake(); else stopWake();
});

// Open conversation: keep listening so he can talk freely (no re-wake) within CONVO_WINDOW of each turn.
$('convoBtn').addEventListener('click', () => {
  openConvo = !openConvo;
  $('convoBtn').classList.toggle('on', openConvo);
  $('convoBtn').textContent = `💬 Open conversation: ${openConvo ? 'on' : 'off'}`;
  if (openConvo) { lastConvo = Date.now(); if (!wakeOn) $('wakeBtn').click(); addMsg('j', 'Open conversation on — say “Hey Jarvis”, then just keep talking.'); }
});

$('voiceBtn').addEventListener('click', () => {
  speakOn = !speakOn; $('voiceBtn').classList.toggle('on', speakOn);
  $('voiceBtn').textContent = speakOn ? '🔊 Voice: on' : '🔇 Voice: off';
  if (!speakOn && 'speechSynthesis' in window) speechSynthesis.cancel();
});
$('voiceBtn').classList.add('on');

// ── Deepgram push-to-talk ────────────────────────────────────────────────────
let mediaRec = null, recChunks = [], recording = false;
async function toggleRecord() {
  if (recording && mediaRec) { mediaRec.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { addMsg('err', 'Mic blocked — allow microphone access.'); return; }
  mediaRec = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {});
  recChunks = []; recording = true; setState('listening', 'listening · tap mic to send');
  mediaRec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  mediaRec.onstop = async () => {
    recording = false; stream.getTracks().forEach((t) => t.stop());
    setState('thinking', 'transcribing…');
    try {
      const blob = new Blob(recChunks, { type: 'audio/webm' });
      const r = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: blob });
      const d = await r.json();
      if (d.text && d.text.trim()) sendToJarvis(d.text.trim()); else setState('idle', 'standby');
    } catch { setState('idle', 'standby'); }
  };
  mediaRec.start();
}
// floorBtn now opens the in-app Floor view (see floor.js) — no separate site.

// ── settings: theme swatches (pick by mood) + open/close ─────────────────────
function applyTheme(name) {
  const ok = ['teal', 'mono', 'dark'].includes(name) ? name : 'teal';
  document.documentElement.dataset.theme = ok;
  document.querySelectorAll('.theme-swatch').forEach((s) => s.classList.toggle('on', s.dataset.theme === ok));
  try { localStorage.setItem('jarvis-theme', ok); } catch { /* private mode */ }
  if (window.Orb && window.Orb.refreshTheme) window.Orb.refreshTheme();
}
document.querySelectorAll('.theme-swatch').forEach((s) => s.addEventListener('click', () => applyTheme(s.dataset.theme)));
applyTheme((() => { try { return localStorage.getItem('jarvis-theme') || 'teal'; } catch { return 'teal'; } })());
$('settingsBtn').addEventListener('click', () => { $('settingsView').hidden = false; });
$('settingsX').addEventListener('click', () => { $('settingsView').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settingsView').hidden) $('settingsView').hidden = true; });

// ── boot ─────────────────────────────────────────────────────────────────────
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed: ' + src)); document.head.appendChild(s); }); }
fetch('/api/info').then((r) => r.json()).then(async (i) => {
  if (i.hqUrl) hqUrl = i.hqUrl; hasVoice = !!i.hasVoice; hasStt = !!i.hasStt;
  if (i.hasVosk) { // load the offline wake engine lazily, only if the model was downloaded
    try { await loadScript('https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js'); await loadScript('vosk-wake.js'); hasVosk = true; }
    catch (e) { console.warn('Vosk wake unavailable:', e.message); }
  }
}).catch(() => {});
loadDash();
setInterval(loadDash, 20000);
updateHome();
setInterval(updateHome, 45000);

setState('idle', 'standby');
setTimeout(() => { const g = "Online. Good to see you, Vinicio — what are we working on?"; addMsg('j', g); speak(g); }, 700);
