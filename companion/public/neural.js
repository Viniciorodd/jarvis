// neural.js — the 3D PARTICLE NEURAL MAP (the last Trillion pattern: "a 3D representation of
// Trillion's brain… visual eye candy, which mostly looks cool"). A dependency-free canvas render —
// no three.js, just a fibonacci-sphere particle cloud with manual perspective projection — sitting
// BEHIND the whole home UI (z-index:-1), slowly rotating and breathing. It isn't dumb decoration:
//   • it breathes with HER VOICE (hooks the existing Orb.setLevel the TTS path already drives),
//   • it FLARES when agents are actually working (polls /api/skills; live skill = gold surge).
// Battery-aware: pauses when the tab is hidden, caps DPR at 2, honors prefers-reduced-motion.
(function () {
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 300;                 // particles
  const TEAL = [45, 212, 168];   // the Trillion palette: teal cloud…
  const PURPLE = [167, 139, 250]; // …with purple context nodes
  const GOLD = [245, 178, 60];   // activity flare

  let canvas, ctx, W, H, DPR;
  let level = 0;      // voice level 0..1 (fed by Orb hook)
  let flare = 0;      // activity surge 0..1 (fed by /api/skills)
  let t = 0, running = false;

  // ── the cloud: fibonacci sphere + radial jitter, precomputed neighbor links (no O(n²) per frame) ──
  const pts = [];
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = GA * i;
    const jitter = 0.72 + 0.4 * Math.random();
    pts.push({
      x: Math.cos(th) * r * jitter, y: y * jitter, z: Math.sin(th) * r * jitter,
      purple: Math.random() < 0.12, phase: Math.random() * Math.PI * 2, size: 0.8 + Math.random() * 1.6,
    });
  }
  const links = [];
  for (let i = 0; i < N; i++) {
    let added = 0;
    for (let j = i + 1; j < N && added < 2; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
      if (dx * dx + dy * dy + dz * dz < 0.09) { links.push([i, j]); added++; }
    }
  }

  function mount() {
    if (document.getElementById('neuralMap')) return;
    canvas = document.createElement('canvas');
    canvas.id = 'neuralMap';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
    hookOrb();
    pollActivity(); setInterval(pollActivity, 30000);
    if (REDUCED) { draw(0); return; } // one calm static frame — no motion
    start();
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.width = innerWidth * DPR;
    H = canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    if (REDUCED && ctx) draw(0);
  }

  // breathe with her voice: wrap the existing Orb.setLevel (app.js drives it while she speaks)
  function hookOrb() {
    const tryHook = () => {
      if (window.Orb && Orb.setLevel && !Orb._neural) {
        const orig = Orb.setLevel.bind(Orb);
        Orb.setLevel = (l) => { orig(l); level = Math.max(0, Math.min(1, l * 3)); };
        Orb._neural = true;
        return true;
      }
      return false;
    };
    if (!tryHook()) { const iv = setInterval(() => { if (tryHook()) clearInterval(iv); }, 1500); }
  }

  // flare when the system is actually doing something (a live skill within the last 2 minutes)
  async function pollActivity() {
    try {
      const d = await (await fetch('/api/skills', { cache: 'no-store' })).json();
      if ((d.skills || []).some((s) => s.live)) flare = 1;
    } catch { /* eye candy never errors */ }
  }

  function draw(time) {
    const cx = W / 2, cy = H * 0.42;                       // brain sits behind the greeting, not the nav
    const R = Math.min(W, H) * 0.34;
    const breathe = 1 + 0.035 * Math.sin(time * 0.0006) + level * 0.16 + flare * 0.06;
    const ry = time * 0.00009, rx = 0.35 + 0.08 * Math.sin(time * 0.00013);
    const cosY = Math.cos(ry), sinY = Math.sin(ry), cosX = Math.cos(rx), sinX = Math.sin(rx);
    const F = 3.2; // perspective
    ctx.clearRect(0, 0, W, H);

    const proj = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      const wob = 1 + 0.05 * Math.sin(time * 0.001 + p.phase);
      let x = p.x * wob, y = p.y * wob, z = p.z * wob;
      let x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;          // rotate Y
      let y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;        // tilt X
      const s = F / (F + z2);
      proj[i] = { sx: cx + x1 * R * breathe * s, sy: cy + y1 * R * breathe * s, s, z: z2 };
    }
    // links first (behind the dots). When agents are WORKING the whole web lerps teal → gold —
    // the unmistakable "brain lit up" moment from the Trillion videos, not a few hidden pixels.
    ctx.lineWidth = DPR * (0.5 + flare * 0.4);
    const lr = Math.round(TEAL[0] + (GOLD[0] - TEAL[0]) * flare);
    const lg = Math.round(TEAL[1] + (GOLD[1] - TEAL[1]) * flare);
    const lb = Math.round(TEAL[2] + (GOLD[2] - TEAL[2]) * flare);
    for (const [a, b] of links) {
      const A = proj[a], B = proj[b];
      const depth = Math.max(0, 1 - (A.z + B.z + 2) / 4);
      const al = (0.05 + 0.10 * depth) * (1 + flare * 1.6);
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${al})`;
      ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke();
    }
    // dots
    for (let i = 0; i < N; i++) {
      const p = pts[i], q = proj[i];
      const depth = Math.max(0.12, (q.s - 0.55) * 1.6);
      const c = flare > 0.55 && i % 9 === 0 ? GOLD : p.purple ? PURPLE : TEAL;
      const tw = 0.75 + 0.25 * Math.sin(time * 0.002 + p.phase);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(0.85, depth * tw * (0.7 + level * 0.5))})`;
      ctx.beginPath(); ctx.arc(q.sx, q.sy, p.size * DPR * q.s * (p.purple ? 1.5 : 1), 0, 6.2832); ctx.fill();
    }
    // decay the surges
    level *= 0.94; flare *= 0.985;
  }

  function start() {
    if (running || REDUCED) return;
    running = true;
    const loop = (time) => {
      if (document.hidden) { running = false; return; } // battery: stop cold when not visible
      t = time; draw(time);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  window.Neural = { pulse: () => { flare = 1; }, tick: () => draw(performance.now()) };
  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
