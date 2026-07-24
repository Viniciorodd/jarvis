# Design — Matrix-Grounded Drafting, Phase 4

**Date:** 2026-07-24
**Status:** Approved (operator: "keep going down the sequence") → build inline, final review.
**Phase context:** Phase 4 of the 8-phase GovCon build — the capstone that ties Phase 1 (compliance matrix) and Phase 3 (library) into the actual proposal draft.

---

## 1. Problem
`draft()` (`pods/gov/worker.mjs`) currently dumps ~6000 raw SOW characters into the prompt and lets the model write freely. Result: proposals that may skip a "shall/must" requirement (non-responsive → disqualified), invent generic prose instead of using Rodgate's proven sections, and — the doctrine risk — could fabricate past performance. Phases 1 and 3 built the two things that fix this (a structured requirements matrix and a curated library); Phase 4 feeds them into the draft.

## 2. Goal
The proposal draft **answers every compliance-matrix requirement**, is **grounded in the Phase-3 library** (real reusable sections + real past-performance only), and its coverage against the matrix is **verified + surfaced** — all still behind the existing human submit gate.

### Non-goals
- No new send path — drafting stays staged; the submit gate is unchanged; nothing auto-sends.
- Not rewriting the compliance self-heal (`improveUntilPass`) or the facts-guard — they stay and run after drafting as today.
- Not generating library content — Phase 3 owns that.

## 3. Doctrine constraints
- **No fabrication (L-006):** the draft cites ONLY provided past-performance; `needsReview` stubs are filtered out; when no real records exist, the prompt explicitly forbids inventing any and redirects to registrations/registry. The existing facts-guard still catches false identity/cert claims post-draft.
- **LLM writes prose around CODE-provided structure + facts:** the requirements list, the snippet bodies, the past-performance records, and the code-computed bid price are all deterministic inputs; the model composes, it doesn't decide facts.
- **Gated:** submit stays gated; Phase 4 changes only the draft content, not the send path.
- **Free/draft brain** ($0 default), same as today's `draft()`.
- **Eval-pinned:** the deterministic prompt-assembly (`groundingBlock`) is PURE + eval-pinned (the LLM call itself is not).

## 4. Architecture

### 4.1 `pods/gov/grounding.mjs` (NEW) — PURE
`groundingBlock({ matrixRows = [], pastPerformance = [], snippets = [] }) → string`:
- **Requirements to answer:** the matrix rows grouped by section (L=submission, M=evaluation, C=SOW, form=required forms), **gaps-first**, each as a checkbox line the draft must address. Header: "ADDRESS EVERY REQUIREMENT BELOW — a missed shall/must or a missing required form makes the bid non-responsive."
- **Reusable sections:** each snippet as `### <title>\n<body>` under "PROVEN SECTIONS — adapt these to THIS solicitation (don't copy verbatim if the scope differs)."
- **Past performance:** `pastPerformance.filter(r => !r.needsReview && (r.title || r.agency))` rendered as citable records under "PAST PERFORMANCE — cite ONLY these; inventing past performance is prohibited." **If the filtered list is empty:** emit exactly "No past-performance records on file — do NOT fabricate any. Emphasize SAM/PA registrations and the disaster registry instead." (So an empty/stub-only library can never yield a fabricated citation.)
- Bounded: cap the requirements list (e.g. 60) and each snippet body (already short); total block capped so the prompt stays reasonable.

### 4.2 `draft()` (`pods/gov/worker.mjs`) — MODIFIED
- New signature `draft(op, sc, prof, { matrixRows = [], library = {} } = {})` (backward-compatible defaults).
- System prompt gains: "You MUST address every requirement in the REQUIREMENTS block. Use the PROVEN SECTIONS (adapt, don't copy). Cite ONLY the past performance provided — inventing past performance or certifications is prohibited."
- User prompt appends `groundingBlock({ matrixRows, pastPerformance: library.pastPerformance, snippets: library.snippets })` in place of the raw 6000-char SOW dump (keep a short SOW excerpt for context, but the matrix is the authoritative checklist).
- The existing Hector procurement fold-in + code-computed price stay.

### 4.3 `runScan` draft loop — MODIFIED
Before `draft(...)`, compute (best-effort):
- `const mx = await matrixForOp(op, { key: samKey });` → `mx.matrix?.rows` (attachment cache already warm from the pre-build; cheap).
- `const library = await import('./library.mjs').then(L => L.libraryFor(op));`
Pass `{ matrixRows, library }` into `draft()`. After the draft is written + self-healed, re-run `matrixForOp(op)` (now the draft exists on disk) to get the **drafted proposal's coverage %**, and include it in the `proposal.draft`/compliance emit + the submit-gate detail so the operator sees "matrix coverage: X%, N gaps" before approving. Best-effort — a failure never blocks the draft or the gate.

## 5. Testing (`evals/gov-grounding.eval.mjs`)
- `groundingBlock` lists every requirement, grouped, gaps-first (a ⛔ gap requirement appears before an addressed one).
- Includes each provided snippet's title + body.
- **Filters `needsReview` past-performance** (a stub is NOT rendered as a citable record).
- **Empty/stub-only past-performance → the explicit "do NOT fabricate" line**, never a blank or invented citation.
- Renders a real past-performance record when one is provided.
- Never throws on empty inputs → returns a usable block (still with the requirements/no-fabrication scaffolding).

## 6. Success criteria
1. A drafted proposal's prompt contains the matrix requirements + the library sections + only real past-performance; a `needsReview` won-stub is excluded.
2. With no real past-performance, the prompt forbids fabrication (verified in the assembled block).
3. The submit gate shows the drafted proposal's matrix coverage %; nothing auto-sends.
4. `groundingBlock` eval-pinned; full suite green; the existing compliance self-heal + facts-guard still run.

## 7. Phase boundaries
Phase 4 grounds the draft. **Phase 5** = incumbent/extended discovery. **Phase 6** = SCA-wage price (feeds the code-computed price `draft()` already cites). **Phase 7 Port #3** (Bid Brief) reuses `groundingBlock`'s inputs (matrix + library + price).
