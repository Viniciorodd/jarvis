// Conservative scheduler (the operator's token-discipline ask).
//   - Agents wake ONLY inside working hours, ONLY on their cadence.
//   - "poll" jobs do a CHEAP check for new work first; if idle, they log a 'rest' and spend nothing
//     (no LLM call). Only a real order/ticket wakes the pod to do the job to completion.
//   - "scan"/"brief"/"reflect" jobs fire on a time anchor (e.g. 1 gov scan/day at 08:00).
//   - Aggressiveness is policy in schedule.json, not code — and going more aggressive is an evals-gated
//     promotion the operator approves (doctrine §8).
// Dependency-free. Run standalone (`node control-plane/scheduler.mjs`) OR drive `tick()` from an n8n
// Schedule node hitting the control-plane. The pure `dueJobs()` is eval-tested.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const POLICY_FILE = path.join(DIR, 'schedule.json');
const STATE_FILE = path.join(DIR, 'data', 'scheduler-state.json');
const CP_URL = (process.env.CONTROL_PLANE_URL || 'http://localhost:8787').replace(/\/$/, '');
const TICK_MS = Number(process.env.SCHEDULER_TICK_MS || 15 * 60 * 1000); // re-evaluate every 15 min

export function loadPolicy(file = POLICY_FILE) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { lastRuns: {} }; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

/**
 * PURE: which jobs are due right now? Respects working hours + cadence + time anchors. No I/O.
 * @param policy   parsed schedule.json
 * @param now      Date
 * @param lastRuns { [jobId]: ISO string }
 */
export function dueJobs(policy, now = new Date(), lastRuns = {}) {
  const hour = now.getHours();
  const wh = policy.working_hours || { start: 0, end: 24 };
  const within = hour >= wh.start && hour < wh.end;
  if (!within) return []; // outside working hours → everyone rests

  const out = [];
  for (const job of policy.jobs || []) {
    const last = lastRuns[job.id] ? new Date(lastRuns[job.id]) : null;

    if (job.at_hour != null) {
      // time-anchored daily/weekly job
      if (job.at_dow != null && now.getDay() !== job.at_dow) continue;
      if (hour < job.at_hour) continue;
      if (job.at_dow != null) {
        const days = last ? (now - last) / 86400000 : Infinity;
        if (days < 6) continue;            // weekly: already ran this week
      } else if (last && last.toDateString() === now.toDateString()) {
        continue;                          // daily: already ran today
      }
      out.push(job);
    } else if (job.cadence_hours) {
      const hrs = last ? (now - last) / 3600000 : Infinity;
      if (hrs >= job.cadence_hours) out.push(job);
    }
  }
  return out;
}

// Cheap, NON-LLM check for whether a poll job actually has work. Default: assume idle (rest, spend nothing).
// Wire a real check by setting JOB_CHECK_URL (the scheduler POSTs {job} and expects {hasWork, detail}),
// or have n8n flip this by posting orders into HQ. This is the "don't burn tokens if we don't have to" gate.
async function checkForWork(job) {
  const url = process.env.JOB_CHECK_URL;
  if (!url) return { hasWork: false, detail: 'idle (no work checker configured)' };
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job }) });
    if (!r.ok) return { hasWork: false, detail: 'checker ' + r.status };
    return await r.json();
  } catch (e) { return { hasWork: false, detail: 'checker error: ' + e.message }; }
}

async function post(pathname, body) {
  try { await fetch(CP_URL + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { console.error('scheduler post failed', pathname, e.message); }
}
const logRest = (job) => post('/events', { kind: 'trace', actor: job.person, pod: job.pod, action: 'rest', status: 'done', cost_usd: 0, rationale: 'idle — no new work; conserving tokens', payload: { job: job.id } });
// Most jobs wake a pod through the Chief-of-Staff router (/command). Deterministic "maintenance" jobs
// (EOD log, deadline radar) instead POST their own control-plane endpoint directly — no LLM in the loop.
const fire = (job) => job.endpoint ? post(job.endpoint, { source: 'scheduler:' + job.id }) : post('/command', { text: job.command, source: 'scheduler:' + job.id });

export async function tick(now = new Date()) {
  // KILL SWITCH (doctrine §9 / Trillion Tier 6): when the operator pauses proactive behavior, the
  // scheduler fires NOTHING — no jobs, no LLM spend — until resume (or the pause's auto-expiry).
  try {
    const { getPause, pauseActive } = await import('../pods/pause.mjs');
    if (pauseActive(getPause(), now.getTime())) return [];
  } catch { /* pause module optional — never let the kill switch kill the scheduler itself */ }
  const policy = loadPolicy();
  const state = loadState();
  const due = dueJobs(policy, now, state.lastRuns);
  for (const job of due) {
    state.lastRuns[job.id] = now.toISOString();
    if (job.type === 'poll') {
      const work = await checkForWork(job);
      if (!work.hasWork) { await logRest(job); continue; } // rest — no LLM spend
    }
    await fire(job); // wakes the pod via the Chief-of-Staff router
  }
  saveState(state);
  return due.map((j) => j.id);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`JARVIS scheduler → ${CP_URL} · tick every ${Math.round(TICK_MS / 60000)} min`);
  console.log('  conservative defaults: working-hours only, idle polls rest (zero tokens).');
  tick();
  setInterval(tick, TICK_MS);
}
