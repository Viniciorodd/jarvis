# Design — SCA-Wage Bid-Price Builder, Phase 6

**Date:** 2026-07-24
**Status:** Approved (operator: "keep going") → build inline, final review.
**Phase context:** Phase 6 (final gov-pipeline phase) of the 8-phase build. Reads Phase-1's cached SCLS wage-determination attachment.

---

## 1. Problem
For janitorial/facilities work the price backbone is the **Service Contract Act (SCA / SCLS) wage determination** — the legally-mandated minimum hourly wage + Health & Welfare fringe per labor category in the place of performance (free, attached to the solicitation). Bidding below it is non-compliant; not knowing it means guessing at labor cost. `pricing.mjs` prices from a sub's quote (middleman); nothing yet reads the wage determination or builds a **self-perform** price off it.

## 2. Goal
Parse the cached wage determination into structured labor rates, and compute a deterministic, SCA-compliant **self-perform labor-loaded bid price** the proposal can cite.

### Non-goals
- No live DOL/WDOL fetch — the WD is already an attachment Phase 1 cached. (A direct WDOL lookup is a future add.)
- Not replacing `pricing.mjs`'s middleman path — this is the complementary self-perform path.
- Not auto-selecting hours — the operator (or an estimate) supplies hours; the module supplies the compliant rate math.

## 3. Doctrine constraints
- **Code disposes on money (doctrine #1):** parsing + price math are PURE + deterministic + eval-pinned. No LLM near the math.
- **Never under the wage floor:** the computed direct labor uses the WD's stated wage + H&W; the bid can never be below the SCA labor cost.
- **Clamped knobs:** burden/overhead/profit percentages resolve env→default and are clamped to sane bands (a typo can't produce an underwater or 400% bid), exactly like `pricing.mjs`'s `knob()`.
- **Honest on failure:** an unparseable/absent WD returns empty rates — never a guessed wage.
- **No send/submit/spend.**

## 4. Architecture

### 4.1 `pods/gov/wage-det.mjs` (NEW) — PURE
- `parseWageDetermination(text) → { wdNumber, revision, rates:[{code,title,hourly}], healthWelfare, source }`:
  - Rate lines: occupation `NNNNN - Title .... 16.85` → `/^\s*(\d{5})\s*-\s*(.+?)[\s.]+(\d{1,3}\.\d{2})\s*$/gm`.
  - Health & Welfare: `/health\s*(?:&|and|&amp;)?\s*welfare[^$\d]*\$?\s*(\d+\.\d{2})/i` (per-hour; if stated per-week, `/per week/` → ÷ the WD's stated weekly hours, default 40).
  - WD number/revision: `/wd\s*([0-9-]+)\s*\(?\s*rev\.?-?\s*(\d+)/i`.
  - Empty text / no rate lines → `{ rates:[], healthWelfare:0 }` (no fabrication).
- `janitorialRates(parsed) → rates filtered to custodial codes (111xx)` for a quick janitorial view.
- `laborLoadedPrice({ baseHourly, hwHourly = 0, hours, burdenPct = null, supplies = 0, overheadPct = null, profitPct = null }) → { directLabor, burden, laborCost, supplies, overhead, profit, bid, floorHourly }`:
  - `directLabor = (baseHourly + hwHourly) * hours`; `burden = baseHourly * hours * burden%` (payroll taxes/workers-comp on the cash wage; H&W to a plan is exempt); `laborCost = directLabor + burden`; `+ supplies`; `× (1+overhead%)`; `× (1+profit%) = bid`. Knobs: `GOV_LABOR_BURDEN_PCT` (default 22, clamp 10–45), `GOV_OVERHEAD_PCT` (15, 5–40), `GOV_PROFIT_PCT` (10, 3–30). `floorHourly = baseHourly + hwHourly` (the SCA minimum the bid must clear).
- `priceLine(p)` — one plain-English line for the proposal/card.

### 4.2 Wiring
- Companion `GET /api/gov/wage-price?noticeId=&hours=` — read the cached attachment texts (`gov-drafts/att/<slug>/*.txt` via the manifest), pick the one that looks like a WD (has occupation-rate lines / "health & welfare"), `parseWageDetermination`, return `{ wd, janitorialRates, sample: laborLoadedPrice(...) }` using a representative Janitor rate × the supplied hours (or a default). Best-effort.
- (Later: feed `laborLoadedPrice` into `draft()`'s cited price when self-performing. Out of scope here — draft already has a price path.)

## 5. Testing (`evals/gov-wage-det.eval.mjs`)
- `parseWageDetermination`: extracts a Janitor 11150 rate + Health & Welfare from sample WD text; returns the WD number/revision; empty/garbage text → `{rates:[], healthWelfare:0}` (no fabricated wage).
- Per-week H&W is converted to per-hour (÷40).
- `laborLoadedPrice`: deterministic buildup; the bid is always ≥ `floorHourly × hours` (never under the SCA floor); env knobs clamp (a 999% profit env → clamped to 30).
- `janitorialRates` filters to 111xx codes.

## 6. Success criteria
1. `parseWageDetermination(real WD text)` returns the janitorial rate(s) + H&W; garbage → empty (no guessed wage).
2. `laborLoadedPrice` is deterministic, clamped, and never below the SCA floor.
3. `/api/gov/wage-price?noticeId=` parses the cached WD and returns rates + a sample price.
4. Eval-pinned; suite green.

## 7. Phase boundaries
Phase 6 closes the gov-pipeline build (Phases 1–6). Remaining: **Phase 7** (REDOS: Bid Coach + Projected-vs-Actual + Bid Brief) and **Phase 8** (PRD Items 2–3). A live DOL/WDOL fetch + feeding the self-perform price into `draft()` are future adds.
