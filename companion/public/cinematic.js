/* cinematic.js — the "wake up, Jarvis" boot flourish.
   Either saying "wake up Jarvis" (hooked from app.js wakeCommand) OR a clap (when armed)
   plays a short ORIGINAL synth power-up sting (WebAudio — no film soundtrack, no copyright)
   and speaks a signature JARVIS line. Opt-in via the "Cinematic wake" setting. */
(function () {
  'use strict';
  var KEY = 'jarvis-cinematic';
  var enabled = false;
  try { enabled = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function ctx() {
    try { return (typeof window.ac === 'function' && window.ac()) || new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }

  var LINES = [
    'At your service, sir.',
    'Online and ready, sir.',
    'Good to have you back, sir. All systems are online.',
    'Powering up. Standing by for your command.',
  ];

  /* ── original "power-up" sting: a rising sweep + a shimmer chord, ~1.2s ── */
  function sting() {
    var ac = ctx(); if (!ac) return;
    var t0 = ac.currentTime;
    var master = ac.createGain();
    master.gain.value = 0.0001;
    master.connect(ac.destination);
    // swell envelope
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.5, t0 + 0.18);
    master.gain.exponentialRampToValueAtTime(0.18, t0 + 0.7);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);

    // rising sweep (the "boot" feel)
    var sweep = ac.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(120, t0);
    sweep.frequency.exponentialRampToValueAtTime(720, t0 + 0.45);
    var sweepGain = ac.createGain();
    sweepGain.gain.setValueAtTime(0.35, t0);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t0); lp.frequency.exponentialRampToValueAtTime(4000, t0 + 0.5);
    sweep.connect(sweepGain); sweepGain.connect(lp); lp.connect(master);
    sweep.start(t0); sweep.stop(t0 + 0.65);

    // shimmer chord (a perfect-fifth stack settling in) — the "online" resolve
    [392.0, 587.33, 783.99].forEach(function (f, i) {
      var o = ac.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      var g = ac.createGain();
      var on = t0 + 0.32 + i * 0.05;
      g.gain.setValueAtTime(0.0001, on);
      g.gain.exponentialRampToValueAtTime(0.22, on + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.25);
      o.connect(g); g.connect(master);
      o.start(on); o.stop(t0 + 1.3);
    });
  }

  function boot() {
    sting();
    var line = LINES[Math.floor(Math.random() * LINES.length)];
    // let the sting breathe, then she speaks
    setTimeout(function () {
      if (typeof window.speak === 'function') window.speak(line);
    }, 950);
  }

  /* ── clap detection: a sharp amplitude transient on its own mic analyser ── */
  var clapStream = null, clapRAF = null, lastClap = 0, prevRms = 0;
  function armClap() {
    if (clapStream) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      clapStream = stream;
      var ac = ctx(); if (!ac) return;
      var src = ac.createMediaStreamSource(stream);
      var an = ac.createAnalyser(); an.fftSize = 512;
      src.connect(an);
      var buf = new Uint8Array(an.fftSize);
      (function tick() {
        if (!clapStream) return;
        an.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
        var rms = Math.sqrt(sum / buf.length);
        var now = Date.now();
        // clap = loud + very sharp onset vs the previous frame + debounced
        if (rms > 0.22 && rms > prevRms * 3.2 && (now - lastClap) > 1500) {
          lastClap = now;
          boot();
        }
        prevRms = rms * 0.6 + prevRms * 0.4;   // smooth baseline
        clapRAF = requestAnimationFrame(tick);
      })();
    }).catch(function () { /* mic blocked — voice path still works */ });
  }
  function disarmClap() {
    if (clapRAF) cancelAnimationFrame(clapRAF);
    if (clapStream) { try { clapStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    clapStream = null; prevRms = 0;
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {}
    if (enabled) armClap(); else disarmClap();
    syncBtn();
  }

  /* ── settings toggle ── */
  function syncBtn() {
    var b = document.getElementById('cinematicBtn');
    if (!b) return;
    b.classList.toggle('on', enabled);
    b.textContent = '🎬 Cinematic wake: ' + (enabled ? 'on' : 'off');
  }
  function wireBtn() {
    var b = document.getElementById('cinematicBtn');
    if (!b) return;
    b.addEventListener('click', function () { setEnabled(!enabled); });
    syncBtn();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBtn);
  else wireBtn();
  if (enabled) armClap();   // resume across reloads

  // app.js wakeCommand() calls this on "wake up" so the voice path also fires the flourish
  window.JarvisCinematic = { boot: boot, get enabled() { return enabled; }, setEnabled: setEnabled };
})();
