// Reactive particle-ring orb (matches reference image #2). Pure canvas, no deps.
// States: 'idle' (calm drift), 'listening' (ripple out), 'thinking' (fast swirl),
// 'speaking' (pulse). window.Orb.setState(name) drives it. Its color follows the active
// theme — it reads --teal-rgb from CSS; call window.Orb.refreshTheme() after a theme change.
(function () {
  const canvas = document.getElementById('orb');
  const ctx = canvas.getContext('2d');
  let W, H, cx, cy, R;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  let ACC = [57, 224, 208];
  function refreshTheme() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--teal-rgb').trim();
    const m = v.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) ACC = [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2; cy = H / 2;
    R = Math.min(W, H) * 0.30;
  }
  window.addEventListener('resize', resize);

  const N = 520;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const ring = Math.floor(Math.random() * 3);
    parts.push({
      a: Math.random() * Math.PI * 2,
      ring,
      rr: 0.82 + ring * 0.12 + Math.random() * 0.05,
      sp: (0.0006 + Math.random() * 0.0016) * (ring % 2 ? -1 : 1),
      ph: Math.random() * Math.PI * 2,
      sz: 0.7 + Math.random() * 1.4,
    });
  }

  let state = 'idle';
  let energy = 0;
  let target = 0;
  const TARGETS = { idle: 0.12, listening: 0.5, thinking: 0.85, speaking: 0.7 };
  let t = 0;
  // live audio reactivity: setLevel(0..1) is fed every frame from the actual TTS/mic audio,
  // so the orb breathes with HER voice and YOURS instead of looping the same animation.
  let level = 0, levelTarget = 0;
  let voiceSrc = null; // 'jarvis' (accent) | 'user' (warm white) | null

  function setState(s) { state = s; target = TARGETS[s] ?? 0.12; }
  function setLevel(x) { levelTarget = Math.max(0, Math.min(1, Number(x) || 0)); }
  function setVoice(src) { voiceSrc = (src === 'jarvis' || src === 'user') ? src : null; }
  window.Orb = { setState, setLevel, setVoice, refreshTheme };

  function frame() {
    t += 1;
    energy += (target - energy) * 0.05;
    level += (levelTarget - level) * 0.35;          // tracks the actual audio envelope fast
    const live = Math.max(energy, level);            // audio overrides the resting state animation
    ctx.clearRect(0, 0, W, H);
    // color follows the speaker: accent for Jarvis, warm white when YOU talk (so you can see it hear you)
    let r = ACC[0], g0 = ACC[1], b = ACC[2];
    if (voiceSrc === 'user') { const k = 0.35 + level * 0.55; r = Math.round(r + (245 - r) * k); g0 = Math.round(g0 + (247 - g0) * k); b = Math.round(b + (250 - b) * k); }

    // the core pulses on every audio peak — a real reaction, not a fixed loop
    const beat = level * 0.9;
    const pulse = (state === 'speaking' || voiceSrc) ? (0.5 + 0.5 * Math.sin(t * 0.12)) : (0.5 + 0.5 * Math.sin(t * 0.02));
    const coreR = R * (0.34 + live * 0.14 + pulse * 0.05 * live + beat * 0.10);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
    grad.addColorStop(0, `rgba(${r},${g0},${b},${0.10 + live * 0.24})`);
    grad.addColorStop(0.5, `rgba(${Math.round(r * 0.7)},${Math.round(g0 * 0.66)},${Math.round(b * 0.72)},${0.05 + live * 0.09})`);
    grad.addColorStop(1, 'rgba(4,7,15,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = `rgba(${r},${g0},${b},${0.12 + live * 0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.stroke();

    const wobAmp = R * (0.04 + live * 0.16 + beat * 0.12);
    const speedMul = 1 + live * 3;
    for (const p of parts) {
      p.a += p.sp * speedMul;
      const wob = Math.sin(t * 0.03 * speedMul + p.ph) * wobAmp
                + Math.sin(p.a * 6) * wobAmp * 0.35 * live;
      const rad = R * p.rr + wob;
      const x = cx + Math.cos(p.a) * rad;
      const y = cy + Math.sin(p.a) * rad;
      const alpha = 0.22 + live * 0.6 + (p.ring === 0 ? 0.1 : 0);
      const lift = p.ring * 16;
      ctx.fillStyle = `rgba(${Math.min(255, r + lift)},${g0},${b},${Math.min(1, alpha)})`;
      ctx.beginPath();
      ctx.arc(x, y, p.sz * (0.8 + live * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  resize();
  refreshTheme();
  requestAnimationFrame(frame);
})();
