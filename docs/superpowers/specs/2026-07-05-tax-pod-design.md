# Tax & Wealth pod ("Sage" / TAX-01) — design spec

**Date:** 2026-07-05 · **Status:** approved by operator (design conversation) · **Approach:** A — full
Tax & Wealth desk under the CFO, built in 3 phases.

## Why this exists

The operator is fully self-employed (no W-2 anywhere), files **single**, lives in PA, and from tax year
2026 onward **files his own returns via FreeTaxUSA.com** (no CPA). All four money pains are active:

1. **Surprise tax bills** — no withholding safety net; nothing tells him during the year what he'll owe.
2. **Lost deductions** — expenses happen (repairs, mileage, software, supplies) and never get captured.
3. **Document chaos** — receipts/HUDs/1099s/HAP statements scattered across drives, email, phone.
4. **No savings discipline** — nothing automatically sets money aside for taxes/emergency/investing.

Jarvis becomes his year-round **tax operations chief + personal CFO desk**: it computes, organizes,
reminds, and gates. It **never files, never pays, never touches a bank**. FreeTaxUSA's math at filing
time is the authority; every Jarvis number is an estimate for planning, built to agree with it.

## The operator's tax reality (facts the system encodes)

| Fact | Value |
|---|---|
| Filing status | Single |
| W-2 income | None — 100% self-employed |
| State | PA (flat 3.07%) + local EIT (rate is a config value, per municipality) |
| Filing method | Self-file, FreeTaxUSA (from TY2026) |
| Entity 1 | **Rodgate LLC** — gov contracting. Single-member, disregarded → **Schedule C #1** |
| Entity 2 | **2135 Brick Ave, LLC** — rentals. Single-member, disregarded → **Schedule E** |
| Personal | Side hustles (Fiverr/web/music) → **Schedule C #2**; + rentals held personally |

**Property → owner mapping** (drives Schedule E paperwork labels; all five are Schedule E regardless):

| Property | Owner |
|---|---|
| 2135 Brick Ave, Scranton PA | 2135 Brick Ave, LLC |
| 463 2nd Street, Plymouth PA | 2135 Brick Ave, LLC |
| 465 2nd Street, Plymouth PA | 2135 Brick Ave, LLC |
| 218 W Ridge St, Nanticoke PA — 1st floor | Personal |
| 218 W Ridge St, Nanticoke PA — 2nd floor | Personal |

2135 Brick Ave is the worked example: purchased ~Nov 2024 (PSA + HUD on file), rehabbed (contractor
agreements + receipts on file), cash-out refi (RBI), now a Section 8 rental ($1,850/mo). Its docs live at
`Z:\Real Estate\Deals\2135 Brick Ave, Scranton, PA 18508 Flip\` — **docs are indexed in place, never moved**.

## Architecture

New pod `pods/tax/`, new org-chart agent **TAX-01 "Sage"**, `reports_to: LEDGER-01` (Victor, CFO), pod
`exec`, tier `draft`. Aliases: taxes, tax guy, what do i owe, set aside, deductions, quarterly, write-off.

```
pods/tax/
  entities.json        entity + property registry (table above), local EIT rate, savings split %s
  constants-2026.mjs   ALL tax-year parameters, one file per year, stamped + eval-pinned
  engine.mjs           PURE tax math (the Estimator) — no I/O, no LLM
  ledger.mjs           append-only transaction store + fixed category taxonomy
  capture.mjs          free-text/voice/photo expense intake (amount parsed in CODE)
  importer.mjs         CSV statement parser + per-bank column-map profiles + claudeBatch classifier
  savings.mjs          deterministic income-split rules + virtual bucket balances
  filing-pack.mjs      builds the tax-year Filing Pack folder (FreeTaxUSA interview order)
  docs-index.mjs       indexes existing doc folders (Z: drive etc.) in place, links docs ↔ ledger
```

Data (gitignored, lives with the other runtime data):
- `tax-ledger/<year>.jsonl` — append-only transaction events
- `tax-docs/<year>/` — captured receipts (photos/PDFs) + the doc index
- `tax-inbox/` — watched drop folder for bank/card CSV exports
- `filing-pack/<year>/` — generated Filing Pack output

### Component 1 — the Estimator (`engine.mjs` + `constants-2026.mjs`)

Pure, eval-pinned functions (same discipline as `pods/gov/pricing.mjs`). From the live ledger it computes:

net profit per Schedule C activity → **SE tax** (92.35% × 15.3%, SS wage base capped) → ½-SE deduction →
**QBI 20%** (below-threshold simple case; flags if near threshold) → standard deduction (single) →
**federal brackets** → **PA 3.07%** + **local EIT** (config; applies to earned income, not rents) →
per-property **rental net** including **depreciation** (27.5-yr straight-line, mid-month convention, from
basis + in-service date) → minus estimated payments already logged.

Quarterly voucher = the IRS required-annual-payment rule: the LESSER of (90% of current-year projected
tax) or (100% of prior-year tax; 110% if prior AGI > $150k), divided across remaining due dates
(Apr/Jun/Sep/Jan 15). When prior-year data exists, the prior-year target is shown as the "penalty-proof"
number with the current-year projection alongside; the operator picks which to pay. Estimated payments
made are themselves ledger events (category: `est-tax-payment`, fed/PA/local) so the engine always knows
what's been paid.

Output surfaced on the cockpit **Home glance** + morning brief, one line:
> Set aside: 27% of every dollar in · Tax bucket should hold $6,340 · Next quarterly: $2,110 due Sep 15

`constants-<year>.mjs` holds every year-specific number (brackets, SS wage base, standard deduction,
mileage rate, QBI threshold, 1099-NEC threshold). New tax year = one new auditable file + rerun evals.

### Component 2 — the Ledger (`ledger.mjs`, `capture.mjs`, `importer.mjs`)

Append-only JSONL events: `{ ts, date, cents, payee, memo, entity, property?, category, source, hash, status }`.

- **Amounts parsed in CODE** (reuse the `toCents` rigor from `pods/finance/invoice.mjs`). LLM never
  produces a number that gets stored.
- **Fixed category taxonomy mapped to real form lines** (Schedule C lines 8–27, Schedule E lines 5–19,
  plus non-deductible/personal). The classifier (claudeBatch, cheap tier) picks FROM the list — code
  rejects anything off-taxonomy (directive #1).
- **Three intake paths, zero bank credentials:**
  1. **Capture** — "$43 Home Depot, Brick Ave repair" via Telegram/Companion text/voice, or a receipt
     photo → parsed, classified, filed under year/entity/property.
  2. **CSV drop** — operator exports monthly bank/card statements into `tax-inbox/`. Unknown format →
     Claude maps columns ONCE → saved as a per-bank profile → code applies it forever after. Every row
     hash-deduped (re-dropping a file cannot double-count; idempotent by construction).
  3. **Stripe** — already connected via the vault (LEDGER-01 scope); payouts flow in automatically.
- **Weekly review gate** — low-confidence or large-amount classifications queue for a 30-second
  Telegram/Companion approval pass (existing gate pattern). Everything else auto-files at `confirmed`.

### Component 3 — Savings rules (`savings.mjs`)

Deterministic splitter, config in `entities.json`: on every **income event**, compute splits —
**tax %** (pulled live from the Estimator's effective rate, not a guess), **emergency %**, **invest %**.
Jarvis tracks **virtual bucket balances** (what SHOULD be in each bucket) vs. what the operator confirms
he moved. Weekly nudge, one line: "Move $412 → tax, $150 → emergency. Buckets after: tax $6,340 ✓."
Skipped weeks roll forward. **Jarvis never initiates a transfer** — it computes, the operator moves
money at his own bank and taps done.

### Component 4 — the Filing Pack (`filing-pack.mjs`)

`node pods/tax/filing-pack.mjs --year 2026` → `filing-pack/2026/`, ordered exactly like the FreeTaxUSA
interview so filing = data entry:

1. **Schedule C worksheet × 2** (Rodgate; side hustles) — every line pre-totaled, drillable to ledger
   entries + receipts.
2. **Schedule E worksheet × 5 properties** — rents + HAP received, expenses by line, **Form 4562
   depreciation math** per property (Brick Ave basis assembled from HUD + rehab receipts).
3. **Estimated-payments log** — every 1040-ES payment made, by quarter.
4. **1099 checklist, both directions** — expected inbound 1099s; outbound **1099-NEC obligations**
   (any contractor paid ≥ $600 in the year — e.g. A.J. General Construction — due Jan 31).
5. **Judgment-calls list** — each repair-vs-improvement call, home office, mileage: plain-English rule +
   Jarvis's recommendation + linked docs. Operator decides.
6. **PA + local sheet** — PA-40 figures (3.07%) + local EIT figures.

### Component 5 — deadlines + surfaces

- Quarterly 1040-ES dates, Jan 31 1099-NEC, PA/local dates → wired into the existing deadline/brief
  system (`pods/gov/deadlines.mjs` pattern) + morning brief + Home glance.
- **Businesses hub**: the `finance` entry in `pods/businesses.mjs` gets tax awareness (set-aside status,
  next deadline) — no new front-door surface; the cockpit stays the front door.
- API routes on the companion server: `/api/tax/status` (estimator output), `/api/tax/capture`,
  `/api/tax/review` (queue + approve), following existing route conventions.

## Error handling

- Unparseable capture ("fix the roof") → ask one clarifying question (amount?) rather than guessing; never
  store an entry without a code-validated amount.
- Unknown CSV format and Claude's column-map fails validation (row count/amount sanity) → file quarantined
  in `tax-inbox/failed/`, operator notified; nothing partial enters the ledger.
- Missing basis/in-service data for a property → depreciation for that property shows "needs setup" and is
  EXCLUDED from the estimate (understate deductions, never overstate) + a setup task is raised.
- Every LLM classification carries confidence; below threshold → review queue, never silent auto-file.

## Testing (evals from day one — `evals/tax.eval.mjs`)

- **Known-answer tax scenarios** pinned: e.g. single filer, $X Sch C profit, TY2026 → exact SE/fed/PA
  numbers, computed by hand once and locked. Multiple profit levels incl. $0 and SS-wage-base crossover.
- Depreciation schedule pinned for a known basis/in-service date (incl. mid-month first year).
- Safe-harbor quarterly math pinned (prior-year vs current-year cases).
- `toCents`-style amount parsing: junk, negatives, > cap rejected.
- Classifier CANNOT invent categories (off-taxonomy → rejected).
- CSV import idempotency: same file dropped twice → zero duplicate rows.
- Savings splitter: splits sum exactly to income; rollforward math.

## Build phases

1. **Phase 1 — kill surprise bills:** `entities.json`, `constants-2026.mjs`, `engine.mjs`, `capture.mjs`,
   `savings.mjs`, org-chart entry, Home glance line, `/api/tax/status`. Evals green. Useful in week one.
2. **Phase 2 — kill lost deductions:** `importer.mjs` + per-bank profiles + claudeBatch classifier +
   review gate. **Backfill Jan–Jun 2026 from bank CSV exports** (operator homework: export the CSVs).
3. **Phase 3 — kill document chaos:** `docs-index.mjs` (pointed at Z:\Real Estate + gov/Fiverr folders),
   `filing-pack.mjs`, deadline wiring, 1099-NEC contractor tracking.

## Non-goals / boundaries (in writing)

- Jarvis **never files a return, never pays the IRS/PA, never initiates a bank transfer** — hard floor,
  same as the autonomy ladder's send/submit/spend gates.
- No bank-feed credentials (Plaid etc.) in this build — explicitly deferred; revisit only as its own
  decision after the system earns trust (doctrine: credentials → ask the human).
- No S-corp modeling in v1 — but the Estimator flags when profit reaches the level where an S-corp
  election is worth researching (a judgment-calls item, since there's no CPA by default now).
- Not tax advice — planning estimates; FreeTaxUSA's interview + IRS instructions are the authority at
  filing; judgment calls are surfaced with the rule + a recommendation, decided by the operator.

## Doctrine compliance

| Directive | How this design honors it |
|---|---|
| 1 — code disposes | All money math (estimates, depreciation, splits, vouchers) in pure eval-pinned code; LLM only classifies from a fixed list + explains. |
| 2 — gate irreversibles | Filing/paying/moving money aren't even capabilities. Review queue gates ledger writes it isn't sure about. |
| 3 — least privilege | Stripe read stays LEDGER-01-scoped via the vault; TAX-01 gets no new external credentials at all. |
| 4 — untrusted content | CSV rows + receipt text are DATA; parsed by code, classified against a fixed taxonomy, never executed as instructions. |
| 5 — evals + tracing | `evals/tax.eval.mjs` from phase 1; every capture/import/estimate emits events to the store like every other pod. |
