# Design — Incumbent Intelligence & Recompete Timing, Phase 5

**Date:** 2026-07-24
**Status:** Approved (operator: "keep going — Phase 5") → build inline, final review.
**Phase context:** Phase 5 of the 8-phase GovCon build. The build-it-ourselves core of a HigherGov replacement. Extends `bid-winners.mjs` + reuses the USASpending sample `price-to-win.mjs` already fetches.

---

## 1. Problem
For a given solicitation, the operator wants to know: **who holds this contract now, and when does it recompete?** Knowing the incumbent sharpens bid/no-bid, pricing, and the win theme; knowing the recompete window says *when to position*. `bid-winners.mjs` already tells "who wins this lane" (aggregate), but not the specific incumbent or the recompete timing. The missing datum is the incumbent award's **period-of-performance end date**.

## 2. Goal
From an opportunity, deterministically surface the **likely incumbent**, the **recompete timing** (when the current contract ends → when to strike), and the **lane concentration** — from the free USASpending data already in hand, with no new API load.

### Non-goals (Phase 5)
- **SLED / agency-portal discovery beyond SAM is DEFERRED.** Per-portal integrations (PennBid, COSTARS, Bonfire, etc.) are fragile, portal-specific scraping — a substantial effort of their own, not justified inside this phase. Phase 5 delivers the incumbent/recompete intelligence; SLED discovery is tracked as a future add.
- No new paid data source (no HigherGov). USASpending is free.
- Not a guaranteed incumbent — USASpending doesn't link a solicitation to its exact predecessor contract; this is the *best-signal* incumbent (most-recent comparable award in the lane), clearly labeled as such.

## 3. Doctrine constraints
- **Code disposes** on who/when: `pickIncumbent` + `recompeteTiming` are PURE + deterministic + eval-pinned. No LLM.
- **Honest about uncertainty:** the incumbent is the best *signal* (labeled), never asserted as fact; no comparable awards → "no incumbent signal," never a fabricated name. Missing POP end → `unknown`, never a guessed date.
- **No new network load:** reuses `fetchComparableAwards` (cached) — the same call `price-to-win`/`bid-winners` already make.
- **No send/submit/spend.** Read-only intelligence.

## 4. Architecture

### 4.1 `pods/gov/price-to-win.mjs` — 2-line additive change
- Add `'End Date'` to the `pageBody` `fields` array.
- Add `endDate: x['End Date'] || ''` to `mapAward`. (Additive — existing callers ignore it; the cache refreshes it on the next fetch; a cached award without it degrades to `unknown` recompete timing.)

### 4.2 `pods/gov/incumbent.mjs` (NEW)
- PURE `pickIncumbent(awards = []) → { recipient, awardId, amount, startDate, endDate } | null` — usable awards (recipient + amount>0) ranked by POP `endDate` desc (latest holder), tie-break `amount` desc; top one. Empty → `null` (no fabrication).
- PURE `recompeteTiming(endDate, now = new Date()) → { status, monthsToEnd, endsOn, note }`:
  - no/invalid date → `unknown`.
  - ended >6 mo ago → `stale` ("this solicitation is likely that recompete or a fresh requirement").
  - ended ≤ now (within 6 mo) → `recompeting-now` ("this IS the recompete window — strongest time to displace").
  - ends in ≤12 mo → `window` ("recompete imminent — position now").
  - ends >12 mo out → `locked` ("track for the recompete").
- `incumbentFor(opp) → { ok, incumbent, recompete, lane, sampleSize, source }` — resolve `{ naics, state }` (opp.naics or `inferTrade(title)`, opp.placeState), `fetchComparableAwards`, `pickIncumbent`, `recompeteTiming`, and reuse `bid-winners.topWinners/winnerSummary` for `lane` concentration. Best-effort — network failure → `{ ok:false, error }`.

### 4.3 Wiring
- Companion `GET /api/gov/incumbent?noticeId=` → resolve opp from the deal ledger → `incumbentFor(op)`. (The existing `/api/gov/bid-winners`-style pattern.) Optional later: fold the incumbent line into the opp drawer + the post-loss debrief (which already wants "know the incumbent").

## 5. Testing (`evals/gov-incumbent.eval.mjs`)
- `pickIncumbent`: picks the latest-POP-end award; tie-break by amount; ignores amount≤0/no-recipient; empty → `null` (no fabricated incumbent).
- `recompeteTiming`: future ≤12 mo → `window` with correct `monthsToEnd`; ended-recently → `recompeting-now`; ended-long-ago → `stale`; far-future → `locked`; missing date → `unknown`. Month math within tolerance.

## 6. Success criteria
1. `incumbentFor(a janitorial opp in PA)` returns the best-signal incumbent + a recompete status + lane concentration, or an honest "no incumbent signal" when the lane is empty — never a fabricated name/date.
2. `recompeteTiming` deterministically classifies the window; eval-pinned.
3. No new USASpending call beyond the cached comparable-award fetch.
4. Suite green.

## 7. Phase boundaries
Phase 5 = incumbent + recompete (USASpending). **SLED discovery deferred.** **Phase 6** = SCA-wage price. **Phase 7 Port #2** (Projected-vs-Actual) can fold the incumbent signal into the win-rate ledger.
