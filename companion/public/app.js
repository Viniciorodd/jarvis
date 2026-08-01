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
  transcript.appendChild(el); transcript.scrollTop = transcript.scrollHeight;
  if (window.JDock) window.JDock.mirror(who, text);   // mirror into the global "reach her anywhere" dock
  return el;
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
  const en = vs.filter((v) => /en(-|_|$)/i.test(v.lang));
  // 1) best: modern "natural/neural/online" voices (far less robotic than the default)
  preferredVoice = en.find((v) => /(natural|neural|online)/i.test(v.name))
    // 2) known-good named voices (Microsoft Aria/Jenny, Apple Samantha, Google)
    || en.find((v) => /(aria|jenny|libby|samantha|google\s|microsoft\s)/i.test(v.name))
    // 3) any female-ish english, then any english, then anything
    || en.find((v) => /(female|samantha|zira)/i.test(v.name))
    || en[0] || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let curAudio = null;

// ── Web Audio: read the REAL audio envelope so the orb reacts to her voice and yours ──
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ac() { try { if (!audioCtx && AudioCtx) audioCtx = new AudioCtx(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch {} return audioCtx; }
function runMeter(analyser, who, done) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  if (window.Orb) Orb.setVoice(who);
  (function tick() {
    if (done()) { if (window.Orb) { Orb.setLevel(0); Orb.setVoice(null); } return; }
    analyser.getByteFrequencyData(data);
    let s = 0; for (let i = 0; i < data.length; i++) s += data[i];
    if (window.Orb) Orb.setLevel(Math.min(1, (s / data.length) / 100));
    requestAnimationFrame(tick);
  })();
}
function meterAudioEl(el) {                 // HER ElevenLabs voice → reactive orb
  const ctx = ac(); if (!ctx) return;
  try {
    const src = ctx.createMediaElementSource(el);
    const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.6;
    src.connect(an); an.connect(ctx.destination);
    runMeter(an, 'jarvis', () => el.paused || el.ended);
  } catch { /* best-effort; audio still plays */ }
}
let micMeterStop = null;
function meterMicStream(stream, onLevel) {   // YOUR voice → reactive orb + barge-in (+ optional level cb for VAD)
  const ctx = ac(); if (!ctx) return null;
  try {
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.5;
    src.connect(an);                         // NOT to destination — that would echo the mic
    const data = new Uint8Array(an.frequencyBinCount); let stopped = false;
    if (window.Orb) Orb.setVoice('user');
    (function tick() {
      if (stopped) return;
      an.getByteFrequencyData(data);
      let s = 0; for (let i = 0; i < data.length; i++) s += data[i];
      const lvl = Math.min(1, (s / data.length) / 85);
      if (window.Orb) Orb.setLevel(lvl);
      if (lvl > 0.17 && curAudio && !curAudio.paused && !curAudio.ended) stopSpeaking(); // talk over her
      if (onLevel) { try { onLevel(lvl); } catch {} }
      requestAnimationFrame(tick);
    })();
    return () => { stopped = true; if (window.Orb) { Orb.setLevel(0); Orb.setVoice(null); } };
  } catch { return null; }
}
// cut her off mid-sentence — for "let me talk over you" and on every new turn
function stopSpeaking() {
  try { if (curAudio && !curAudio.paused) curAudio.pause(); } catch {}
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
  if (window.Orb) Orb.setLevel(0);
}

function afterSpeak() { if (!busy) setState(wakeOn ? 'listening' : 'idle', wakeOn ? 'listening' : 'standby'); }
// Markdown → speech, for the BROWSER fallback only (the server strips it for Kokoro/ElevenLabs in /api/tts).
// Mirrors pods/speech.mjs; kept small and dependency-free because this file ships to the browser as-is.
function speakableText(s) {
  return String(s == null ? '' : s)
    .replace(/```[\s\S]*?```/g, ' . ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*\*|___)(\S[\s\S]*?\S|\S)\1/g, '$2')
    .replace(/(\*\*|__)(\S[\s\S]*?\S|\S)\1/g, '$2')
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/<[^>]+>/g, ' ').replace(/[•▪●✓✔→]/g, ' ')
    .replace(/—|–/g, ', ').replace(/…/g, '. ')
    .replace(/\n{2,}/g, '. ').replace(/\n/g, '. ')
    .replace(/\.{2,}/g, '.').replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ').trim();
}
// Operator, 2026-07-29: "jarvis speaks too slow". 1.04 was barely above default; 1.18 reads brisk but still
// clear. Tunable live from the console (window.JARVIS_SPEECH_RATE) so he can dial it without a rebuild.
function speechRate() {
  const r = Number(window.JARVIS_SPEECH_RATE || localStorage.getItem('jarvisSpeechRate') || 1.18);
  return Math.min(2, Math.max(0.6, isFinite(r) ? r : 1.18));
}
function browserSpeak(text) {
  if (!('speechSynthesis' in window)) { afterSpeak(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakableText(text));
  if (preferredVoice) u.voice = preferredVoice;
  u.rate = speechRate(); u.pitch = 1.0;
  // browser TTS exposes no audio node — drive a gentle speaking pulse so the orb still reacts
  if (window.Orb) Orb.setVoice('jarvis');
  const osc = setInterval(() => { if (window.Orb) Orb.setLevel(0.28 + Math.random() * 0.4); }, 95);
  const stop = () => { clearInterval(osc); if (window.Orb) { Orb.setLevel(0); Orb.setVoice(null); } afterSpeak(); };
  u.onend = stop; u.onerror = stop;
  speechSynthesis.speak(u);
}
async function speak(text) {
  if (!speakOn) { afterSpeak(); return; }
  if (hasVoice) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        if (curAudio) { try { curAudio.pause(); } catch {} }
        curAudio = new Audio(url);
        curAudio.onended = () => { URL.revokeObjectURL(url); if (window.Orb) { Orb.setLevel(0); Orb.setVoice(null); } afterSpeak(); };
        meterAudioEl(curAudio);
        await curAudio.play(); return;
      }
    } catch { /* fall through to browser voice */ }
  }
  browserSpeak(text);
}

// A Jarvis bubble is "<span class=who>JARVIS</span>" + a text node, so setting textContent would delete the
// label. Replace only the trailing text.
function setMsgText(el, text) {
  if (!el) return;
  const last = el.lastChild;
  if (last && last.nodeType === 3) last.nodeValue = text;
  else el.append(document.createTextNode(text));
  if (window.JDock) window.JDock.mirror('j', text);
}

// ── LOOKING, inside the conversation ──────────────────────────────────────
// The server cannot reach a webcam, so it returns a directive and this does the capture. One frame, then the
// track is stopped immediately — the camera light going out is the proof that nothing is still watching.
// The same server-side gates apply as anywhere else (a reason is required, `continuous` is refused, and a
// rapid loop of looks is refused), so this convenience cannot become a standing watch.
let lookStream = null;
async function doLook(req) {
  const kind = (req && req.kind) || 'object';
  const reason = (req && req.reason) || 'he asked me to look';
  const badge = addMsg('j', '👁 looking…');
  try {
    lookStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    const vid = document.createElement('video');
    vid.srcObject = lookStream; vid.muted = true; vid.playsInline = true;
    await vid.play();
    // Give the sensor a moment to expose — the first frame off a cold camera is usually black, and a model
    // handed a black frame will confidently describe darkness.
    await new Promise((r) => setTimeout(r, 350));
    const c = document.createElement('canvas');
    c.width = vid.videoWidth || 1280; c.height = vid.videoHeight || 720;
    c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
    const image = c.toDataURL('image/jpeg', 0.82);
    stopLook(vid);
    const r = await fetch('/api/vision/look', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image, kind, reason }),
    });
    const d = await r.json();
    const said = d.refused ? ('I won\'t do that — ' + d.reason)
      : !d.ok ? ('I couldn\'t see just now — ' + (d.error || 'no vision provider answered.'))
      : d.text;
    setMsgText(badge, said);
    history.push({ role: 'assistant', content: said });
    speak(said);
  } catch (e) {
    // Never soften this into "I couldn't see anything" — that reads as an empty room rather than no camera.
    badge.textContent = e && /denied|NotAllowed/i.test(String(e.name || e.message))
      ? 'I need camera permission to look — allow it and ask me again.'
      : 'I couldn\'t open the camera — ' + (e.message || e);
    stopLook();
  }
}
function stopLook(vid) {
  try { if (vid) { vid.pause(); vid.srcObject = null; } } catch { /* */ }
  try { if (lookStream) lookStream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  lookStream = null;
}

// ── the brain ────────────────────────────────────────────────────────────
async function sendToJarvis(text) {
  if (busy || !text.trim()) return;
  stopSpeaking();                       // a new turn silences whatever she was saying
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
    // A LOOK happens right here, in the conversation. Operator, 2026-08-01: "it's just so many different
    // tabs… it should be less tabs, more focused work, more power." A camera you have to navigate to is a
    // feature; a camera that answers where you're already talking is a sense.
    if (data.camera) doLook(data.camera);
    // She navigates; he never hunts for a tab. In-app hashes switch view without a reload; a real route is a
    // page change, delayed slightly so her line is spoken/read before the screen moves under him.
    if (data.goto && data.goto.route) {
      const r = data.goto.route;
      if (r.startsWith('/#')) { location.hash = r.slice(1); }
      else if (r !== location.pathname) setTimeout(() => { location.href = r; }, 700);
    }
    loadDash(); // a turn may have changed spend/tokens/HQ
    if (!speakOn) setTimeout(() => setState(wakeOn ? 'listening' : 'idle', wakeOn ? 'listening' : 'standby'), Math.min(5000, 1000 + data.text.length * 16));
  } catch (e) { typing.remove(); addMsg('err', e.message); setState('idle', 'standby'); }
  busy = false;
}

$('composer').addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; sendToJarvis(v); });
$('orb').addEventListener('click', () => { stopSpeaking(); input.focus(); if (!busy && !hasStt) startListen(false); });

// ── visual panel ───────────────────────────────────────────────────────────
function showVisual(v) {
  if (!v || !v.url) return;
  const body = $('visualBody'); body.innerHTML = '';
  if (v.type === 'image') { const im = document.createElement('img'); im.src = v.url; im.alt = v.caption || ''; body.appendChild(im); }
  else { const f = document.createElement('iframe'); f.src = v.url; f.loading = 'lazy'; f.allow = 'fullscreen'; f.referrerPolicy = 'no-referrer'; body.appendChild(f); }
  $('visualCap').textContent = (v.type === 'map' ? '🗺  ' : v.type === 'image' ? '🖼  ' : '🌐  ') + (v.caption || v.url);
  $('visual').hidden = false;
}
$('visualX').addEventListener('click', () => { closeVisual(); });
function closeVisual() { $('visual').hidden = true; $('visualBody').innerHTML = ''; $('visual').classList.remove('big'); }

// ── HANDS (operator: "with his gesture he was able to move them as well") ──────────────────────────
// Wave the panel away, or push it big. Frame-differencing into a 3x3 motion grid, computed here — no model,
// no library, nothing leaves the machine. Mirrors pods/vision.mjs, which is eval-pinned.
//
// It only runs while something is ON SCREEN to control, and stops the camera the moment the panel closes.
// A gesture watcher idling on an empty desk is a camera left running, which is the thing he ruled out.
let gStream = null, gPrev = null, gPrevX = null, gRaf = null, gLast = 0;
async function handsOn() {
  if (gStream) return true;
  try {
    gStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180 }, audio: false });
    const vid = document.createElement('video');
    vid.srcObject = gStream; vid.muted = true; vid.playsInline = true; await vid.play();
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (!gStream) return;
      ctx.drawImage(vid, 0, 0, 96, 54);
      const cur = ctx.getImageData(0, 0, 96, 54).data;
      if (gPrev) {
        const cells = new Array(9).fill(0), counts = new Array(9).fill(0);
        for (let y = 0; y < 54; y++) for (let x = 0; x < 96; x++) {
          const i = (y * 96 + x) * 4;
          const d = Math.abs(cur[i] - gPrev[i]) + Math.abs(cur[i + 1] - gPrev[i + 1]) + Math.abs(cur[i + 2] - gPrev[i + 2]);
          const c = Math.floor(y / 18) * 3 + Math.floor(x / 32);
          cells[c] += d > 60 ? 1 : 0; counts[c] += 1;
        }
        const norm = cells.map((n, i) => n / (counts[i] || 1));
        const energy = norm.reduce((a, b) => a + b, 0) / 9;
        const col = [0, 1, 2].map((c) => norm[c] + norm[c + 3] + norm[c + 6]);
        const tot = col.reduce((a, b) => a + b, 0) || 1;
        const x = (col[1] * 0.5 + col[2]) / tot;
        let g = null;
        if (energy >= 0.18) {
          if (norm.filter((c) => c > 0.35).length >= 7) g = 'dismiss';
          else if (gPrevX != null && x - gPrevX > 0.28) g = 'next';
          else if (gPrevX != null && gPrevX - x > 0.28) g = 'prev';
          else if (col[1] / tot > 0.6 && norm[4] > 0.4) g = 'expand';
        }
        gPrevX = tot ? x : gPrevX;
        // 1.2s cooldown — a gesture that can fire every frame turns a stretch into a command storm.
        if (g && Date.now() - gLast > 1200) { gLast = Date.now(); onHandGesture(g); }
      }
      gPrev = cur;
      gRaf = requestAnimationFrame(tick);
    };
    tick();
    return true;
  } catch { handsOff(); return false; }
}
function handsOff() {
  if (gRaf) cancelAnimationFrame(gRaf);
  try { if (gStream) gStream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  gStream = null; gRaf = null; gPrev = null; gPrevX = null;
  const b = $('handsBtn'); if (b) b.classList.remove('on');
}
function onHandGesture(g) {
  const panel = $('visual');
  if (!panel || panel.hidden) return;         // nothing on screen to control
  if (g === 'dismiss') { closeVisual(); handsOff(); return; }   // wave it away, and the camera goes with it
  if (g === 'expand') panel.classList.toggle('big');
  if (g === 'next' || g === 'prev') panel.classList.toggle('big');
}
// The camera only runs while a panel is up, and never on its own.
const _showVisual = showVisual;
showVisual = function (v) { _showVisual(v); if ($('handsBtn') && $('handsBtn').classList.contains('on')) handsOn(); };
if ($('handsBtn')) $('handsBtn').addEventListener('click', async () => {
  const b = $('handsBtn');
  if (b.classList.contains('on')) { handsOff(); return; }
  // Light the button only if the camera ACTUALLY opened — a lit indicator on a denied permission is a lie
  // about whether anything is watching.
  if (await handsOn()) b.classList.add('on');
  else addMsg('err', 'I need camera permission for hand control.');
});

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
      ['Opportunities', String((ops.opportunities || []).length), 'opsBtn'],
      ['Needs you', String((ops.leads || []).length), 'opsBtn'],
      ['Collected', money(collected), 'commandBtn'],
      ['AI spend', dash.spend ? money(dash.spend.total) : '$0.00', 'dashBtn'],
    ];
    const el = $('homeMetrics');
    if (el) el.innerHTML = rows.map(([k, v, go]) => `<div class="hm clickable" data-go="${go}" title="Open"><div class="hm-v">${esc(v)}</div><div class="hm-k">${esc(k)}</div></div>`).join('');
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
  stopSpeaking();                           // grabbing the mic interrupts her
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
          wakeCommand(cmd);
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
// "Hey Jarvis …" → if he says wake up / brief me / command, open the Command Center and speak the brief;
// otherwise it's a normal command.
function wakeCommand(cmd) {
  const c = String(cmd || '').toLowerCase().trim();
  if (!c || c.length <= 1) { addMsg('j', 'Yes?'); speak('Yes?'); return; }
  if (/^(wake up|wake|good morning|brief( me)?|briefing|command( center)?|status report|sitrep|dashboard)\b/.test(c) && window.JarvisCommand) {
    if (window.JarvisCinematic && window.JarvisCinematic.enabled && /^(wake up|wake|good morning)\b/.test(c)) window.JarvisCinematic.boot();
    window.JarvisCommand.open(); window.JarvisCommand.brief(); return;
  }
  sendToJarvis(cmd);
}
function startWake() {
  if (hasVosk && window.VoskWake) {                 // best: 100% offline, private, always-on
    usingVoskWake = true;
    window.VoskWake.start((cmd) => wakeCommand(cmd), (st, label) => {
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

// ── Deepgram push-to-talk with hands-free AUTO-STOP ──────────────────────────
// Tap the mic once and just talk — when you PAUSE (go quiet for ~1.4s) Jarvis knows you're done and
// sends it automatically. No second click needed. (You can still tap the mic again to send early, and a
// safety cap stops a runaway recording.) This is the fix for "I have to click again for her to know I'm
// done." VAD = simple silence detection off the same mic-level meter that drives the orb.
let mediaRec = null, recChunks = [], recording = false, recTimer = null;
const VAD_SPEAK = 0.08;     // mic level above this = you're talking
const VAD_SILENCE_MS = 1400; // this much quiet AFTER you've spoken = you're done → auto-send
const VAD_MIN_MS = 500;      // ignore the first moment so it can't stop before you start
const VAD_MAX_MS = 15000;    // hard safety cap on one utterance (was 30s — long blobs = slow transcribes)
async function toggleRecord() {
  if (recording && mediaRec) { try { mediaRec.stop(); } catch {} return; }  // tap-again = send now
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { addMsg('err', 'Mic blocked — allow microphone access.'); return; }
  mediaRec = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {});
  recChunks = []; recording = true; setState('listening', 'listening · just pause when you’re done');
  const startedAt = Date.now(); let hasSpoken = false, silenceSince = 0;
  const finish = () => { try { if (mediaRec && mediaRec.state === 'recording') mediaRec.stop(); } catch {} };
  // VAD off the orb meter's level callback (no second AudioContext); auto-send on a natural pause.
  micMeterStop = meterMicStream(stream, (lvl) => {
    if (!recording) return;
    const now = Date.now();
    if (now - startedAt > VAD_MAX_MS) return finish();
    if (lvl > VAD_SPEAK) { hasSpoken = true; silenceSince = 0; }
    else if (hasSpoken && now - startedAt > VAD_MIN_MS) {
      if (!silenceSince) silenceSince = now;
      else if (now - silenceSince > VAD_SILENCE_MS) finish();
    }
  });
  // Safety cap even if the level meter isn't available (e.g. no AudioContext): stop after VAD_MAX_MS.
  recTimer = setTimeout(finish, VAD_MAX_MS + 500);
  mediaRec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  mediaRec.onstop = async () => {
    recording = false; if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (micMeterStop) { micMeterStop(); micMeterStop = null; } stream.getTracks().forEach((t) => t.stop());
    setState('thinking', 'transcribing…');
    try {
      const blob = new Blob(recChunks, { type: 'audio/webm' });
      // 15s hard timeout — "stays transcribing for a long time" was a hung STT request with no cap
      const r = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: blob, signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      if (d.text && d.text.trim()) sendToJarvis(d.text.trim()); else setState('idle', 'standby');
    } catch { addMsg('err', 'Transcription timed out — say it again.'); setState('idle', 'standby'); }
  };
  mediaRec.start();
}
// floorBtn now opens the in-app Floor view (see floor.js) — no separate site.

// ── settings: theme swatches (pick by mood) + open/close ─────────────────────
function applyTheme(name) {
  if (name === 'exec') name = 'black'; // migrate the old translucent default → the clean Jet Black
  const ok = ['black', 'white', 'exec', 'teal', 'mono', 'dark', 'arc', 'light'].includes(name) ? name : 'black';
  document.documentElement.dataset.theme = ok;
  document.querySelectorAll('.theme-swatch').forEach((s) => s.classList.toggle('on', s.dataset.theme === ok));
  try { localStorage.setItem('jarvis-theme', ok); } catch { /* private mode */ }
  if (window.Orb && window.Orb.refreshTheme) window.Orb.refreshTheme();
  // sync theme into the HQ iframe by reloading with ?theme= param
  const f = $('hqFrame'); if (f && f.getAttribute('src')) { const u = new URL(hqUrl); u.searchParams.set('theme', ok); f.src = u.toString(); }
}
document.querySelectorAll('.theme-swatch').forEach((s) => s.addEventListener('click', () => applyTheme(s.dataset.theme)));
applyTheme((() => { try { return localStorage.getItem('jarvis-theme') || 'black'; } catch { return 'black'; } })());
$('settingsBtn').addEventListener('click', () => { $('settingsView').hidden = false; });
$('settingsX').addEventListener('click', () => { $('settingsView').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('settingsView').hidden) $('settingsView').hidden = true; });

// ── JARVIS HQ as an in-app tab — opens inside this window, not a separate app ──
function openHQ() {
  const f = $('hqFrame');
  if (f) {
    const theme = document.documentElement.dataset.theme || 'mono';
    const u = new URL(hqUrl); u.searchParams.set('theme', theme);
    if (!f.getAttribute('src')) f.src = u.toString();
  }
  const pop = $('hqPop'); if (pop) pop.href = hqUrl;
  $('hqView').hidden = false;
}
function closeHQ() { $('hqView').hidden = true; }
window.JarvisHQ = { open: openHQ, close: closeHQ };
$('hqBtn').addEventListener('click', openHQ);
$('hqX').addEventListener('click', closeHQ);
$('hqRefresh').addEventListener('click', () => { const f = $('hqFrame'); if (f) f.src = hqUrl + (hqUrl.includes('?') ? '&' : '?') + 't=' + Date.now(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('hqView').hidden) closeHQ(); });

// ── everything clickable: the dashboard rail + home headline jump to the right view ──
function tap(btnId) { const b = $(btnId); if (b) b.click(); }
['urgentList', 'emailList', 'taskList'].forEach((id) => $(id).addEventListener('click', (e) => { if (!e.target.closest('.ds-empty')) tap('opsBtn'); }));
$('opsList').addEventListener('click', (e) => { if (!e.target.closest('.ds-empty')) tap('floorBtn'); });
$('feedList').addEventListener('click', (e) => { if (!e.target.closest('.ds-empty')) tap('activityBtn'); });
$('homeMetrics').addEventListener('click', (e) => { const hm = e.target.closest('[data-go]'); if (hm) tap(hm.getAttribute('data-go')); });
document.querySelector('.dash-grid').addEventListener('click', () => tap('commandBtn'));

// ── weather widget ───────────────────────────────────────────────────────────
let wxExpanded = false;
const WX_COND_COLOR = (code) => [95,96,99,65,82,86].includes(code) ? 'var(--err)' : [71,73,75,77,85].includes(code) ? '#8bb8ff' : 'var(--teal)';
const WX_EMOJI = (c) => [95,96,99].includes(c) ? '⛈' : [71,73,75,77,85,86].includes(c) ? '🌨' : [61,63,65,80,81,82].includes(c) ? '🌧' : [51,53,55].includes(c) ? '🌦' : [45,48].includes(c) ? '🌫' : [3].includes(c) ? '☁' : [2].includes(c) ? '⛅' : [1].includes(c) ? '🌤' : '☀';
async function loadWeather() {
  const top = $('wxTop'); if (!top) return;
  try {
    const wx = await fetch('/api/weather?days=5').then((r) => r.json());
    if (wx.error) { top.hidden = true; return; }
    const alertStyle = wx.severe ? `color:var(--err);font-weight:600;` : '';
    const color = WX_COND_COLOR(wx.code);
    // compact pill in the header (strip any emoji the API already put in front of cond → no double icon)
    const condText = String(wx.cond || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    top.innerHTML = `<span class="wx-ic">${WX_EMOJI(wx.code)}</span><span class="wx-t" style="color:${color}">${wx.temp}°</span><span class="wx-c">${esc(condText)}</span>${wx.severe ? '<span class="wx-sev">⚠</span>' : ''}`;
    top.hidden = false;
    // expanded forecast → a dropdown under the header
    const fcastHtml = (wx.forecast || []).map((f) => {
      const rain = f.rain > 20 ? `<span class="wx-rain">${f.rain}%🌧</span>` : '';
      return `<div class="wx-day"><div class="wx-day-name">${esc(f.day)}</div><div class="wx-day-hi" style="color:${WX_COND_COLOR(0)};">${f.hi}°</div><div class="wx-day-lo">${f.lo}°</div>${rain}</div>`;
    }).join('');
    const drop = $('wxDrop');
    if (drop) drop.innerHTML = `<div class="wx-full">
      <div class="wx-main-row">
        <span class="wx-cond" style="${alertStyle}color:${color}">${WX_EMOJI(wx.code)} ${esc(wx.cond)}</span>
        <span class="wx-temp-big">${wx.temp}°F</span>
        <span class="wx-feels">feels ${wx.feels}°</span>
      </div>
      <div class="wx-detail-row">
        <span>🌅 ${esc(wx.sunrise)}</span><span>🌇 ${esc(wx.sunset)}</span>
        <span title="UV Index" style="${wx.uv >= 8 ? 'color:var(--err)' : wx.uv >= 6 ? 'color:var(--warn)' : ''}">☀ UV ${wx.uv}</span>
        ${wx.aqiLabel ? `<span>🍃 ${esc(wx.aqiLabel)}</span>` : ''}
        <span>💧 ${wx.humidity}%</span><span>💨 ${wx.wind} mph</span>
      </div>
      <div class="wx-forecast">${fcastHtml}</div>
      ${wx.severe ? `<div class="wx-alert">⚠ SEVERE WEATHER — ${esc(wx.cond)}</div>` : ''}
    </div>`;
    top.onclick = () => { if (drop) drop.hidden = !drop.hidden; };
    // close the dropdown when clicking elsewhere
    if (drop && !drop._wired) { drop._wired = true; document.addEventListener('click', (e) => { if (!drop.hidden && !drop.contains(e.target) && e.target !== top && !top.contains(e.target)) drop.hidden = true; }); }
  } catch { if ($('wxTop')) $('wxTop').hidden = true; }
}

// ── focus mode ────────────────────────────────────────────────────────────────
const FOCUS_MODES = ['normal', 'gaming', 'work', 'dnd'];
const FOCUS_LABELS = { normal: '◉ normal', gaming: '🎮 gaming', work: '⚙ work', dnd: '🔕 dnd' };
const FOCUS_COLORS = { normal: '', gaming: '#a78bfa', work: 'var(--teal)', dnd: 'var(--warn)' };
let curFocus = 'normal';
async function setFocus(mode) {
  await fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) }).catch(() => {});
  curFocus = mode;
  const pill = $('focusPill'); if (!pill) return;
  pill.textContent = FOCUS_LABELS[mode] || mode;
  pill.style.borderColor = FOCUS_COLORS[mode] || '';
  pill.style.color = FOCUS_COLORS[mode] || '';
  if (mode === 'gaming') addMsg('j', 'Gaming mode active. Background agents paused — go get those dubs.');
}
$('focusPill') && $('focusPill').addEventListener('click', () => {
  const next = FOCUS_MODES[(FOCUS_MODES.indexOf(curFocus) + 1) % FOCUS_MODES.length];
  setFocus(next);
});

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
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000); // refresh every 30 min
fetch('/api/focus').then((r) => r.json()).then((d) => { if (d.mode) setFocus(d.mode); }).catch(() => {});

setState('idle', 'standby');
// SILENT ON OPEN (operator, 2026-07-20): no unsolicited greeting or speech when the app opens — sometimes
// you just want to work in quiet. Jarvis speaks only when YOU start it ("Hey Jarvis" / the mic / a reply).
// Opt back in any time with:  localStorage.setItem('jarvis-greet-on-open','1')
try {
  if (localStorage.getItem('jarvis-greet-on-open') === '1') {
    const _todayKey = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('jarvis-last-greet') !== _todayKey) {
      localStorage.setItem('jarvis-last-greet', _todayKey);
      setTimeout(() => { const _h = new Date().getHours(); const g = (_h < 12 ? 'Good morning' : _h < 18 ? 'Good afternoon' : 'Good evening') + ', Vinicio.'; addMsg('j', g); speak(g); }, 700);
    }
  }
} catch (e) { /* silent by default */ }
