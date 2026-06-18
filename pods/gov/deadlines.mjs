// Deadline radar — auto-remind. The Operations view already shows a visual radar of bid response
// deadlines; this is the push: before a bid we're pursuing closes, alert the operator (HQ "Needs you" +
// Telegram) so a deadline never lapses unseen. Deterministic (doctrine §0): which bids are due is decided
// in code over the event store, not by an LLM. Idempotent: a reminder IS an event (action
// 'deadline.reminded'), so we never re-ping the same notice for the same deadline.

import { CP_URL, emit, mirror, notify } from '../lib.mjs';

const DAY = 86400000;

// Two reminder stages so a bid can't slip after one early ping: 'soon' fires when it enters the window,
// 'final' fires at ≤1 day. Each stage is sent at most once per (notice, deadline). PURE.
export function stageFor(daysLeft, withinDays) {
  if (daysLeft < 0) return null;
  if (daysLeft <= 1) return 'final';
  if (daysLeft <= withinDays) return 'soon';
  return null;
}

// PURE (eval-pinned): which pursued bids need a reminder right now, and at which stage? Returns
// [{ noticeId, title, deadline, daysLeft, stage, url, placeState }] sorted soonest-first.
export function dueReminders(events = [], now = new Date(), { withinDays = 7 } = {}) {
  // LATEST score per notice (append order = chronological), so a bid→no-bid flip drops out. Skip SIM leftovers.
  const latest = new Map();
  for (const e of events) {
    if (e.action !== 'bid.score') continue;
    const p = e.payload || {};
    if (!p.noticeId || String(p.noticeId).startsWith('SIM')) continue;
    latest.set(p.noticeId, p);
  }
  // stages already sent → don't repeat (key = notice|deadline|stage)
  const reminded = new Set();
  for (const e of events) {
    if (e.action !== 'deadline.reminded') continue;
    const p = e.payload || {};
    if (p.noticeId) reminded.add(`${p.noticeId}|${p.deadline || ''}|${p.stage || 'soon'}`);
  }
  const out = [];
  for (const p of latest.values()) {
    if (p.recommendation !== 'bid' || !p.deadline) continue;         // only bids we're actually chasing
    const due = new Date(p.deadline);
    if (isNaN(due)) continue;
    const daysLeft = Math.floor((due - now) / DAY);
    const stage = stageFor(daysLeft, withinDays);
    if (!stage) continue;                                            // not in a reminder window (or closed)
    if (reminded.has(`${p.noticeId}|${p.deadline}|${stage}`)) continue; // this stage already sent
    out.push({ noticeId: p.noticeId, title: p.title, deadline: p.deadline, daysLeft, stage, url: p.url, placeState: p.placeState });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

function whenText(daysLeft) {
  if (daysLeft <= 0) return 'closes TODAY';
  if (daysLeft === 1) return 'closes TOMORROW';
  return `closes in ${daysLeft} days`;
}
const stageTitle = (stage, daysLeft) => stage === 'final' ? `🚨 FINAL NOTICE — bid ${whenText(daysLeft)}` : `⏰ Bid deadline — ${whenText(daysLeft)}`;

// Read the gov event store, find bids closing soon, push a reminder for each new one, and record the
// reminder as an event (idempotency + audit). Runnable as a CLI and from the control-plane endpoint.
export async function runDeadlineRadar({ withinDays = 3 } = {}) {
  let events = [];
  try {
    const r = await fetch(CP_URL + '/events?pod=gov', { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    events = Array.isArray(d) ? d : (d.events || []);
  } catch (e) {
    await emit({ kind: 'trace', actor: 'SAM-SCOUT', pod: 'gov', action: 'deadline.skip', status: 'error', rationale: 'cannot read events: ' + e.message });
    return { ok: false, note: e.message };
  }
  const due = dueReminders(events, new Date(), { withinDays });
  for (const d of due) {
    await notify({
      pod: 'Gov War Room',
      title: stageTitle(d.stage, d.daysLeft),
      detail: `"${String(d.title || '').slice(0, 90)}"${d.placeState ? ' (' + d.placeState + ')' : ''} — response due ${String(d.deadline).slice(0, 10)}. Review the draft & submit.${d.url ? '\n' + d.url : ''}`,
      verb: 'Open draft', xp: d.stage === 'final' ? 50 : 25,
    });
    // the reminder IS the record — future ticks see this stage and won't re-ping it for this deadline
    await emit({ kind: 'action', actor: 'SAM-SCOUT', pod: 'gov', action: 'deadline.reminded', status: 'done', rationale: `Reminded (${d.stage}): ${String(d.title || '').slice(0, 80)} ${whenText(d.daysLeft)}`, payload: { noticeId: d.noticeId, deadline: d.deadline, daysLeft: d.daysLeft, stage: d.stage } });
  }
  await mirror('SAM-SCOUT', due.length ? 'need' : 'idle', due.length ? `${due.length} bid deadline(s) closing soon` : 'No bid deadlines closing in the next few days');
  return { ok: true, reminded: due.length, due };
}

if (process.argv[1] && process.argv[1].endsWith('deadlines.mjs')) {
  runDeadlineRadar({ withinDays: Number(process.env.DEADLINE_WINDOW_DAYS || 7) })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
