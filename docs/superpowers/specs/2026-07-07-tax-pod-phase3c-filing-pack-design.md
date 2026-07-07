# Tax & Wealth pod — Phase 3C: FreeTaxUSA filing pack (design spec)

**Date:** 2026-07-07 · **Status:** DESIGNED — **build deferred** (see Timing) · **Builds on:** Phase 1/2/3A/3B.
**Phase 3 sequence:** 3A deadlines ✅ → 3B docs indexer ✅ → **3C filing pack (this — designed, build later).**

## Timing / why build later
3C generates the year-end filing package **from the full-year ledger**. Today that ledger reads ~$0 (the
operator hasn't run the Phase-2 backfill yet), and the filing itself is early 2027. Building — and
*validating* — a document generator against empty data at the tail of a long session is low-value and
unverifiable. **Recommendation: build 3C in a focused session once (a) the operator has backfilled real
Jan–Jun+ data and (b) it's within ~2 months of filing**, so the output can be checked against reality.
This spec + its plan are complete and ready to execute then.

## Why
The operator self-files via **FreeTaxUSA**. The pain isn't the software — it's assembling the numbers.
3C turns the whole year's ledger + docs into a **filing package ordered exactly like FreeTaxUSA's
interview**, so filing becomes data-entry instead of archaeology.

## Output
`node pods/tax/filing-pack.mjs --year 2026` → `filing-pack/<year>/` (gitignored), a set of **Markdown**
files (human-readable, printable, no deps) + a `pack.json` companion (the structured data). Sections, in
interview order:

1. **`01-schedule-c-rodgate.md`** + **`02-schedule-c-sidehustles.md`** — each Schedule C business: gross
   receipts, then expenses by **line number** (8–27), every line total drillable to its ledger entries,
   and each entry's attached receipt (`docPath` from 3B) listed. Net profit → SE-tax + QBI note.
2. **`03-brickave-llc-1065-books.md`** — the partnership books: **per property** (Brick Ave, 463, 465) a
   P&L (rent + HAP received, expenses by **Schedule E line** 5–19, **depreciation** from the engine per
   property from basis + in-service), rolled up to LLC totals, then the **19%/81% K-1 allocation** → a
   one-page **"enter these figures on FreeTaxUSA's K-1 screens"** sheet for the operator's 19% share.
   (218 W Ridge is the mother's — excluded, noted.)
3. **`04-estimated-payments.md`** — every 1040-ES/PA/local payment logged (`meta:est-tax-payment`), by
   quarter, with the total (FreeTaxUSA asks; people forget and overpay).
4. **`05-1099-checklist.md`** — **outbound**: any contractor paid ≥ the year's 1099-NEC threshold
   (`schC:contract-labor` totals per payee — e.g. A.J. Construction) → "issue a 1099-NEC by Jan 31";
   **inbound**: expected 1099s to watch for.
5. **`06-judgment-calls.md`** — each decision that needs the operator: the **Form 1065 filing-status
   question** (top, until resolved), repair-vs-improvement calls, home office, mileage, any **1099-C**
   from settled debts (from the debt desk) → each with the plain-English rule + Jarvis's recommendation
   + the doc trail. Operator decides.
6. **`07-pa-local.md`** — PA-40 figures (3.07%) + local EIT figures.
7. **`00-README.md`** — the interview-order checklist + every ⚠ warning (unverified constants, missing
   property basis, needs_review items still in the queue) so nothing enters FreeTaxUSA on a shaky number.

## Architecture
Pure core + a thin Markdown writer. Reuses everything already built.

- **`pods/tax/filing-pack.mjs`**:
  - `buildFilingPack({ entries, registry, debts, docsIndex, C, year, priorYear? }) → { sections, warnings }`
    (PURE) — composes: `summarize` (ledger rollup per entity + LLC books), `engine` (SE tax, depreciation
    per property, K-1 19% share, QBI), the fixed taxonomy→form-line map, the doc index (receipts per
    entry/property), the debt desk (1099-C), constants. Produces structured section data.
  - `renderPack(pack) → { [filename]: markdown }` (PURE) — the structured data → the 7 Markdown files.
  - `writeFilingPack({ year, dir })` (fs wrapper) — reads the real ledger/registry/debts/docs-index, runs
    the two pure fns, writes `filing-pack/<year>/*.md` + `pack.json`; emits a `tax.filing-pack.built` event.
- **Taxonomy→form-line map** (`pods/tax/form-lines.mjs` or extend `ledger.mjs CATEGORIES`): the
  `schC:*`/`schE:*` category ids already encode the form line in their labels; 3C formalizes a
  `categoryToLine(id) → { form, line, label }` so the worksheets group + order by real line number.
- **Route (optional):** `POST /api/tax/filing-pack/build` + a cockpit "Build my filing pack" button that
  runs `writeFilingPack` and links the output folder.

## Error handling
- Missing property basis/in-service → that property's depreciation is 0 + a loud warning in `00-README.md`
  and `03-...` (understate, never overstate).
- Unverified constants → listed in `00-README.md` (must confirm before filing).
- needs_review entries still in the queue → counted in the README ("N items unreviewed — they're NOT in
  these totals; clear them first").
- Empty ledger → the pack still generates (all zeros) with a clear "no data yet — run the backfill" banner.

## Testing (pure, eval-pinned)
- `categoryToLine`: each taxonomy id → the right form + line.
- `buildFilingPack` on a known small ledger: Schedule C net matches; the LLC books roll up + the 19% K-1
  figure matches `k1Share`; a contractor over the threshold appears in the 1099-NEC list; a property with
  no basis contributes 0 depreciation + a warning; est-payments total correct.
- `renderPack`: sections present, interview-ordered, README lists the warnings.

## Build order (when built — ~5 tasks)
1. `categoryToLine` map + evals.
2. `buildFilingPack` PURE (Schedule C sections + estimated-payments + 1099 checklist) + evals.
3. `buildFilingPack` PURE (LLC 1065 books + K-1 sheet + depreciation + judgment calls incl. 1099-C/1065) + evals.
4. `renderPack` (Markdown) + `writeFilingPack` fs wrapper + README/warnings; smoke against a synthetic ledger.
5. Route + cockpit "Build filing pack" button + docs.

## Non-goals / boundaries
- **Does not file or e-file** — it produces a package the operator types into FreeTaxUSA. Filing stays his.
- **Does not prepare the actual Form 1065** — it produces the partnership *books* + K-1 figures; preparing
  the 1065 (software or a pro) is data entry from those. The 1065 filing-status question stays a judgment item.
- Not tax advice — FreeTaxUSA's interview + IRS instructions are the authority; judgment calls are
  surfaced with a rule + recommendation, decided by the operator.
- No PDF generation in 3C (Markdown is enough; a PDF export could be a later increment).

## Doctrine compliance
| Directive | How |
|---|---|
| 1 — code disposes | Every number is computed by the eval-pinned engine/summarize; the LLM writes no figure. |
| 2 — gate irreversibles | Generates documents only; never files/pays/e-files. |
| 5 — evals + tracing | Pure core eval-pinned; the build emits a `tax.filing-pack.built` event. |
