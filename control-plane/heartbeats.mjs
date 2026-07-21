// heartbeats.mjs — "agents must visibly confirm they're running (no silent clicks)" (vault [[Jarvis]]).
// The activity feed hides trace/rest events, so a scheduled agent that runs and finds no work leaves NO
// visible mark — the operator can't tell it ran. This computes the LAST run per agent from the full event
// log (INCLUDING rests), so every agent can show a heartbeat: who ran, when, and whether it did work or
// rested. Pure + deterministic — eval-pinned.

const MIN = 60000;

// PURE: last run per actor across ALL events (trace/rest included). now drives staleness.
// Returns [{ actor, pod, lastRun, minsAgo, action, status, kind, rested, rationale }], freshest first.
export function agentHeartbeats(events = [], now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const last = new Map();
  for (const e of events) {
    const actor = e && e.actor;
    if (!actor) continue;
    const prev = last.get(actor);
    if (!prev || (e.ts || '') > (prev.ts || '')) last.set(actor, e);
  }
  return [...last.values()]
    .map((e) => ({
      actor: e.actor,
      pod: e.pod || 'system',
      lastRun: e.ts || null,
      minsAgo: e.ts ? Math.max(0, Math.round((t - new Date(e.ts).getTime()) / MIN)) : null,
      action: e.action || '',
      status: e.status || 'done',
      kind: e.kind || 'trace',
      rested: e.action === 'rest', // ran but found no work — still a real heartbeat
      rationale: (e.rationale || '').slice(0, 120),
    }))
    .sort((a, b) => (b.lastRun || '').localeCompare(a.lastRun || ''));
}

// PURE: one-line summary — how many agents have a heartbeat in the last `windowHrs`, and any that are stale.
export function heartbeatSummary(heartbeats = [], windowHrs = 24) {
  const win = windowHrs * 60;
  const active = heartbeats.filter((h) => h.minsAgo != null && h.minsAgo <= win);
  const stale = heartbeats.filter((h) => h.minsAgo == null || h.minsAgo > win);
  return {
    total: heartbeats.length,
    activeCount: active.length,
    staleCount: stale.length,
    text: `${active.length} of ${heartbeats.length} agent(s) ran in the last ${windowHrs}h`
      + (stale.length ? ` · ${stale.length} quiet longer` : ''),
  };
}
