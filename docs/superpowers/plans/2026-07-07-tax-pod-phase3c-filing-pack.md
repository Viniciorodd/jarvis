# Tax & Wealth Pod — Phase 3C (FreeTaxUSA filing pack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.
> **⏳ BUILD DEFERRED** — build this in a focused session once the operator has backfilled real ledger data AND it is within ~2 months of filing, so the output can be validated against reality. Per `docs/superpowers/specs/2026-07-07-tax-pod-phase3c-filing-pack-design.md`.

**Goal:** Generate a FreeTaxUSA-interview-ordered filing package (Markdown) from the year's ledger + docs: Schedule C ×2, Brick Ave LLC 1065 books + 19% K-1 sheet, estimated-payments log, 1099 checklist, judgment calls, PA/local, README+warnings.

**Architecture:** PURE core (`buildFilingPack` → structured pack, `renderPack` → Markdown) + a thin fs writer, reusing `summarize` (ledger rollup), `engine` (SE tax / depreciation / `k1Share` / QBI), the 3B doc index (receipts), the debt desk (1099-C), and constants.

**Tech Stack:** Node ≥18 builtins; Markdown output (no deps); evals via `node evals/run.mjs`.

## Global Constraints
- No npm deps; integer cents; pure/sync eval cases; the writer + route are not eval-tested.
- Every figure comes from the eval-pinned engine/summarize — the LLM writes NO number.
- Generates documents only — never files, e-files, or pays.
- Reuse: `pods/tax/ledger.mjs` `summarize`, `readLedger`, `resolveLedger`, `CATEGORIES`; `pods/tax/engine.mjs` `seTax`, `annualDepreciation`, `k1Share`, `qbiDeduction`, `estimate`; `pods/tax/docs-index.mjs` `loadIndex`; `pods/tax/debt.mjs` `codIncome` + the debt registry; `pods/tax/capture.mjs` `loadRegistry`; constants `TY<year>`.
- Output dir `filing-pack/<year>/` — gitignored (add to `.gitignore`).
- Commits end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: `categoryToLine` — taxonomy → form line map (PURE)
**Files:** Create `pods/tax/form-lines.mjs`; modify `evals/tax.eval.mjs`.
- `categoryToLine(categoryId) → { form:'schC'|'schE'|'income'|'meta', line:string, label }` — derives the
  Schedule C line (8–27) / Schedule E line (5–19) from the fixed `CATEGORIES` ids (the labels already carry
  the line number; formalize it into a lookup). Income + meta map to synthetic buckets.
- `groupByLine(entries) → [{ form, line, label, cents, entries:[...] }]` sorted by form then line number.
- **Evals:** each known id → the right form+line; `groupByLine` totals a small entry set per line correctly.
- Commit: `feat(tax): categoryToLine form-line map + groupByLine (eval-pinned)`.

---

### Task 2: `buildFilingPack` PURE — Schedule C ×2 + estimated payments + 1099 checklist
**Files:** Create `pods/tax/filing-pack.mjs`; modify `evals/tax.eval.mjs`.
- `buildFilingPack({ entries, registry, debts, docsIndex, C, year }) → { sections, warnings }` — this task
  produces these `sections`:
  - `scheduleC[]` (one per schC entity): `{ entity, grossReceiptsCents, lines:[groupByLine expenses], netCents, se:seTax(...), receipts: docsIndex matches per entry }`.
  - `estimatedPayments`: `{ byQuarter, totalCents }` from `meta:est-tax-payment` entries.
  - `nec1099`: contractors whose `schC:contract-labor` total ≥ `C.necTrackCents`, per payee → obligation list.
- Uses `summarize`/`groupByLine`; receipts via `suggestDocs`/direct `docPath` match. Warnings: unverified
  constants, needs_review count.
- **Evals:** a known ledger → Schedule C net matches `summarize`; a contractor over threshold appears in
  `nec1099`; est-payments total correct; a needs_review entry is excluded + warned.
- Commit: `feat(tax): filing pack - Schedule C worksheets + est-payments + 1099 checklist (pure)`.

---

### Task 3: `buildFilingPack` PURE — LLC 1065 books + K-1 + judgment calls
**Files:** Modify `pods/tax/filing-pack.mjs`; modify `evals/tax.eval.mjs`.
- Extend `buildFilingPack` sections with:
  - `partnership`: per property (entity `brickave-llc`) a P&L — rents+HAP, expenses by Sch E line
    (`groupByLine`), **depreciation** (`annualDepreciation` from `registry.properties[].basisCents/inService`,
    taxYear=year) — rolled to LLC totals, then `k1Share(llcNet, 19)` → the operator's K-1 figures + an
    "enter on FreeTaxUSA K-1 screens" block. 218 W Ridge (entity `mom`) excluded, noted.
  - `judgmentCalls`: the Form 1065 filing-status question (always, until a flag clears); any `1099-C`
    (from settled charge-offs via the debt desk → `codIncome`); repair-vs-improvement / home-office /
    mileage placeholders driven by category presence. Each: rule + recommendation + doc trail.
  - `paLocal`: PA-40 (3.07%) + local EIT figures from the estimate.
- **Evals:** LLC books roll up + the 19% K-1 matches `k1Share`; a property with null basis → 0 depreciation
  + a warning; a settled debt → a 1099-C judgment item with the right forgiven amount.
- Commit: `feat(tax): filing pack - LLC 1065 books + 19% K-1 sheet + judgment calls (pure)`.

---

### Task 4: `renderPack` Markdown + `writeFilingPack` fs writer + README/warnings
**Files:** Modify `pods/tax/filing-pack.mjs`; modify `.gitignore`; modify `evals/tax.eval.mjs`.
- `renderPack(pack) → { [filename]: markdown }` (PURE) — the 7 files (`00-README.md` … `07-pa-local.md`),
  interview-ordered; README lists the interview checklist + all warnings + the needs_review count.
- `writeFilingPack({ year, dir })` (fs) — reads real ledger/registry/debts/docs-index, runs
  `buildFilingPack`+`renderPack`, writes `filing-pack/<year>/`, emits `tax.filing-pack.built`. CLI:
  `node pods/tax/filing-pack.mjs --year 2026`.
- `.gitignore`: add `filing-pack/`.
- **Evals** (renderPack pure): all 7 sections render, interview-ordered, README surfaces the warnings.
  **Smoke:** run `writeFilingPack` against a SYNTHETIC ledger in a temp dir; assert the files + key totals;
  never touch the real ledger.
- Commit: `feat(tax): filing pack - Markdown render + writeFilingPack CLI + README/warnings`.

---

### Task 5: Route + cockpit button + docs
**Files:** `companion/server.js` (route), `companion/public/...` (button), `docs/STATE-OF-BUILD.md`, `docs/whats-next.md`, `CLAUDE.md`.
- `POST /api/tax/filing-pack/build` → `writeFilingPack({ year })` → returns the folder + file list. A cockpit
  "🗂 Build my filing pack" button (in the tax/status area) runs it and links the output.
- Docs: 3C shipped; Phase 3 complete. `node evals/run.mjs` green.
- Commit: `docs(tax): Phase 3C shipped - FreeTaxUSA filing pack`.

## Self-review
- Tasks 1–4 are pure/fs and eval-pinned (the pack's numbers must match the engine/summarize exactly). Task 5
  is route/UI (live-verified). The whole pack is documents-only — no file/pay/e-file capability.
- Validate against REAL backfilled data when built — an empty ledger produces an all-zero pack with a
  "run the backfill" banner, which is correct but not a real test of the math.
