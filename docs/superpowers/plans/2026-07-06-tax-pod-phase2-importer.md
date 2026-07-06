# Tax & Wealth Pod — Phase 2 (bank-CSV importer + review queue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Import bank/card CSV statements into the Phase-1 tax ledger — classified against the fixed taxonomy, deduped against manual captures, with a companion review queue — so the operator's set-aside number reflects real spending. Per `docs/superpowers/specs/2026-07-06-tax-pod-phase2-importer-design.md`.

**Architecture:** Pure eval-pinned engines (column-map apply, dedup, review resolution) around the existing append-only `tax-ledger/<year>.jsonl`. Imported rows are ledger entries with `source:'csv'`. LLM is used ONLY to propose a column map once (operator-confirmed) and to classify leftover rows via `claudeBatch` against the fixed taxonomy. No LLM output becomes a stored number.

**Tech Stack:** Node ≥18 builtins (fs, path, crypto) — no npm deps. Evals via `node evals/run.mjs`.

## Global Constraints

- **No npm dependencies** in `pods/` or `companion/server.js`.
- **Integer cents everywhere**; amounts parsed by the existing `toCents` (from `pods/tax/ledger.mjs`).
- **Eval cases pure + sync** — no disk/network/`await` in `run()`. fs wrappers are not eval-tested.
- **Fixed taxonomy is law:** classification picks only from `CATEGORIES` (`pods/tax/ledger.mjs`); `validCategory` rejects anything else. Reuse `pickCategoryId(text, rental)` from `pods/tax/capture.mjs` for LLM replies.
- **Append-only ledger:** never rewrite a line. A review decision appends a superseding entry (`supersedes:<hash>`) and/or a `status:'void'` tombstone (`voids:<hash>`). `summarize`/`readLedger` must honor these.
- **Cross-source dedup:** equal cents AND `|Δdays| ≤ 3` → suspected dup (queued), NOT filed.
- Runtime data gitignored: `tax-inbox/`, `tax-inbox/failed/`, `pods/tax/accounts.json`.
- Reuse from Phase 1 (import exactly): `pods/tax/ledger.mjs` → `toCents, makeEntry, entryHash, CATEGORIES, validCategory, dedupe, summarize, appendEntry, readLedger`; `pods/tax/capture.mjs` → `ruleCategory, pickCategoryId, loadRegistry`; `pods/lib.mjs` → `claudeBatch(items,{tier,maxTokens,agent})` (items `[{system,user}]` → results in order `[{text,...}|{text:'',error}]`), `emit`.
- Every emitted event: `{ kind:'action', actor:'TAX-01', pod:'exec', action:'<verb>', reversible:true, payload }`.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Accounts registry + column-map resolution

**Files:**
- Create: `pods/tax/accounts.json` (committed template — generic, no real bank data)
- Create: `pods/tax/accounts.mjs`
- Create/modify: `evals/tax.eval.mjs` (add cases)
- Modify: `.gitignore` (add `pods/tax/accounts.json`? NO — see note)

**Note:** `accounts.json` is a committed **template** (like `debts.seed.json`). The operator's real accounts live in the same file after they register; to keep real bank labels out of git, the WORKING copy is written to `pods/tax/accounts.local.json` (gitignored) and `loadAccounts()` prefers it, copying the template on first run. So: commit `accounts.json` (template), gitignore `pods/tax/accounts.local.json`.

**Interfaces:**
- Produces:
  - `headerHash(headerCells: string[]) → 12-hex` (PURE; lowercased, trimmed, joined)
  - `resolveProfile(accounts, headerCells) → { account, columnMap } | { account, needsMapping:true } | null` (PURE; matches an account by saved `headerHash`)
  - `applyMap(row: string[], columnMap) → { dateISO, cents, direction } | { error }` (PURE; `direction` = 'in'|'out'; handles `signConvention` 'signed' | 'debit-credit')
  - `loadAccounts()` / `saveAccounts(a)` / `saveProfile(accountId, headerCells, columnMap)` (fs wrappers; write to `accounts.local.json`)

- [ ] **Step 1: Write failing eval cases** (add import `import { headerHash, applyMap, resolveProfile } from '../pods/tax/accounts.mjs';`)

```js
    { name: 'headerHash: stable + case/space-insensitive',
      run: () => {
        const a = headerHash(['Date', 'Amount', ' Description ']);
        const b = headerHash(['date', 'amount', 'description']);
        return { pass: a === b && a.length === 12, detail: a };
      } },

    { name: 'applyMap signed: negative amount = money out, positive = in; parses cents + ISO date',
      run: () => {
        const map = { dateCol: 0, amountCol: 2, descCol: 1, signConvention: 'signed' };
        const out = applyMap(['03/05/2026', 'HOME DEPOT #4021', '-43.00'], map);
        const inc = applyMap(['03/06/2026', 'HAP DEPOSIT', '1850.00'], map);
        return { pass: out.cents === 4300 && out.direction === 'out' && out.dateISO === '2026-03-05'
          && inc.cents === 185000 && inc.direction === 'in', detail: JSON.stringify(out) };
      } },

    { name: 'applyMap debit-credit: separate columns; a junk amount → error (never a bad cents value)',
      run: () => {
        const map = { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, signConvention: 'debit-credit' };
        const debit = applyMap(['2026-03-05', 'Staples', '20.00', ''], map);
        const credit = applyMap(['2026-03-06', 'Refund', '', '15.00'], map);
        const bad = applyMap(['2026-03-06', 'X', 'NaN', ''], map);
        return { pass: debit.cents === 2000 && debit.direction === 'out' && credit.cents === 1500
          && credit.direction === 'in' && !!bad.error, detail: JSON.stringify(credit) };
      } },

    { name: 'resolveProfile: matches saved header hash → columnMap; unknown header → needsMapping',
      run: () => {
        const accounts = [{ id: 'chase-biz', defaultEntity: 'rodgate', headerHash: headerHash(['Date','Desc','Amount']),
          columnMap: { dateCol: 0, descCol: 1, amountCol: 2, signConvention: 'signed' } }];
        const known = resolveProfile(accounts, ['Date', 'Desc', 'Amount']);
        const unknown = resolveProfile(accounts, ['Posted', 'Merchant', 'Debit', 'Credit']);
        return { pass: known.columnMap.amountCol === 2 && unknown.needsMapping === true, detail: JSON.stringify(known.columnMap) };
      } },
```

- [ ] **Step 2: Run — expect red** (`node evals/run.mjs` → accounts.mjs missing)

- [ ] **Step 3: Create `pods/tax/accounts.json`** (generic template):

```json
{
  "_comment": "Account registry TEMPLATE. Your real accounts get written to accounts.local.json (gitignored). Register an account: id, a label, its defaultEntity (rodgate | sidehustles | brickave-llc), and Jarvis learns the CSV columnMap from the first file (you confirm it once).",
  "accounts": [
    { "id": "example-card", "label": "Example card (edit or delete me)", "defaultEntity": "rodgate", "headerHash": null, "columnMap": null, "signConvention": null }
  ]
}
```

- [ ] **Step 4: Create `pods/tax/accounts.mjs`:**

```js
// Account registry + CSV column-map profiles. An account carries a defaultEntity and — once learned —
// a columnMap keyed by the CSV header hash, so every future file from that bank is parsed by CODE only
// (the LLM proposes the map once; the operator confirms it before any row files). PURE core + fs wrappers.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toCents } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, 'accounts.json');
const LOCAL = path.join(HERE, 'accounts.local.json');

// PURE: a stable identity for a CSV layout — lowercased, trimmed header cells joined.
export function headerHash(headerCells) {
  const norm = (headerCells || []).map((c) => String(c).toLowerCase().trim()).join('|');
  return crypto.createHash('sha256').update(norm).digest('hex').slice(0, 12);
}

// PURE: one raw CSV row + a columnMap → normalized { dateISO, cents, direction } or { error }.
export function applyMap(row, columnMap) {
  const m = columnMap || {};
  const rawDate = String(row[m.dateCol] ?? '').trim();
  const dateISO = toISO(rawDate);
  if (!dateISO) return { error: `bad date ${JSON.stringify(rawDate)}` };
  let cents, direction;
  if (m.signConvention === 'debit-credit') {
    const d = String(row[m.debitCol] ?? '').trim(), c = String(row[m.creditCol] ?? '').trim();
    if (d) { const v = toCents(d); if (v == null) return { error: `bad debit ${d}` }; cents = v; direction = 'out'; }
    else if (c) { const v = toCents(c); if (v == null) return { error: `bad credit ${c}` }; cents = v; direction = 'in'; }
    else return { error: 'row has neither debit nor credit' };
  } else {
    let raw = String(row[m.amountCol] ?? '').trim();
    const neg = /^-/.test(raw) || /^\(.*\)$/.test(raw);
    raw = raw.replace(/[()\-]/g, '');
    const v = toCents(raw);
    if (v == null) return { error: `bad amount ${JSON.stringify(row[m.amountCol])}` };
    cents = v; direction = neg ? 'out' : 'in';
  }
  return { dateISO, cents, direction };
}

// PURE: parse common US date formats → ISO. Returns '' if it can't.
function toISO(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { let [, mo, d, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
  return '';
}

// PURE: find the account whose saved headerHash matches this file; else flag needsMapping.
export function resolveProfile(accounts, headerCells) {
  const h = headerHash(headerCells);
  const byHash = (accounts || []).find((a) => a.headerHash === h);
  if (byHash) return { account: byHash, columnMap: byHash.columnMap };
  // unknown layout — caller must map it (Claude proposes, operator confirms). Pick a single account if
  // there's exactly one, else null (caller asks which account this file belongs to).
  const single = (accounts || []).length === 1 ? accounts[0] : null;
  return single ? { account: single, needsMapping: true } : null;
}

// ── fs wrappers (not eval-tested) ──────────────────────────────────────────────────────────────────
export function loadAccounts() {
  if (!fs.existsSync(LOCAL)) fs.copyFileSync(TEMPLATE, LOCAL);
  return JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
}
export function saveAccounts(a) { fs.writeFileSync(LOCAL, JSON.stringify(a, null, 2)); }
export function saveProfile(accountId, headerCells, columnMap) {
  const store = loadAccounts();
  const acct = store.accounts.find((x) => x.id === accountId);
  if (!acct) return { error: `unknown account ${accountId}` };
  acct.headerHash = headerHash(headerCells); acct.columnMap = columnMap;
  saveAccounts(store); return acct;
}
```

- [ ] **Step 5: `.gitignore`** — add `pods/tax/accounts.local.json` under the tax block.
- [ ] **Step 6: Run evals green** (`node evals/run.mjs`), then **commit** (`feat(tax): account registry + CSV column-map resolution (header-hash profiles)`).

---

### Task 2: Importer pure core — parse + exact + cross-source dedup

**Files:** Create `pods/tax/importer.mjs`; modify `evals/tax.eval.mjs`.

**Interfaces:**
- Consumes: `applyMap` (Task 1); `entryHash`, `makeEntry` (ledger).
- Produces `classifyDedup({ rows, account, existingEntries, todayISO }) → { prepared, failedRows }` where each `prepared` item is `{ dateISO, cents, direction, payee, entity, status, reviewKind?, dupOf?, category? }` BEFORE category classification (Task 3 fills category). Dedup logic lives here:
  - exact: skip if `entryHash` already in `existingEntries` (dropped, counted in a `deduped` tally)
  - cross-source: existing entry with equal `cents` and `|Δdays| ≤ 3` → `status:'needs_review', reviewKind:'suspected-dup', dupOf:<hash>`

- [ ] **Step 1: Failing evals** (import `classifyDedup`):

```js
    { name: 'classifyDedup: exact re-drop is skipped (idempotent)',
      run: () => {
        const acct = { defaultEntity: 'rodgate', columnMap: { dateCol:0, descCol:1, amountCol:2, signConvention:'signed' } };
        const existing = [makeEntry({ dateISO: '2026-03-05', amount: 43, payee: 'HOME DEPOT #4021', entity: 'rodgate', category: 'schC:supplies', source: 'csv' })];
        const rows = [['03/05/2026', 'HOME DEPOT #4021', '-43.00']];
        const r = classifyDedup({ rows, account: acct, existingEntries: existing, todayISO: '2026-07-05' });
        return { pass: r.prepared.length === 0 && r.deduped === 1, detail: JSON.stringify(r) };
      } },

    { name: 'classifyDedup cross-source: equal cents within 3 days of a manual capture → suspected-dup queued',
      run: () => {
        const acct = { defaultEntity: 'rodgate', columnMap: { dateCol:0, descCol:1, amountCol:2, signConvention:'signed' } };
        const manual = makeEntry({ dateISO: '2026-03-03', amount: 43, payee: 'Home Depot', entity: 'rodgate', category: 'schC:supplies', source: 'capture' });
        const rows = [['03/05/2026', 'HOMEDEPOT #4021 SCRANTON', '-43.00']]; // 2 days later, same $43
        const r = classifyDedup({ rows, account: acct, existingEntries: [manual], todayISO: '2026-07-05' });
        return { pass: r.prepared.length === 1 && r.prepared[0].status === 'needs_review'
          && r.prepared[0].reviewKind === 'suspected-dup' && r.prepared[0].dupOf === manual.hash, detail: JSON.stringify(r.prepared[0]) };
      } },

    { name: 'classifyDedup: same cents but 4 days apart → NOT a dup, filed separately',
      run: () => {
        const acct = { defaultEntity: 'rodgate', columnMap: { dateCol:0, descCol:1, amountCol:2, signConvention:'signed' } };
        const manual = makeEntry({ dateISO: '2026-03-01', amount: 43, payee: 'Home Depot', entity: 'rodgate', category: 'schC:supplies', source: 'capture' });
        const rows = [['03/05/2026', 'HOME DEPOT', '-43.00']]; // 4 days later
        const r = classifyDedup({ rows, account: acct, existingEntries: [manual], todayISO: '2026-07-05' });
        return { pass: r.prepared.length === 1 && r.prepared[0].reviewKind !== 'suspected-dup', detail: JSON.stringify(r.prepared[0]) };
      } },

    { name: 'classifyDedup: unparseable row → failedRows, never a bad entry',
      run: () => {
        const acct = { defaultEntity: 'rodgate', columnMap: { dateCol:0, descCol:1, amountCol:2, signConvention:'signed' } };
        const rows = [['notadate', 'X', 'NaN']];
        const r = classifyDedup({ rows, account: acct, existingEntries: [], todayISO: '2026-07-05' });
        return { pass: r.prepared.length === 0 && r.failedRows.length === 1, detail: JSON.stringify(r.failedRows[0]) };
      } },
```

- [ ] **Step 2: red.** **Step 3: implement `pods/tax/importer.mjs` core:**

```js
// CSV import pure core — parse rows via the account's columnMap, dedup against the existing ledger
// (exact hash + cross-source cents/±3-day), and hand back prepared rows for classification (Task 3).
// No I/O here; the fs wrapper (importInbox) lives below and is not eval-tested.

import { applyMap } from './accounts.mjs';
import { entryHash } from './ledger.mjs';

const DAY = 86400000;
const daysBetween = (a, b) => Math.abs((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);

// direction 'in' → an income entry; 'out' → an expense. payee comes from descCol.
export function classifyDedup({ rows, account, existingEntries = [], todayISO }) {
  const map = account.columnMap || {};
  const prepared = [], failedRows = []; let deduped = 0;
  const existingHashes = new Set(existingEntries.filter((e) => e && e.hash).map((e) => e.hash));
  for (const row of rows) {
    const parsed = applyMap(row, map);
    if (parsed.error) { failedRows.push({ row, error: parsed.error }); continue; }
    const payee = String(row[map.descCol] ?? '').trim().slice(0, 120) || 'unknown';
    const entity = account.defaultEntity;
    const h = entryHash({ dateISO: parsed.dateISO, cents: parsed.cents, payee, entity });
    if (existingHashes.has(h)) { deduped += 1; continue; }        // exact re-drop
    const item = { dateISO: parsed.dateISO, cents: parsed.cents, direction: parsed.direction,
      payee, entity, status: 'confirmed' };
    const dup = existingEntries.find((e) => e && e.cents === parsed.cents && e.status !== 'void'
      && daysBetween(e.dateISO, parsed.dateISO) <= 3);
    if (dup) { item.status = 'needs_review'; item.reviewKind = 'suspected-dup'; item.dupOf = dup.hash; }
    prepared.push(item);
  }
  return { prepared, failedRows, deduped };
}
```

- [ ] **Step 4: green. Step 5: commit** (`feat(tax): importer core - parse + exact + cross-source (±3d) dedup`).

---

### Task 3: Classify (rules → claudeBatch) + file/queue + inbox wrapper + quarantine

**Files:** Modify `pods/tax/importer.mjs` (add classification + fs wrapper); modify `evals/tax.eval.mjs`.

**Interfaces:**
- Produces:
  - `assignCategory(item, { registry }) → item` (PURE; sets `category` + may downgrade to needs_review): income direction → `income:*` (rent/hap heuristic else `income:gross-receipts`); expense → `ruleCategory`; unresolved → leave `category:null` for the batch. NEVER stores an off-taxonomy category.
  - `finalizeItems(items) → entries[]` (PURE; each prepared item → a full ledger entry via `makeEntry`, preserving status/reviewKind/dupOf; a null category → `needs_review` + `meta:personal` placeholder)
  - `importInbox({ dir, apply }) → Promise<summary[]>` (fs wrapper: read CSVs, resolve account/map, classify leftover via `claudeBatch`, append filed, write queued, quarantine bad files)

- [ ] **Step 1: failing evals** for the PURE pieces (`assignCategory`, `finalizeItems`) — pin: income 'out' HAP row → `income:hap`; a "home depot" expense on an LLC-property context → schE; an unmatched expense → `category:null` (→ batch); `finalizeItems` turns a null-category item into a `needs_review` entry with a valid placeholder category and never an off-taxonomy value. (Follow the Task-2 eval style; use `REG` for the registry.)

- [ ] **Step 2: red. Step 3:** implement `assignCategory` (reuse `ruleCategory`, `pickCategoryId`), `finalizeItems` (reuse `makeEntry`), and `importInbox` (reuse `claudeBatch` for null-category items — one call for the whole file; results validated by `pickCategoryId`; on batch error the item stays `needs_review`). `importInbox` moves a file to `tax-inbox/failed/` when >20% of rows are in `failedRows` or 0 rows parsed; emits an `action`/`TAX-01` event per file with the summary.

- [ ] **Step 4: green. Step 5:** smoke `importInbox` against a synthetic CSV written to a temp dir (not the real inbox) — assert filed+queued counts. **Step 6: commit** (`feat(tax): CSV classification (rules→claudeBatch, taxonomy-gated) + inbox import + quarantine`).

---

### Task 4: Review queue + append-only supersession in the ledger

**Files:** Create `pods/tax/review.mjs`; modify `pods/tax/ledger.mjs` (`summarize`/`readLedger` honor `void` + `supersedes`); modify `evals/tax.eval.mjs`.

**Interfaces:**
- `pods/tax/review.mjs`:
  - `listPending(entries) → [{ hash, cents, dateISO, payee, entity, category, reviewKind, dupOf? }]` (PURE; entries with `status:'needs_review'` that aren't superseded/void)
  - `resolve(entry, decision) → { entries }` (PURE) where `decision = { type:'accept'|'recategorize'|'merge'|'keep-both'|'reject', entity?, category? }`:
    - accept → append superseding entry `{...entry, status:'confirmed', supersedes:entry.hash}`
    - recategorize → validate entity/category, append superseding confirmed entry
    - merge → append superseding confirmed entry + a `void` tombstone for `entry.dupOf` (drop the manual capture)
    - keep-both → append superseding confirmed entry, clear the dup flag
    - reject → append a `void` tombstone for `entry.hash`
- `pods/tax/ledger.mjs`: `summarize` and `readLedger` filtering must skip any entry whose hash appears in a later `voids:` tombstone or is `supersedes`'d by a later entry (keep only the latest per lineage; drop voided).

- [ ] **Step 1: failing evals** — pin each resolve type produces the right appended entries; and a `summarize` over `[incomeA, void(A)]` excludes A; over `[needsReviewX, accept→supersede(X)]` counts the confirmed one exactly once. **Step 2: red. Step 3: implement. Step 4: green. Step 5: commit** (`feat(tax): review-queue resolution + append-only void/supersede in the ledger`).

---

### Task 5: Review API routes + cockpit review screen

**Files:** Modify `companion/server.js` (2 routes); create `companion/public/tax-review.js` + `.css`; wire a "review N" link into the 💰 line in `companion/public/today.js`.

**Interfaces:**
- `GET /api/tax/review` → `{ pending: listPending(readLedger(year)), needsMapping: [...] }` (also surface any file/account awaiting a column-map confirm).
- `POST /api/tax/review/resolve` `{ hash, decision, entity?, category? }` → find the entry, `resolve`, append the returned entries via `appendEntry`, emit an `action`/`TAX-01` event, return `{ ok, remaining }`.
- Routes use dynamic `import('../pods/tax/review.mjs')` + the existing `send`/`readBody`, matching the Phase-1 `/api/tax/*` block. Wrap in try/catch.
- `today.js`: when `d.tax.needsReview > 0`, the 💰 line gets a "· N to review →" affordance that opens the review screen (a simple list view; follow the existing `renderTax`/cockpit DOM patterns, `.textContent` for any row text — CSV payees are untrusted data).

- [ ] **Step 1:** add routes (verify with `node --check` + a live curl of `/api/tax/review` on the running companion, expecting `{pending:[...]}`). **Step 2:** build the review screen (list rows: payee/amount/date + entity+category guess, Accept button, a `<select>` of the taxonomy for recategorize, Merge/Keep-both when `reviewKind==='suspected-dup'`; POST to resolve; remove the row on success). **Step 3:** live-verify one accept + one recategorize round-trip changes the ledger and the row leaves the list. **Step 4: commit** (`feat(tax): review API + cockpit review screen (clear the import queue)`).

---

### Task 6: Backfill runner + synthetic end-to-end + docs

**Files:** Modify `pods/tax/importer.mjs` (CLI `--backfill`); create `evals/fixtures/` synthetic CSVs are NOT needed (generate in a temp dir in the smoke); modify `docs/STATE-OF-BUILD.md`, `docs/whats-next.md`.

- [ ] **Step 1:** add the CLI: `node pods/tax/importer.mjs --backfill` runs `importInbox({ dir: 'tax-inbox' })` and prints `N files · X filed · Y queued · Z failed · $D deductions found`. **Step 2:** end-to-end smoke — write 2 synthetic CSVs (one known layout, one new layout needing a map) to a temp inbox, run `importInbox`, assert filed/queued/quarantine behavior and that `taxStatus()` set-aside moves off $0. **Step 3:** update STATE-OF-BUILD (Phase 2 shipped, eval count) + whats-next (operator homework: register each bank once + confirm its column map; export Jan–Jun 2026 CSVs into `tax-inbox/` and run `--backfill`). **Step 4:** full `node evals/run.mjs` green. **Step 5: commit** (`docs(tax): Phase 2 shipped - backfill runner + importer docs`).

---

## Self-review notes
- Every task ends green + independently reviewable. Tasks 1–4 + 6 are pure/fs and eval-pinned; Task 5 is UI/integration (live-verified, not eval-pinned).
- The append-only void/supersede change to `summarize`/`readLedger` (Task 4) is the one cross-cutting edit — its evals pin that Phase-1 totals are unchanged when no void/supersede rows exist (backward-compatible).
- No new external credentials; `claudeBatch` reuses the existing scoped Anthropic path.
