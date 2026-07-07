# Tax & Wealth Pod — Phase 3A (tax deadline wiring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface the self-employed tax calendar (1040-ES quarters w/ the estimate's $, Jan 31 1099-NEC, Mar 15 Form 1065, Apr 15 1040+PA+local) in the morning brief + Home glance, escalating as each nears, with a Telegram push at the final stage. Per `docs/superpowers/specs/2026-07-07-tax-pod-phase3-deadlines-design.md`.

**Architecture:** One PURE eval-pinned engine `pods/tax/deadlines.mjs` (mirrors `pods/gov/deadlines.mjs`) + additive wiring into `status.mjs`/Home/`/api/tax/status`, and a daily scheduler job that pushes final-stage deadlines to Telegram and dedups via the event log.

**Tech Stack:** Node ≥18 builtins; evals via `node evals/run.mjs`.

## Global Constraints
- No npm deps; integer cents for amounts; pure/sync eval cases.
- Reminder state = the event log (`tax.deadline.reminded` events, key `id|date|stage`); no new store.
- Reminders only — nothing files/pays; Telegram push is a notification (best-effort, never crashes the caller).
- Reuse: `pods/tax/constants-2026.mjs` `TY2026.estDueDates` (['2026-04-15','2026-06-15','2026-09-15','2027-01-15']); `pods/lib.mjs` `notifyTelegram(text)`, `emit(ev)`; `pods/tax/status.mjs` `taxStatus()` (has `nextVoucher`).
- Event shape for reminders: `{ kind:'action', actor:'TAX-01', pod:'exec', action:'tax.deadline.reminded', payload:{ id, date, stage } }`.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: The calendar engine (`pods/tax/deadlines.mjs`) — PURE, eval-pinned

**Files:** Create `pods/tax/deadlines.mjs`; modify `evals/tax.eval.mjs`.

**Interfaces (produces):**
- `taxDeadlines({ year, C, nextVoucher, todayISO }) → [{ id, kind, label, date, daysUntil, amountCents?, note? }]` sorted soonest-first
- `stageFor(daysLeft) → 'upcoming'|'soon'|'final'|null`
- `dueTaxReminders(deadlines, events, now, { withinDays }) → [{ id, date, kind, label, daysLeft, stage, amountCents?, note? }]`

- [ ] **Step 1: failing evals** (import `taxDeadlines, stageFor, dueTaxReminders`; `C = TY2026`):

```js
    { name: 'stageFor: 31→null, 30→upcoming, 7→soon, 3→final, 0→final, -1→null',
      run: () => ({ pass: stageFor(31)===null && stageFor(30)==='upcoming' && stageFor(7)==='soon'
        && stageFor(3)==='final' && stageFor(0)==='final' && stageFor(-1)===null,
        detail: [stageFor(31),stageFor(30),stageFor(7),stageFor(3),stageFor(0),stageFor(-1)].join(',') }) },

    { name: 'taxDeadlines: from 2026-09-01 the next est-tax is Sep 15 w/ the voucher amount + daysUntil 14',
      run: () => {
        const ds = taxDeadlines({ year: 2026, C, nextVoucher: { due: '2026-09-15', amountCents: 211000 }, todayISO: '2026-09-01' });
        const q = ds.find((d) => d.kind === 'est-tax');
        return { pass: q.date === '2026-09-15' && q.daysUntil === 14 && q.amountCents === 211000, detail: JSON.stringify(q) };
      } },

    { name: 'taxDeadlines: a passed est date rolls to the next occurrence (after Apr 15 → Jun 15)',
      run: () => {
        const ds = taxDeadlines({ year: 2026, C, nextVoucher: null, todayISO: '2026-04-16' });
        const q = ds.find((d) => d.kind === 'est-tax');
        return { pass: q.date === '2026-06-15' && q.amountCents === undefined, detail: q.date };
      } },

    { name: 'taxDeadlines: the 1065 + 1099-NEC + 1040 paperwork deadlines are present with notes',
      run: () => {
        const ds = taxDeadlines({ year: 2026, C, nextVoucher: null, todayISO: '2026-02-01' });
        const has = (id) => ds.find((d) => d.id === id);
        return { pass: !!has('form-1099-nec') && !!has('form-1065') && !!has('form-1040')
          && /1065|partnership/i.test(has('form-1065').note || ''), detail: ds.map((d)=>d.id).join(',') };
      } },

    { name: 'taxDeadlines: sorted soonest-first, every daysUntil >= 0',
      run: () => {
        const ds = taxDeadlines({ year: 2026, C, nextVoucher: null, todayISO: '2026-01-20' });
        const sorted = ds.every((d, i) => i === 0 || d.daysUntil >= ds[i-1].daysUntil) && ds.every((d) => d.daysUntil >= 0);
        return { pass: sorted, detail: ds.map((d)=>`${d.id}:${d.daysUntil}`).join(' ') };
      } },

    { name: 'dueTaxReminders: within-window, dedup by id|date|stage (a reminded stage does not re-appear)',
      run: () => {
        const ds = taxDeadlines({ year: 2026, C, nextVoucher: { due:'2026-09-15', amountCents: 211000 }, todayISO: '2026-09-13' });
        const now = new Date('2026-09-13T12:00:00Z');
        const first = dueTaxReminders(ds, [], now, { withinDays: 30 });
        const q = first.find((r) => r.kind === 'est-tax');
        const events = [{ action: 'tax.deadline.reminded', payload: { id: q.id, date: q.date, stage: q.stage } }];
        const second = dueTaxReminders(ds, events, now, { withinDays: 30 });
        return { pass: !!q && q.stage === 'final' && !second.find((r) => r.id === q.id && r.stage === q.stage), detail: `${first.length}→${second.length}` };
      } },
```

- [ ] **Step 2: red.** **Step 3: implement `pods/tax/deadlines.mjs`:**

```js
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
  for (const s of statutory(year)) {
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
```

- [ ] **Step 4: green** (`node evals/run.mjs`, ~358). **Step 5: commit** (`feat(tax): tax deadline calendar engine (1040-ES/1099-NEC/1065/1040) - pure, eval-pinned`).

---

### Task 2: Surface `upcomingDeadlines` in status + Home + API

**Files:** Modify `pods/tax/status.mjs` (buildStatus + taxStatus); modify `companion/public/today.js` (the 💰 `renderTax` line); modify `evals/tax.eval.mjs`.

- [ ] **Step 1:** in `buildStatus`, import `taxDeadlines` from `./deadlines.mjs`; compute
  `const upcomingDeadlines = taxDeadlines({ year: C.year, C, nextVoucher, todayISO }).filter((d) => d.daysUntil <= 45);`
  and include `upcomingDeadlines` in the returned object. (nextVoucher + todayISO already exist in buildStatus.)
  Add an eval: with a todayISO 20 days before Sep 15 and a nextVoucher, `buildStatus().upcomingDeadlines[0]` is the nearest deadline with the right `daysUntil`.
- [ ] **Step 2:** `taxStatus()` already returns the buildStatus object, so `/api/tax/status` carries `upcomingDeadlines` automatically — no server change needed (verify by reading the route).
- [ ] **Step 3:** in `companion/public/today.js` `renderTax(t)`, when `t.upcomingDeadlines?.length`, append a line for the nearest one: `📅 <label> in <daysUntil>d` + `≈$<amount>` when `amountCents` present. `.textContent` only (match existing style; the note text is our own copy, but keep the pattern).
  - Add `upcomingDeadlines` (nearest 1-2, trimmed to `{label,daysUntil,amountCents}`) into the `/api/cockpit` `tax` object so today.js has it (mirror how `headline`/`needsReview` are passed).
- [ ] **Step 4:** `node evals/run.mjs` green; `node --check` the JS. **Step 5: commit** (`feat(tax): surface upcoming tax deadlines on the cockpit Home glance + status`).

---

### Task 3: Daily scheduler job + final-stage Telegram push

**Files:** Modify `control-plane/schedule.json` (add a job); add a `/maintenance/tax-deadline-check` endpoint (locate where `/maintenance/deadline-check` is served — grep — and add alongside it); modify `evals/tax.eval.mjs` if any new pure logic.

- [ ] **Step 1:** locate the server handling `/maintenance/deadline-check` (the gov deadline radar). Add `/maintenance/tax-deadline-check` next to it: it calls `taxStatus()` → builds `taxDeadlines(...)`, reads recent events (the same way the gov endpoint reads them for dedup), runs `dueTaxReminders(...)`, and for each result with `stage:'final'`: `notifyTelegram(...)` a clear message (label + daysLeft + amount if present + the note), then `emit({ kind:'action', actor:'TAX-01', pod:'exec', action:'tax.deadline.reminded', payload:{ id, date, stage } })`. Emit ONLY after a push is dispatched. `upcoming`/`soon` stages are NOT pushed (they live in brief/Home). Best-effort; never throws.
- [ ] **Step 2:** add to `control-plane/schedule.json` jobs:
  `{ "id": "tax-deadline-radar", "person": "TAX-01", "pod": "exec", "type": "maintenance", "cadence_hours": 24, "at_hour": 9, "endpoint": "/maintenance/tax-deadline-check", "command": "check tax deadlines (1040-ES/1099-NEC/1065/1040) and push the final-stage ones (deterministic, no LLM)" }`
- [ ] **Step 3:** verify: call the endpoint locally with a seeded event set / a near-term date and confirm it would push exactly the final-stage deadlines once (describe the check; don't spam a real Telegram — gate the actual send behind the existing token check, which is absent in dev so it no-ops). `node evals/run.mjs` green. **Step 4: commit** (`feat(tax): daily tax-deadline radar + final-stage Telegram push (deduped)`).

---

### Task 4: Docs

**Files:** `docs/STATE-OF-BUILD.md`, `docs/whats-next.md`, `CLAUDE.md`.

- [ ] **Step 1:** STATE-OF-BUILD dated entry (Phase 3A shipped: deadline engine + Home/brief surface + daily Telegram radar; eval count; note 3B docs-indexer + 3C filing-pack still ahead). whats-next: operator homework unchanged + note deadlines now auto-surface. CLAUDE.md: extend the tax pod line with `pods/tax/deadlines.mjs` + the `tax-deadline-radar` job.
- [ ] **Step 2:** `node evals/run.mjs` green. **Step 3: commit** (`docs(tax): Phase 3A shipped - deadline wiring`).

## Self-review
- Task 1 is the pure testable core (complete code here). Tasks 2-4 are additive wiring following established patterns (status shape, cockpit tax object, scheduler job + notifyTelegram) — interface-specified, live-verified.
- No new external credential; Telegram uses the existing best-effort `notifyTelegram`. No file/pay capability.
