// jarvis-watchdog.mjs — the "bulletproof host" watchdog (Phase 2a). The existing run-loop.cmd already
// restarts the companion when it CRASHES (process exits). Two failure modes it can't see:
//   1) a HANG — the node process is alive but the event loop is wedged, so :8095 stops answering and
//      run-loop never fires (it only reacts to an exit). We detect that by polling /api/health and, after
//      N consecutive failures, killing the wedged listener PID so run-loop respawns a fresh one.
//   2) a TUNNEL DROP — the companion is fine but `tailscale serve` stopped mapping :8095, so the phone/Mac
//      lose Jarvis over HTTPS even though the PC is healthy. We periodically re-assert the serve mapping.
//
// Design (doctrine §11): the PARSE/DECIDE logic is PURE + eval-pinned (parseListenerPids, serveHasPort,
// decideAction); the side-effecting probes/kills/asserts are best-effort and NEVER throw out of the loop.
// SAFETY: we only ever taskkill a PID we've confirmed is node.exe AND is the listener on our port, and only
// after sustained health failure — never a healthy process, never a non-node process. Logs to logs/watchdog.log
// (run-loop.cmd redirects stdout there). Run supervised: start-jarvis.cmd launches it under run-loop.cmd.
//
// Env knobs: WATCH_PORT (8095), WATCH_HEALTH_URL, WATCH_INTERVAL_MS (30000), WATCH_FAIL_THRESHOLD (3),
//   WATCH_TUNNEL_EVERY (10 ticks), WATCH_ONESHOT=1 (run one tick and exit — for tests/manual checks).

import { execFile } from 'node:child_process';

const PORT = Number(process.env.WATCH_PORT || 8095);
const HEALTH_URL = process.env.WATCH_HEALTH_URL || `http://127.0.0.1:${PORT}/api/health`;
const INTERVAL_MS = Number(process.env.WATCH_INTERVAL_MS || 30000);
const FAIL_THRESHOLD = Number(process.env.WATCH_FAIL_THRESHOLD || 3);
const TUNNEL_EVERY = Number(process.env.WATCH_TUNNEL_EVERY || 10); // check the tunnel every N ticks
const SERVE_TARGET = `http://127.0.0.1:${PORT}`;

// ── PURE (eval-pinned) ───────────────────────────────────────────────────────────────────────────────
// From `netstat -ano -p tcp` output, the set of PIDs LISTENING on `port` (any local interface: 0.0.0.0,
// 127.0.0.1, [::], *). Returns a sorted array of numeric PID strings.
export function parseListenerPids(netstatOut, port) {
  const pids = new Set();
  for (const line of String(netstatOut || '').split(/\r?\n/)) {
    if (!/\bLISTENING\b/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    // cols: [proto, localAddr, foreignAddr, state, pid]
    if (cols.length < 5) continue;
    const local = cols[1] || '';
    const pid = cols[cols.length - 1];
    // local address ends with :<port> (handles 0.0.0.0:8095, 127.0.0.1:8095, [::]:8095, *:8095)
    if (new RegExp(`[:.\\]]${port}$`).test(local) && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }
  return Array.from(pids).sort();
}

// Does `tailscale serve status` output currently map our port? (tunnel is up)
export function serveHasPort(serveStatusOut, port) {
  return new RegExp(`:${port}(\\b|/|$)`).test(String(serveStatusOut || ''));
}

// Given consecutive failure count + threshold, what to do this tick.
export function decideAction(consecutiveFails, threshold = FAIL_THRESHOLD) {
  return consecutiveFails >= threshold ? 'restart' : (consecutiveFails > 0 ? 'watch' : 'ok');
}

// Is a tasklist line for `pid` a node.exe process? (safety gate before any kill)
export function isNodePid(tasklistOut, pid) {
  const re = new RegExp(`^\\s*"?node\\.exe"?\\s*[",]\\s*"?${pid}\\b`, 'im');
  return re.test(String(tasklistOut || '')) || new RegExp(`node\\.exe.*\\b${pid}\\b`, 'i').test(String(tasklistOut || ''));
}

// ── side-effecting helpers (best-effort; never throw) ──────────────────────────────────────────────────
const run = (cmd, args, timeout = 8000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout = '', stderr = '') =>
    resolve({ ok: !err, out: String(stdout) + String(stderr) }));
});

async function probeHealth() {
  try {
    const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
    const j = await r.json().catch(() => ({}));
    return { ok: j.companion !== false, why: j.companion === false ? 'companion:false' : '', body: j };
  } catch (e) { return { ok: false, why: e.name === 'TimeoutError' ? 'timeout' : (e.message || 'unreachable') }; }
}

// Kill the wedged listener(s) on PORT — but ONLY node.exe PIDs (safety). Returns the PIDs actually killed.
async function killWedgedListener() {
  const ns = await run('netstat', ['-ano', '-p', 'tcp']);
  const pids = parseListenerPids(ns.out, PORT);
  const killed = [];
  for (const pid of pids) {
    const tl = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    if (!isNodePid(tl.out, pid)) { log(`skip kill: PID ${pid} on :${PORT} is not node.exe`); continue; }
    const k = await run('taskkill', ['/F', '/PID', pid]);
    log(`kill wedged node PID ${pid} on :${PORT} → ${k.ok ? 'ok' : 'failed'}`);
    if (k.ok) killed.push(pid);
  }
  if (!pids.length) log(`no listener found on :${PORT} — supervisor (run-loop) should already be respawning`);
  return killed;
}

// Ensure `tailscale serve` still maps our port; re-assert if not. Idempotent + safe.
async function ensureTunnel() {
  const st = await run('tailscale', ['serve', 'status']);
  if (!st.ok) { log('tailscale not available — skipping tunnel check'); return; }
  if (serveHasPort(st.out, PORT)) return; // tunnel healthy
  log(`tunnel DROPPED (:${PORT} not in serve status) — re-asserting…`);
  // Newer tailscale: `serve --bg <target>`; fall back to the older explicit form if that errors.
  let r = await run('tailscale', ['serve', '--bg', SERVE_TARGET], 15000);
  if (!r.ok) r = await run('tailscale', ['serve', '--bg', '--https=443', SERVE_TARGET], 15000);
  log(`tunnel re-assert → ${r.ok ? 'ok' : 'failed: ' + r.out.trim().slice(0, 200)}`);
}

function log(msg) { console.log(`[${new Date().toISOString()}] watchdog: ${msg}`); }

// ── the loop ───────────────────────────────────────────────────────────────────────────────────────────
async function tick(state) {
  const h = await probeHealth();
  if (h.ok) {
    if (state.fails > 0) log(`recovered after ${state.fails} failed check(s)`);
    state.fails = 0;
  } else {
    state.fails += 1;
    log(`health FAIL #${state.fails} (${h.why})`);
    if (decideAction(state.fails) === 'restart') {
      await killWedgedListener();
      await ensureTunnel(); // a reboot/network blip can drop both at once
      state.fails = 0;      // give the respawn time before counting again
    }
  }
  state.ticks += 1;
  if (state.ticks % TUNNEL_EVERY === 0 && h.ok) await ensureTunnel(); // periodic tunnel check while healthy
  return state;
}

async function main() {
  log(`starting — polling ${HEALTH_URL} every ${INTERVAL_MS / 1000}s, restart after ${FAIL_THRESHOLD} fails`);
  const state = { fails: 0, ticks: 0 };
  if (process.env.WATCH_ONESHOT === '1') { await tick(state); return; }
  await ensureTunnel(); // assert once at boot
  for (;;) { await tick(state); await new Promise((r) => setTimeout(r, INTERVAL_MS)); }
}

if (process.argv[1] && process.argv[1].endsWith('jarvis-watchdog.mjs')) {
  main().catch((e) => { log(`fatal: ${e.message}`); process.exitCode = 1; });
}
