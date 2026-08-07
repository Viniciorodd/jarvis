// social-loop.mjs — the supervised service that runs the publishing loop. Master PRD §7 phase 5.
//
// Runs on the PC, not the NAS, for one blunt reason: the content pack lives in his Obsidian vault and
// the NAS cannot see it. Supervised by scripts/run-loop.cmd like the other four services, so a crash
// restarts with backoff instead of dying silently.
//
// ── WHY A TICKING SERVICE AND NOT A CRON ────────────────────────────────────────────────────────────
// The kill window has to be checked BETWEEN proposing and publishing. A cron that fired once and did
// both would have to sleep through the window inside one process, and a `/kill` arriving mid-sleep
// would have nothing to talk to. A service that ticks reads the decision file every minute, so the
// window is real and `/kill` lands wherever it lands.
//
// SCHEDULE, and it is deliberately conservative:
//   propose  — Monday 09:00 local, once. A batch is a week of posts.
//   publish  — every minute, but it only acts once the window has closed or he approved. The hard cap
//              of 2 per platform per day then spreads a 7-post batch across the week on its own, which
//              is the pacing the PRD asked for and it comes from a limit rather than a sleep.

import { propose, publishPending, readState } from '../pods/social/run.mjs';
import { readMode } from '../pods/social/batch.mjs';

const TICK_MS = 60_000;
const PROPOSE_DAY = 1;      // Monday
const PROPOSE_HOUR = 9;

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[social ${stamp()}]`, ...a);

/** PURE: should a new batch be proposed now? `lastBatchId` is the yyyymmddhhmmss of the last one. */
export function shouldPropose(now, lastBatchId = '') {
  const d = new Date(now);
  if (d.getDay() !== PROPOSE_DAY || d.getHours() !== PROPOSE_HOUR) return false;
  // One per calendar day, keyed off the batch id's date part — a restart inside the hour must not
  // propose a second batch on top of the first.
  return String(lastBatchId).slice(0, 8) !== `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function tick() {
  const now = new Date();
  const state = readState();

  if (shouldPropose(now, state && state.batchId)) {
    const r = await propose();
    log(r.ok ? `proposed batch ${r.state.batchId} — ${r.state.items.length} post(s), window closes ${r.state.closesAt}`
      : `nothing proposed: ${r.why}`);
    return;
  }

  if (!state || state.decision === 'kill') return;
  if (state.ranAt && state.result && !state.result.failed) return;   // already run to completion

  // dryRun:false — this is the live path. Every gate in pods/brand/publish.mjs still runs, and the
  // kill switch is checked inside runOnce, not here.
  const r = await publishPending({ dryRun: false });
  if (!r.ok) return;                                                  // waiting on the window; stay quiet
  if (r.halted) { log('HALTED:', r.halted); return; }
  if (r.published.length || r.failed.length) {
    log(`published ${r.published.length}, failed ${r.failed.length}`);
    for (const p of r.published) log('  ->', p.platform, p.url, p.verified ? '(verified)' : '(UNVERIFIED)');
    for (const f of r.failed) log('  !!', f.id, f.reason);
  }
}

// 🚨 ONLY TICK WHEN RUN AS A SERVICE, NEVER ON IMPORT.
//
// Without this guard, `import('../scripts/social-loop.mjs')` — which is exactly what the eval for
// shouldPropose() does — ran tick() immediately, and tick() calls publishPending({ dryRun: false }).
// It happened to return early on the state that existed at the time. That is luck, not safety: a test
// suite must not be one state file away from publishing to his account.
const isMain = process.argv[1] && /social-loop\.mjs$/.test(process.argv[1]);
if (isMain) {
  log(`starting — mode: ${readMode()}, propose Mondays ${PROPOSE_HOUR}:00, publish checked every ${TICK_MS / 1000}s`);
  const run = () => tick().catch((e) => log('tick failed:', e && e.message ? e.message : e));
  run();
  setInterval(run, TICK_MS);
}
