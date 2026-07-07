# Tax & Wealth pod — Phase 3B: docs indexer (design spec)

**Date:** 2026-07-07 · **Status:** approved by operator · **Builds on:** Phase 1/2/3A (`pods/tax/`).
**Phase 3 sequence:** 3A deadlines (shipped) → **3B docs indexer (this)** → 3C FreeTaxUSA filing pack.

## Why
Document chaos is one of the operator's four tax pains — receipts/HUDs/contracts/insurance scattered across
`Z:\Real Estate\Deals\...`, gov drafts, and Fiverr folders. 3B turns that scatter into a **searchable manifest
organized by property/entity/kind**, and lets a deduction point at its receipt — so the filing pack (3C) can
list docs per property and the operator can find "the receipt for this expense" in one place.

## Approved decisions
- **Index + one-tap attach + smart suggestions** (not index-only, not manual-only).
- **Filename + folder only — NO OCR.** Read the file NAME and location, never the contents. Deterministic,
  fast, no external engine, no fragility on messy scans.
- Boundary: metadata only (name + `stat`); **never opens, moves, deletes, or uploads a file.**

## Architecture
One engine `pods/tax/docs-index.mjs` (PURE core + thin fs wrapper), config in `entities.json`, routes on the
companion, and a "suggest receipts" affordance on the existing Phase-2 review screen.

### Component 1 — classify + index (PURE core, eval-pinned)
- `classifyDoc(name, folderPath, registry) → { kind, property, entity }`
  - `kind` by filename/extension heuristics: `receipt` (receipt/invoice/order), `hud` (hud/alta/settlement),
    `contract` (contract/agreement/psa), `insurance` (policy/insurance/eoi/coverage/dp3), `appraisal`
    (appraisal/valuation/cma), `permit` (permit), `statement` (statement/1099/bank), `closing` (deed/title),
    else `other`.
  - `property`/`entity` by matching `folderPath` (case-insensitive) against each property's address + aliases
    in `registry.properties`; the matched property's `entity` is attached. Gov-drafts path → `rodgate`;
    fiverr path → `sidehustles`. No match → `property:null, entity:null`.
- `buildIndex(walkResult, registry) → [{ path, name, folder, kind, property, entity, mtimeMs, sizeBytes }]`
  (PURE given a `walkResult` = `[{ path, name, folder, mtimeMs, sizeBytes }]`, so it's fully eval-testable).

### Component 2 — the fs wrapper + config
- `indexDocs({ registry }) → summary` — walks each root in `registry.docRoots` (recursive, skipping obvious
  junk: `node_modules`, `.git`, hidden dirs, `Thumbs.db`, `.tmp/.crdownload`), builds the `walkResult`, runs
  `buildIndex`, writes `tax-docs/index.json`. A missing/unreachable root (e.g. the Z: network drive offline)
  is skipped with a warning, never a crash. Returns `{ roots:[{root,ok,count}], total }`.
- `loadIndex() → { docs, builtAt }` reader.
- Config: add `"docRoots"` to `entities.json` (default: `["Z:\\Real Estate", "gov-drafts", "fiverr"]`;
  the operator can add folders). `tax-docs/` is already gitignored.

### Component 3 — suggest + attach (link a doc to a ledger entry)
- `suggestDocs(entry, index, { withinDays = 30, limit = 5 }) → [{ path, name, kind, score }]` (PURE) — ranks
  index docs for a ledger entry by: entity/property match (strong), payee/vendor token appearing in the
  filename, an amount token (`entry.cents/100`) in the filename, and mtime within `withinDays` of `entry.dateISO`.
  Sorted best-first; only positive-score candidates returned.
- **Attach (append-only, reuses Phase-2 resolution deltas):** a new resolution `action:'attach-doc'` with a
  `docPath` — `resolveLedger` folds it in as `entry.docPath` (extend the existing recolonize/void/confirm
  switch). `review.mjs resolve` gains an `attach` decision type. So attaching is append-only, consistent with
  the ledger discipline, and survives supersession.

### Component 4 — surfaces
- `GET /api/tax/docs` → `{ builtAt, counts: { byProperty, byEntity, byKind }, docs }` (docs trimmed for the UI).
- `POST /api/tax/docs/reindex` → runs `indexDocs`, returns the summary.
- `POST /api/tax/entry/attach-doc` `{ hash, docPath }` → append the attach resolution via `appendResolution`.
- The Phase-2 **review screen** gains a "📎 suggest receipts" affordance per row: calls a
  `suggestDocs`-backed endpoint and one-tap attaches the chosen doc.
- `taxStatus()`/status gains a light `docsIndexed` count (so Home can show "142 tax docs indexed").

## Error handling
- Offline/missing root → skipped + surfaced in the summary; other roots still index.
- A path that fails `stat` → skipped, logged in the summary; never aborts the walk.
- `attach-doc` with a `docPath` not in the index → still allowed (operator may attach a known path), but the
  route validates it's a non-empty string and within a configured root (path-guarded; no `..`).
- All doc data stays local; no content is read or transmitted.

## Testing (extend `evals/tax.eval.mjs`, pure/sync)
- `classifyDoc`: known filenames/folders → right `kind`; a `Z:\Real Estate\...2135 Brick Ave...` path →
  property `brick-ave` + entity `brickave-llc`; a Ridge path → `ridge-*` + entity `mom`; gov-drafts → rodgate;
  no-match → nulls.
- `buildIndex`: a `walkResult` → the expected index rows with mapping applied.
- `suggestDocs`: a receipt whose filename holds the amount + vendor and whose mtime is near the entry ranks
  above an unrelated doc; entity/property mismatch scores lower; empty index → [].
- `resolveLedger`: an `attach-doc` resolution sets `entry.docPath`; a later one overrides; backward-compatible
  (no attach → unchanged).

## Build order (each ends green + task-reviewed)
1. `docs-index.mjs` PURE core (`classifyDoc`, `buildIndex`, `suggestDocs`) + evals.
2. `indexDocs`/`loadIndex` fs wrapper + `docRoots` config + reindex; `attach-doc` in `resolveLedger` + `review.resolve` (+ evals).
3. Routes (`/api/tax/docs`, `/reindex`, `/entry/attach-doc`, a suggest endpoint) + the review-screen "suggest receipts" affordance + `docsIndexed` on status.
4. Docs (STATE-OF-BUILD / whats-next / CLAUDE.md).

## Non-goals / boundaries
- **No OCR / no content reading** in 3B (deferred; filename+folder covers the need).
- **Never moves/renames/deletes/opens/uploads** a file — index is metadata-only, read-only on the filesystem.
- No cloud/Drive integration — local folders only.

## Doctrine compliance
| Directive | How |
|---|---|
| 1 — code disposes | Classification + ranking are deterministic pure code; no LLM decides where a doc belongs or what it is. |
| 2 — gate irreversibles | Read-only on the filesystem; attach is an append-only ledger delta, reversible by another delta. |
| 4 — untrusted content | Filenames are DATA — matched by code, never executed; contents never read. |
| 5 — evals + tracing | Pure core eval-pinned from task 1; reindex/attach emit `action`/`actor:'TAX-01'` events. |
