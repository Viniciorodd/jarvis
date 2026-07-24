# Design — Past-Performance & Snippet Library, Phase 3

**Date:** 2026-07-24
**Status:** Approved (operator: "keep going down the sequence") → build inline, final review.
**Phase context:** Phase 3 of the 8-phase GovCon build. Feeds Phase 4 (matrix-grounded drafting) and the REDOS Bid Brief (Phase 7 Port #3).

---

## 1. Problem
Every janitorial/facilities proposal reuses 60–80% of its content — the QC plan, staffing plan, transition-in plan, safety approach, company overview — plus a set of past-performance citations. Today that content is re-generated (generic AI text) or re-typed each bid, and Rodgate's actual past performance isn't captured anywhere structured. A reusable, operator-curated library is the compounding asset that makes AI drafting (Phase 4) *good* instead of generic, and lets the Bid Brief (Phase 7) cite real experience.

`pods/gov/company.mjs` already holds canonical FACTS (UEI/CAGE/NAICS/socio-economic/competencies). This is the complement: reusable PROSE + past-performance records. The library references `COMPANY` facts, never re-hardcodes them.

## 2. Goal
A structured, curated library of (a) **past-performance records** and (b) **reusable proposal snippets**, with **deterministic retrieval** of what's relevant to a given opportunity, that **auto-grows** a past-performance stub when a bid is won.

### Non-goals (Phase 3)
- Wiring the library into the actual proposal draft — that's **Phase 4** (Phase 3 exposes `libraryFor(opp)`; Phase 4 consumes it).
- LLM-written snippets — snippets are operator-curated (seeded generic templates he edits); the library stores + retrieves, it doesn't generate.
- Rendering the Bid Brief PDF — that's Phase 7 Port #3 (it will consume `libraryFor`).

## 3. Doctrine constraints
- **Code disposes on relevance:** retrieval/ranking is PURE + deterministic (tag/trade/NAICS overlap), eval-pinned. No LLM in the hot path.
- **Never fabricates past performance** (doctrine L-006): the library only stores what the operator entered (or a stub from a real won disposition). Retrieval never invents a record. An empty past-performance set returns empty — never a made-up citation.
- **No send/submit/spend.** Library CRUD + retrieval only.
- **Best-effort** IO: a missing/corrupt runtime file degrades to the seed; the won→stub add never blocks the board.

## 4. Architecture

### 4.1 `pods/gov/library.mjs` (NEW)
Content shapes:
- Past-performance record: `{ id, title, agency, naics, trade, value, periodStart, periodEnd, place, scope, poc, outcome, tags:[] }`.
- Snippet: `{ id, key, title, trade:[], topics:[], core:bool, body }` — `core:true` = always include (QC/staffing/transition/safety/overview); `trade`/`topics` scope the rest.

Storage (mirrors the watcher-health seed pattern):
- `LIB_DIR = gov-library/`.
- Git-tracked **seed**: `gov-library/snippets.seed.json` (generic Rodgate janitorial snippet templates).
- Gitignored runtime: `gov-library/snippets.json` (operator edits/adds) + `gov-library/past-performance.json` (operator's real records + won stubs).
- `loadLibrary()` overlays runtime on seed (runtime snippet with the same `key` supersedes the seed one; past-performance is runtime-only).

PURE (eval-pinned):
- `inferTags(opp)` — derive `{ trade, naics }` from the opp (reuse `inferTrade` from `pipeline.mjs`; opp.naics if present).
- `matchScore(item, opp)` — overlap of item `trade`/`naics`/`tags` with the opp's → integer score (exact NAICS > trade match > tag match > 0).
- `pastPerformanceFor(records, opp, { limit = 3 })` — records with `matchScore > 0`, ranked desc, capped; if none match, the most recent `limit` (some past performance beats none), each still real.
- `snippetsFor(snippets, opp)` — all `core` snippets + any whose `trade`/`topics` match the opp, deduped by `key`, in a stable section order.

IO:
- `addPastPerformance(rec)` / `addSnippet(snip)` — append/upsert to the runtime file (assign `id`); never throws.
- `libraryFor(opp)` → `{ pastPerformance:[...], snippets:[...] }` — the deterministic retrieval both the UI and Phase 4 call.

### 4.2 Seed — `gov-library/snippets.seed.json`
Generic, Rodgate-branded, operator-editable starter templates (real starting prose, not lorem): `company-overview` (from COMPANY differentiators), `quality-control-plan`, `staffing-plan`, `transition-in`, `safety-osha`, `carpet-floor-care` (trade: janitorial), `grounds-maintenance` (trade: grounds). Core = overview/QC/staffing/transition/safety.

### 4.3 Wiring
- **Companion** `GET /api/gov/library` (list all) + `GET /api/gov/library/for?noticeId=` (`libraryFor` for that opp — resolves the opp from the deal ledger) + `POST /api/gov/library/past-performance` (add a record).
- **Won→stub** — in `companion/server.js`'s `/api/gov-board/disposition` handler, when `stage === 'won'`, best-effort `addPastPerformance({ title, agency, value, periodEnd: today, outcome: 'Awarded', trade: inferTrade(title) })` so the library grows from real wins. The operator fleshes out scope/POC later. Never blocks the disposition.

## 5. Testing (`evals/gov-library.eval.mjs`)
- `matchScore`: exact NAICS > trade-only > tag-only > 0 for unrelated.
- `pastPerformanceFor`: ranks relevant first; caps at limit; **empty library → empty (never a fabricated record)**; no-match → falls back to most-recent real records.
- `snippetsFor`: always includes every `core` snippet; includes a trade-matched non-core; excludes an unrelated-trade non-core; deduped by key; stable order.
- `loadLibrary`: runtime snippet with same `key` supersedes the seed; a missing runtime file degrades to seed only (never throws).

## 6. Success criteria
1. `libraryFor(a janitorial opp)` returns the core snippets + janitorial-tagged ones + any relevant past-performance, ranked — deterministically.
2. An empty past-performance store returns `[]` (no fabricated citation).
3. Marking a bid **won** adds a real past-performance stub that then appears in `libraryFor` for similar future opps.
4. `loadLibrary` overlays operator edits on the seed; suite green.

## 7. Phase boundaries
Phase 3 builds + populates + retrieves the library. **Phase 4** feeds `libraryFor(opp)` into the proposal draft (grounded drafting). **Phase 7 Port #3** renders the Bid Brief from `libraryFor` + Bid Fit + price-to-win.
