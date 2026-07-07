// The self-employed tax CALENDAR + reminder staging — PURE, eval-pinned, mirrors pods/gov/deadlines.mjs.
// Which deadlines exist is decided by code from verified constants (doctrine §1); the estimate amount on a
// quarterly comes from the eval-pinned engine (never invented). Reminder state is the event log, so a
// stage is pushed at most once. Nothing here files or pays.

const DAY = 86400000;
const daysBetween = (fromISO, toISO) => Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / DAY);

// Fixed statutory dates for a given calendar year (self-employed, single, PA). 1099-NEC issue + partnership
// 1065 + the 1040/PA-40/local annual date. (Est-tax dates come from C.estDueDates.)
function statutory(year) {
  return [
    { id: 'form-1099-nec', kind: 'info-return', date: `${year}-01-31`, label: '1099-NEC to contractors',
      note: 'Issue a 1099-NEC to any contractor paid >= $600 this year (e.g. A.J. Construction). Due to recipients + IRS.' },
    { id: 'form-1065', kind: 'partnership', date: `${year}-03-15`, label: 'Form 1065 (Brick Ave LLC)',
      note: 'Brick Ave LLC partnership return + K-1s. CONFIRM whether it has been filed — late 1065 penalties accrue per partner per month.' },
    { id: 'form-1040', kind: 'annual', date: `${year}-04-15`, label: '1040 + PA-40 + local',
      note: 'Federal 1040 + PA-40 (3.07%) + local EIT all due today (or file an extension).' },
  ];
}

// Roll an ISO date to its next occurrence on/after todayISO (same month/day, this year or next).
function nextOccurrence(mmdd, todayISO) {
  const y = Number(todayISO.slice(0, 4));
  for (const yr of [y, y + 1]) { const d = `${yr}-${mmdd}`; if (daysBetween(todayISO, d) >= 0) return d; }
  return `${y + 1}-${mmdd}`;
}

// The full upcoming calendar, soonest-first. Quarterlies carry the estimator's amount when it's the NEXT one.
export function taxDeadlines({ year, C, nextVoucher = null, todayISO }) {
  const out = [];
  // est-tax: the next due date on/after today from C.estDueDates (roll across years).
  const estDates = (C.estDueDates || []).slice().sort();
  let nextEst = estDates.find((d) => daysBetween(todayISO, d) >= 0);
  if (!nextEst && estDates.length) { const mmdd = estDates[0].slice(5); nextEst = nextOccurrence(mmdd, todayISO); }
  if (nextEst) {
    const item = { id: 'est-tax', kind: 'est-tax', date: nextEst, label: '1040-ES quarterly estimate',
      note: 'Estimated tax payment (federal 1040-ES; pay PA + local too).' };
    if (nextVoucher && nextVoucher.due === nextEst && Number(nextVoucher.amountCents) > 0) item.amountCents = nextVoucher.amountCents;
    out.push(item);
  }
  // statutory paperwork: roll each to its next occurrence.
  const baseYear = Number(String(todayISO).slice(0, 4)); // statutory dates anchor to today's year (never a stale param), then roll forward
  for (const s of statutory(baseYear)) {
    const rolled = daysBetween(todayISO, s.date) >= 0 ? s.date : nextOccurrence(s.date.slice(5), todayISO);
    out.push({ ...s, date: rolled });
  }
  return out.map((d) => ({ ...d, daysUntil: daysBetween(todayISO, d.date) }))
    .filter((d) => d.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function stageFor(daysLeft) {
  if (daysLeft < 0) return null;
  if (daysLeft <= 3) return 'final';
  if (daysLeft <= 7) return 'soon';
  if (daysLeft <= 30) return 'upcoming';
  return null;
}

// Which deadlines to surface now, staged + deduped via tax.deadline.reminded events (key id|date|stage).
export function dueTaxReminders(deadlines, events = [], now = new Date(), { withinDays = 30 } = {}) {
  const reminded = new Set();
  for (const e of events) {
    if (!e || e.action !== 'tax.deadline.reminded') continue;
    const p = e.payload || {};
    if (p.id) reminded.add(`${p.id}|${p.date || ''}|${p.stage || ''}`);
  }
  const out = [];
  for (const d of deadlines) {
    if (d.daysUntil == null || d.daysUntil > withinDays) continue;
    const stage = stageFor(d.daysUntil);
    if (!stage) continue;
    if (reminded.has(`${d.id}|${d.date}|${stage}`)) continue;
    out.push({ id: d.id, date: d.date, kind: d.kind, label: d.label, daysLeft: d.daysUntil, stage,
      ...(d.amountCents != null ? { amountCents: d.amountCents } : {}), ...(d.note ? { note: d.note } : {}) });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
