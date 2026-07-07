# Tax & Wealth pod — Phase 3A: tax deadline wiring (design spec)

**Date:** 2026-07-07 · **Status:** approved by operator (design conversation) · **Builds on:**
Phase 1+2 (`pods/tax/`) + [`2026-07-05-tax-pod-design.md`](2026-07-05-tax-pod-design.md).
**Phase 3 decomposition:** 3A deadlines (this) → 3B docs indexer → 3C FreeTaxUSA filing pack.

## Why

The estimator knows *what* the operator will owe; nothing yet tells him *when*. He's explicit in his
operator profile — "surface my own deadlines back to me," "be hard on me" — and his weak spot is exactly
the paperwork deadlines (1099-NEC, the Form 1065). This puts the tax calendar in front of him and escalates
as each date nears, so nothing lapses unseen — even before the backfill makes the dollar amounts real.

## Approved decisions
- **Full self-employed deadline set** (not just the money dates).
- **Channels:** morning brief + Home glance from ~30 days out, escalating in tone; a **Telegram push only
  at the `final` stage (≤3 days)** so it can't be missed off-screen. No per-stage spam.

## The deadline set (TY2026, from `constants-2026.mjs`)
| id | date | kind | carries |
|---|---|---|---|
| `est-q1..q4` | Apr 15 / Jun 15 / Sep 15 / **Jan 15 2027** | `est-tax` | the estimator's voucher **amount** |
| `form-1099-nec` | **Jan 31** | `info-return` | note: issue to any contractor paid ≥ $600 (e.g. A.J. Construction) |
| `form-1065` | **Mar 15** | `partnership` | note: Brick Ave LLC partnership return — confirm it's been filed (ties to the open question) |
| `form-1040` | **Apr 15** | `annual` | federal 1040 + **PA-40 + local EIT** (same date) |

A date already passed rolls to its next occurrence (after Apr 15, the next `est-tax` is Jun 15; annual/1065/
1099 roll to next year). All dates come from the verified `estDueDates` + fixed statutory dates in constants.

## Architecture

One new PURE engine + wiring into existing surfaces. No new store — reminder state is the event log.

```
pods/tax/deadlines.mjs   PURE: the calendar + staging + dedup (mirrors pods/gov/deadlines.mjs)
```

### Component 1 — the calendar engine (`deadlines.mjs`, pure, eval-pinned)
- `taxDeadlines({ year, C, nextVoucher, todayISO }) → [{ id, kind, label, date, daysUntil, amountCents?, note }]`
  — the deterministic annual set (table above), sorted soonest-first. Quarterlies attach `amountCents`
  from `nextVoucher` (the estimator's number); paperwork deadlines attach a `note`. Roll-to-next-occurrence
  handled here.
- `stageFor(daysLeft) → 'upcoming' | 'soon' | 'final' | null` — `upcoming` ≤30, `soon` ≤7, `final` ≤3,
  null beyond 30 or past. (Same shape as gov `stageFor`.)
- `dueTaxReminders(deadlines, events, now, { withinDays = 30 }) → [{ id, date, kind, label, daysLeft, stage, amountCents?, note }]`
  — which deadlines to surface now, staged, **deduped via `tax.deadline.reminded` events** (key
  `id|date|stage`) so each stage fires at most once. Soonest-first.

### Component 2 — surfaces
- **Home + API:** `status.mjs buildStatus` gains `upcomingDeadlines` = `taxDeadlines(...)` filtered to
  `daysUntil ≤ 45`, so `/api/tax/status` carries them and the cockpit 💰 line shows the nearest
  ("next: Form 1065 in 12 days" / "1040-ES ≈$X in 20 days"). Purely additive to the existing status shape.
- **Morning brief:** the tax line in the brief includes the nearest tax deadline (+ its $ if a quarterly).
  (Wire into the existing brief assembly; follow how gov deadlines already surface there.)

### Component 3 — the daily push (scheduler + Telegram)
- A **scheduler job** (`control-plane/scheduler.mjs` + `schedule.json`, working-hours daily) runs
  `dueTaxReminders(taxDeadlines(...), recentEvents, now)`; for each result at `stage:'final'` it:
  1. sends a **Telegram push** via the existing bridge/notify helper (the same path gov/inbox use), and
  2. emits `tax.deadline.reminded` `{ id, date, stage }` so it never re-fires.
  `upcoming`/`soon` stages surface in-app (brief/Home) but do NOT push to Telegram (per the decision).

## Error handling
- Missing `nextVoucher` (no estimate yet) → quarterly deadline still shows, `amountCents` omitted
  (date-only reminder). Never blocks on the estimate.
- Unverified/rolled dates: dates are computed from the verified `estDueDates` + fixed statutory dates; a
  bad/blank date is skipped, not surfaced with a wrong day.
- Telegram send failure is best-effort (like every other notify) — it must not crash the scheduler; the
  `tax.deadline.reminded` event is emitted only on a successful send so a failed push retries next run.

## Testing (extend `evals/tax.eval.mjs`, pure/sync)
- `taxDeadlines` pinned: given `todayISO`, exact upcoming ids + `daysUntil`, the voucher `amountCents` on
  quarterlies, and roll-to-next-occurrence (a date just past → its next occurrence, correct `daysUntil`).
- `stageFor` boundaries: 31→null, 30→upcoming, 7→soon, 3→final, 0→final, -1→null.
- `dueTaxReminders` dedup: a deadline whose `id|date|stage` already has a `tax.deadline.reminded` event is
  NOT re-emitted; a new (nearer) stage for the same deadline IS surfaced.
- `dueTaxReminders` window: only deadlines within `withinDays` appear, soonest-first.

## Build order (each ends green + task-reviewed)
1. `pods/tax/deadlines.mjs` (calendar + stageFor + dueTaxReminders) + evals.
2. Wire `upcomingDeadlines` into `status.mjs buildStatus` + the cockpit 💰 line (today.js) + `/api/tax/status`.
3. Scheduler job (`schedule.json` + `scheduler.mjs`) + the `final`-stage Telegram push + `tax.deadline.reminded` emit.
4. Docs (STATE-OF-BUILD / whats-next / CLAUDE.md line).

## Non-goals / boundaries
- **Reminders only** — nothing files or pays; the Telegram push is a notification, not an action.
- No calendar-provider integration (Google Calendar events) in 3A — deferred; the brief/Home/Telegram
  surfaces are enough. (Google Calendar is already wired elsewhere; adding tax events there can be a later
  small increment.)
- Extension deadlines (Oct 15, Sep 15 extended 1065) omitted in 3A — add only if the operator files an extension.

## Doctrine compliance
| Directive | How |
|---|---|
| 1 — code disposes | Dates + staging computed deterministically in pure code from verified constants; the estimate amount comes from the eval-pinned engine, never invented. |
| 2 — gate irreversibles | No send/pay/file capability; a Telegram reminder is a notification. |
| 5 — evals + tracing | `deadlines.mjs` eval-pinned from task 1; every push emits a `tax.deadline.reminded` trace event (also the dedup key). |
