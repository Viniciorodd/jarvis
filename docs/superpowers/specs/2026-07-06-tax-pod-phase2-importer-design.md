# Tax & Wealth pod — Phase 2: bank-statement importer + review queue (design spec)

**Date:** 2026-07-06 · **Status:** approved by operator (design conversation) · **Builds on:**
Phase 1 (`pods/tax/`, shipped 2026-07-06) + [`2026-07-05-tax-pod-design.md`](2026-07-05-tax-pod-design.md).

## Why

Phase 1 gives a live tax estimate, but it reads an empty ledger — the set-aside number is $0 until
expenses/income are captured. **Phase 2 turns "$0" into the operator's real number** by importing bank
and card CSV statements (no bank credentials — he exports the files), classifying every row against the
fixed form-line taxonomy, and backfilling Jan–Jun 2026. This kills the "lost deductions" pain at scale.

## Approved design decisions (the three that the Phase-1 outline left open)

1. **Cross-source dedup → review, never silent.** The Phase-1 ledger hash-dedupes exact re-drops. For a
   row that *might* be a manual capture arriving again as bank data (bank posts 1–3 days after the swipe,
   different payee string), code matches on **exact cents within a ±3-day window**; a near-match does NOT
   auto-file — it goes to the review queue as *"possible duplicate of your capture on the Nth."* On merge,
   the **bank row wins** (real posted amount); keep-both is available for genuine same-amount coincidences.
2. **Per-account default entity + per-row overrides.** Each registered account carries a default entity
   (e.g. "this Chase card = Rodgate"). Every row inherits it; payee-keyword rules (`ruleCategory`) can
   override per-row (a Home Depot charge whose memo says "brick ave" → the LLC). Ambiguous → review.
3. **Companion review screen.** The queue is cleared in a cockpit list (best-guess entity+category shown,
   one-tap accept, recategorize dropdown, merge/keep-both for suspected dups) — built to clear ~40 items
   in minutes. Not one-at-a-time Telegram.

## Architecture

Three new pod files + one cockpit screen. Imported rows are just ledger entries (`source:'csv'`) in the
**existing** `tax-ledger/<year>.jsonl` — no second store to reconcile. Everything reuses Phase-1 pieces
(`toCents`, `makeEntry`, `entryHash`, `CATEGORIES`/`validCategory`, `ruleCategory`, `dedupe`, `claudeBatch`).

```
pods/tax/
  accounts.json      registry: [{ id, label, defaultEntity, headerHash, columnMap, signConvention }]
  accounts.mjs       register/list accounts; resolve a CSV's profile by header hash; save a confirmed map
  importer.mjs       PURE core (parse rows via a map, classify, dedup-tag) + thin fs wrapper (drop folder)
  review.mjs         PURE queue ops: listPending(entries), resolve(entry, decision) → mutated entry/entries
companion/public/
  tax-review.js/.css a cockpit review list (reached from the 💰 Home line when needsReview > 0)
```

Runtime data (all gitignored, alongside Phase-1 data): `tax-inbox/` (drop folder) + `tax-inbox/failed/`
(quarantine). `accounts.json` is gitignored too (contains the operator's bank labels).

### Component 1 — accounts + column-map profiles (`accounts.mjs`, `accounts.json`)

An account is registered once with a label + default entity. The first CSV from it has no saved profile:
`accounts.mjs` computes a **hash of the header row**; if unknown, it asks Claude (one call) to map columns
→ `{ dateCol, amountCol, descCol, signConvention }` where `signConvention` is `'signed'` (one amount
column, negatives = money out) or `'debit-credit'` (separate columns). Because a wrong map silently
corrupts everything, the proposed map is **confirmed by the operator on the review screen before any row
files**; once confirmed it's saved under the header hash and every future file is parsed by **code only**.
A saved map that later fails a sanity check (row count 0, amounts don't parse) → the file is quarantined.

### Component 2 — the import pipeline (`importer.mjs`)

PURE core `importRows({ rows, account, existingEntries, C, todayISO }) → { filed, queued, failedRows }`:
1. **Parse** each raw row via the account's `columnMap`: date → ISO, amount → integer cents via `toCents`,
   sign → income vs expense direction. A row that won't parse (bad date/amount) is collected in `failedRows`.
2. **Exact dedup** — reuse Phase-1 `entryHash`; a row whose hash is already in `existingEntries` is dropped
   (idempotent re-drop).
3. **Cross-source dedup** — else look for an existing entry with **equal cents** and `|Δdays| ≤ 3`; if found,
   tag the row `status:'needs_review', reviewKind:'suspected-dup', dupOf:<hash>` (queued, not filed).
4. **Entity + category** — inherit `account.defaultEntity`; `ruleCategory` may override; rows still unresolved
   are classified in **one `claudeBatch`** against the fixed taxonomy (invented category → rejected → review).
5. **File or queue** — confident + unambiguous → `status:'confirmed'`; low confidence / ambiguous entity /
   suspected dup / first-time unconfirmed map → `status:'needs_review'` with a `reviewKind`.

Thin wrapper `importInbox({ dir })`: reads each CSV in `tax-inbox/`, resolves its account+map (or flags
"needs mapping"), runs `importRows`, appends filed entries, writes queued entries, moves malformed files to
`tax-inbox/failed/`, returns a summary `{ file, filed, queued, failed }[]`.

### Component 3 — the review queue (`review.mjs`)

PURE ops over ledger entries with `status:'needs_review'`:
- `listPending(entries) → [{ hash, cents, date, payee, entity, category, reviewKind, dupOf? }]`
- `resolve(entry, decision)` where decision is one of: `accept` (→ confirmed as-is), `recategorize`
  (new entity/category from the fixed taxonomy, validated) → confirmed, `merge` (drop this row's manual
  counterpart `dupOf`, keep the bank row → confirmed), `keep-both` (→ confirmed, clears the dup flag),
  `reject` (→ dropped/`meta:personal`). Returns the mutated entry (+ the hash to drop on merge).
The ledger is append-only, so a "mutation" is recorded by appending a superseding entry + a tombstone for
the dropped hash (a `status:'void'` marker `resolve` emits), and `summarize`/`readLedger` already skip
non-confirmed rows — extend them to also skip `void` and honor supersession by hash.

### Component 4 — cockpit review screen + routes

`GET /api/tax/review` → `listPending`; `POST /api/tax/review/resolve` `{ hash, decision, entity?, category? }`.
The screen renders off the 💰 Home line when `needsReview > 0`: a list of rows, each with Jarvis's guess,
one-tap accept, a taxonomy dropdown, and merge/keep-both on suspected dups. Confirmed items leave the list;
the Home set-aside number updates as the queue clears.

### Component 5 — the backfill

`node pods/tax/importer.mjs --backfill` (or the inbox wrapper): the operator exports Jan–Jun 2026 CSVs into
`tax-inbox/`, runs it once; it processes all, prints `X filed · Y queued · $Z deductions found`, and the
estimate finally reflects reality. **The real backfill waits on the operator's CSV export (his homework)**,
but the whole engine is built + tested now against **synthetic CSVs**, proven before real files touch it.

## Error handling

- Unknown header (no saved map) → the file is held as `needs-mapping`; the review screen shows the proposed
  Claude map for one-tap confirm; nothing files until confirmed.
- Map fails sanity (0 rows parsed, or >20% of rows fail amount/date) → whole file → `tax-inbox/failed/`,
  operator notified via the summary; nothing partial enters the ledger.
- `claudeBatch` unavailable → those rows fall to `needs_review` (never guessed, never silently miscategorized).
- Amount/sign ambiguity (a refund/credit on an expense account) → `needs_review`, never auto-flipped.

## Testing (evals extend `evals/tax.eval.mjs`, pure/sync)

- Column-map applied deterministically to known rows → exact cents + dates (both sign conventions).
- Exact dedup (re-drop = 0 new) **and** cross-source dedup: equal cents at Δ2 days → suspected-dup queued;
  at Δ4 days → filed separately (the ±3 boundary pinned).
- Sign → income vs expense mapping; a credit/refund row is queued, not auto-classified.
- Classifier still cannot invent a category (off-taxonomy → rejected) on the batch path.
- Malformed file / bad map → quarantined, ledger untouched (via the pure core's `failedRows`).
- `review.resolve`: accept / recategorize / merge (drops `dupOf`, keeps bank row) / keep-both / reject each
  produce the right ledger mutation; `summarize` honors void + supersession.

## Build order (each ends green + task-reviewed, like Phase 1)

1. `accounts.mjs` + `accounts.json` + header-hash profile resolution + the one-time Claude column-map.
2. `importer.mjs` pure core: parse + exact/cross-source dedup (+ evals).
3. classifier (rules → claudeBatch) + file/queue + the `importInbox` fs wrapper + quarantine (+ evals).
4. `review.mjs` + supersession/void in ledger `summarize`/`readLedger` (+ evals).
5. `/api/tax/review*` routes + the cockpit review screen.
6. Backfill runner + synthetic-CSV end-to-end test + docs (STATE-OF-BUILD / whats-next).

## Non-goals / boundaries (unchanged from Phase 1)

- **No bank credentials** (Plaid etc.) — the operator exports CSVs; deferred as its own future decision.
- **Nothing files, pays, transfers, or negotiates.** The importer classifies and queues; the operator
  resolves. Filing/paying stay his hand.
- Not tax advice — planning estimates; FreeTaxUSA is the authority at filing.

## Doctrine compliance

| Directive | How |
|---|---|
| 1 — code disposes | Amounts parsed by `toCents`; column maps applied by code after a one-time confirm; classifier picks only from the fixed taxonomy. No LLM-produced number is stored. |
| 2 — gate irreversibles | Import only files/queues; review decisions are the operator's; no send/pay/transfer exists. |
| 3 — least privilege | Reuses the existing LEDGER-01-scoped Anthropic access via `claudeBatch`; no new external credential. |
| 4 — untrusted content | CSV cells + payee text are DATA — parsed by code, classified against a fixed list, never executed. |
| 5 — evals + tracing | Eval suite extends from task 1; each import/resolve emits an `action`/`actor:'TAX-01'` event. |
