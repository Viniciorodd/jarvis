// task-dates.mjs — proposing due dates for the vault's undated tasks, so "Today" can finally mean today.
//
// Found while fixing the Today screen (2026-07-29): **0 of 140 open tasks carry any date.** 14 are marked
// highest priority, 107 have no priority at all. No ranking can compute "due today" from that — the screen
// was never broken so much as starved. The operator asked for the flow where Jarvis proposes dates and he
// just confirms.
//
// DETERMINISTIC ON PURPOSE (doctrine rule 1: LLM proposes, CODE disposes). Dates are arithmetic over
// priority and capacity, and a model would happily invent "next Tuesday" for a task it half-understood. The
// only thing read from the task TEXT is an explicit date the operator already wrote — never an inferred one.
//
// Nothing here writes anything. A proposal is a suggestion until he confirms it, one task at a time.

const pad = (n) => String(n).padStart(2, '0');
export function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }

// PURE: a date the operator ALREADY wrote in the task text ("by 8/12", "due 2026-08-12", "on Aug 12").
// Only explicit calendar dates count. "next week" is an inference, and an inferred deadline that turns out
// wrong is worse than no deadline — he'd trust it.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function statedDate(text = '', today = '') {
  const t = String(text || '');
  const isoHit = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoHit) return isoHit[0];
  const y = today ? parseISO(today).getFullYear() : new Date().getFullYear();
  const named = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i);
  if (named) {
    const mm = MONTHS[named[1].toLowerCase()];
    return (named[3] || y) + '-' + pad(mm) + '-' + pad(Number(named[2]));
  }
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);
  if (slash) {
    const mm = Number(slash[1]), dd = Number(slash[2]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      let yy = slash[3] ? Number(slash[3]) : y;
      if (yy < 100) yy += 2000;
      return yy + '-' + pad(mm) + '-' + pad(dd);
    }
  }
  return null;
}

// PURE: how many days out a priority band belongs. Undated highest-priority work should land this week;
// an unprioritised backlog item should not pretend to be urgent.
const HORIZON = { highest: 3, high: 7, medium: 21, normal: 30, low: 45, lowest: 60 };
export function horizonFor(priority) { return HORIZON[priority] ?? 30; }

// PURE: next weekday on/after d. Business tasks landing on a Sunday are dates he'll blow through, and a
// missed date teaches him to ignore ALL of them.
export function nextWeekday(d) {
  const out = new Date(d);
  while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() + 1);
  return out;
}

// PURE: propose a date for every undated task, spread so no day is overloaded. Returns one row per task:
// { id, text, priority, due, reason, stated }. `perDay` is the honest constraint — 14 "highest" tasks all
// due tomorrow is not a plan, it is the same undated pile with a date stamped on it.
export function proposeDates(tasks = [], { today = iso(new Date()), perDay = 2, limit = 0 } = {}) {
  const open = (Array.isArray(tasks) ? tasks : []).filter((t) => t && !t.done && !t.due && !t.scheduled && t.text);
  const rank = { highest: 0, high: 1, medium: 2, normal: 3, low: 4, lowest: 5 };
  const sorted = [...open].sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3));
  const used = new Map();
  const out = [];
  const start = parseISO(today);
  // ADAPTIVE HORIZON. A fixed 3-day window for "highest" sounds decisive until he has fourteen of them — then
  // every day inside the window overflows and they all pile onto the same date, which is the undated backlog
  // again with a date stamped on it. If a band needs more weekdays than its horizon has, the horizon stretches.
  // Telling him fourteen top-priority tasks take three weeks is the honest answer; pretending otherwise is how
  // a plan becomes decoration.
  const bandNeed = new Map();
  for (const t of sorted) {
    const b = t.priority || 'normal';
    bandNeed.set(b, (bandNeed.get(b) || 0) + 1);
  }
  const horizonOf = (priority) => {
    const b = priority || 'normal';
    const need = Math.ceil((bandNeed.get(b) || 1) / Math.max(1, perDay)) * (7 / 5); // weekdays only → calendar days
    return Math.max(horizonFor(priority), Math.ceil(need));
  };
  for (const t of sorted) {
    const said = statedDate(t.text, today);
    if (said && said >= today) {                       // he already named a date — use HIS, not ours
      out.push({ id: t.id, file: t.file, raw: t.raw, text: t.text, priority: t.priority || null, due: said, stated: true, reason: 'you already wrote this date in the task' });
      continue;
    }
    const horizon = horizonOf(t.priority);
    let day = nextWeekday(new Date(start.getTime() + 86400000));   // never "today" — today is already spoken for
    for (let i = 0; i < 800; i++) {
      if ((used.get(iso(day)) || 0) < perDay) break;                // the cap is the cap; the calendar stretches
      day = nextWeekday(new Date(day.getTime() + 86400000));
    }
    const key = iso(day);
    used.set(key, (used.get(key) || 0) + 1);
    const band = bandNeed.get(t.priority || 'normal') || 1;
    out.push({ id: t.id, file: t.file, raw: t.raw, text: t.text, priority: t.priority || null, due: key, stated: false, horizon, reason: (t.priority ? t.priority + '-priority' : 'no priority set') + ' — ' + band + ' of these, at ' + perDay + '/day' });
  }
  return limit > 0 ? out.slice(0, limit) : out;
}

// PURE: write a due date into a task line, Obsidian-Tasks style (📅 YYYY-MM-DD). Replaces an existing 📅
// rather than adding a second one. Returns the line unchanged if it isn't an open checkbox — refusing to
// edit a line we don't understand is always better than mangling his notes.
export function setDueOnLine(line = '', due = '') {
  if (!/^\s*[-*]\s+\[ \]\s+/.test(String(line))) return line;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due))) return line;
  const s = String(line);
  if (/📅\s*\d{4}-\d{2}-\d{2}/.test(s)) return s.replace(/📅\s*\d{4}-\d{2}-\d{2}/, '📅 ' + due);
  return s.trimEnd() + ' 📅 ' + due;
}
