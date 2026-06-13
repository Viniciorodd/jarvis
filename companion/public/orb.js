// Reactive particle-ring orb (matches reference image #2). Pure canvas, no deps.
// States: 'idle' (calm drift), 'listening' (ripple out), 'thinking' (fast swirl),
// 'speaking' (pulse). window.Orb.setState(name) drives it.
(function () {
  const canvas = document.getElementById('orb');
  const ctx = canvas.getContext('2d');
  let W, H, cx, cy, R;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2; cy = H / 2;
    R = Math.min(W, H) * 0.30;
  }
  window.addEventListener('resize', resize);

  // build particles on several concentric rings
  const N = 520;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const ring = Math.floor(Math.random() * 3); // 0,1,2
    parts.push({
      a: Math.random() * Math.PI * 2,
      ring,
      rr: 0.82 + ring * 0.12 + Math.random() * 0.05, // radius multiplier
      sp: (0.0006 + Math.random() * 0.0016) * (ring % 2 ? -1 : 1), // angular speed
      ph: Math.random() * Math.PI * 2,
      sz: 0.7 + Math.random() * 1.4,
    });
  }

  let state = 'idle';
  let energy = 0;        // 0..1 eased toward target
  let target = 0;
  const TARGETS = { idle: 0.12, listening: 0.5, thinking: 0.85, speaking: 0.7 };
  let t = 0;

  function setState(s) { state = s; target = TARGETS[s] ?? 0.12; }
  window.Orb = { setState };

  function frame() {
    t += 1;
    energy += (target - energy) * 0.05;
    ctx.clearRect(0, 0, W, H);

    // soft core glow
    const pulse = state === 'speaking' ? (0.5 + 0.5 * Math.sin(t * 0.12)) : (0.5 + 0.5 * Math.sin(t * 0.02));
    const coreR = R * (0.34 + energy * 0.12 + pulse * 0.05 * energy);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
    g.addColorStop(0, `rgba(57,224,208,${0.10 + energy * 0.20})`);
    g.addColorStop(0.5, `rgba(40,150,150,${0.05 + energy * 0.08})`);
    g.addColorStop(1, 'rgba(4,7,15,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2); ctx.fill();

    // faint inner dial
    ctx.strokeStyle = `rgba(57,224,208,${0.12 + energy * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.stroke();

    // particles
    const wobAmp = R * (0.04 + energy * 0.16);
    const speedMul = 1 + energy * 3;
    for (const p of parts) {
      p.a += p.sp * speedMul;
      const wob = Math.sin(t * 0.03 * speedMul + p.ph) * wobAmp
                + Math.sin(p.a * 6) * wobAmp * 0.35 * energy;
      const rad = R * p.rr + wob;
      const x = cx + Math.cos(p.a) * rad;
      const y = cy + Math.sin(p.a) * rad;
      const alpha = 0.22 + energy * 0.6 + (p.ring === 0 ? 0.1 : 0);
      ctx.fillStyle = `rgba(${120 + p.ring * 30},${224},${208},${Math.min(1, alpha)})`;
      ctx.beginPath();
      ctx.arc(x, y, p.sz * (0.8 + energy * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
