// vosk-wake.js — 100% offline "Jarvis" wake word via vosk-browser (WASM). No account, no API key,
// and the audio NEVER leaves your machine. The model is served locally from /models/. Vosk transcribes
// continuously on-device; when it hears "Jarvis …", the rest of the phrase becomes the command.
(function () {
  'use strict';
  const MODEL_URL = '/models/vosk-model-small-en-us-0.15.tar.gz';
  let model = null, recognizer = null, audioCtx = null, source = null, node = null, stream = null, running = false;

  async function start(onWake, onStatus) {
    if (running) return;
    if (!window.Vosk) { onStatus && onStatus('error', 'offline engine not loaded'); return; }
    onStatus && onStatus('loading', 'loading offline model…');
    try {
      if (!model) model = await window.Vosk.createModel(MODEL_URL); // cached after first load
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      recognizer = new model.KaldiRecognizer(audioCtx.sampleRate);

      let awaitingCommand = false, awaitTimer = null;
      const handle = (text) => {
        text = (text || '').toLowerCase().trim();
        if (!text) return;
        if (awaitingCommand) { clearTimeout(awaitTimer); awaitingCommand = false; onWake(text); return; }
        const m = text.match(/jarvis[\s,]*(.*)/);
        if (!m) return;
        const cmd = m[1].trim();
        if (cmd.length > 1) onWake(cmd);                       // "jarvis, do X" → X
        else { awaitingCommand = true; onStatus && onStatus('listening', 'yes?'); awaitTimer = setTimeout(() => (awaitingCommand = false), 6000); }
      };
      recognizer.on('result', (msg) => handle(msg.result && msg.result.text));

      source = audioCtx.createMediaStreamSource(stream);
      node = audioCtx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => { try { recognizer.acceptWaveform(e.inputBuffer); } catch { /* skip frame */ } };
      source.connect(node); node.connect(audioCtx.destination);
      running = true;
      onStatus && onStatus('listening', 'listening (offline)');
    } catch (e) { onStatus && onStatus('error', e.message || 'wake failed'); stop(); }
  }

  function stop() {
    running = false;
    try { if (node) { node.onaudioprocess = null; node.disconnect(); } } catch { /* */ }
    try { source && source.disconnect(); } catch { /* */ }
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    try { audioCtx && audioCtx.close(); } catch { /* */ }
    node = source = stream = audioCtx = null; // keep `model` cached for instant restart
  }

  window.VoskWake = { start, stop, get running() { return running; } };
})();
