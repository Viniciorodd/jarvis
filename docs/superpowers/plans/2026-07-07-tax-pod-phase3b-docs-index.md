# Tax & Wealth Pod — Phase 3B (docs indexer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Index (never move/open) the operator's tax docs across configured folders → a manifest organized by property/entity/kind, with one-tap attach of a receipt to a ledger entry. Per `docs/superpowers/specs/2026-07-07-tax-pod-phase3b-docs-index-design.md`.

**Architecture:** PURE eval-pinned core (`classifyDoc`/`buildIndex`/`suggestDocs`) + a thin fs walk wrapper + an append-only `attach-doc` resolution delta reusing Phase-2's mechanism + companion routes/UI.

**Tech Stack:** Node ≥18 builtins; evals via `node evals/run.mjs`.

## Global Constraints
- No npm deps; pure/sync eval cases; the fs walk + routes are not eval-tested.
- **Read-only on the filesystem: name + `stat` only. Never open, read contents, move, rename, delete, or upload a file.**
- Attach is an append-only resolution delta (`action:'attach-doc'`), folded by `resolveLedger` → `entry.docPath`; consistent with Phase-2's void/recategorize/confirm deltas.
- Reuse: `pods/tax/ledger.mjs` `resolveLedger`, `makeResolution`, `appendResolution`; `pods/tax/review.mjs` `resolve`; `pods/tax/capture.mjs` `loadRegistry`; `pods/lib.mjs` `emit`, `ROOT`.
- Config: `docRoots` in `pods/tax/entities.json` (default `["Z:\\Real Estate","gov-drafts","fiverr"]`). `tax-docs/` already gitignored.
- Events: `{ kind:'action', actor:'TAX-01', pod:'exec', action:'tax.docs.<verb>', ... }`.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: PURE core — classifyDoc + buildIndex + suggestDocs

**Files:** Create `pods/tax/docs-index.mjs`; modify `evals/tax.eval.mjs`.

**Interfaces (produces):**
- `classifyDoc(name, folderPath, registry) → { kind, property, entity }`
- `buildIndex(walkResult, registry) → [{ path, name, folder, kind, property, entity, mtimeMs, sizeBytes }]` (walkResult = `[{path,name,folder,mtimeMs,sizeBytes}]`)
- `suggestDocs(entry, index, { withinDays, limit }) → [{ path, name, kind, score }]`

- [ ] **Step 1: failing evals** (import `classifyDoc, buildIndex, suggestDocs`; `REG` already bound in the eval file):

```js
    { name: 'classifyDoc: kind by filename; property/entity by folder path',
      run: () => {
        const a = classifyDoc('2135 Brick Ave-Invoice.pdf', 'Z:/Real Estate/Deals/2135 Brick Ave, Scranton, PA 18508 Flip/Receipts', REG);
        const b = classifyDoc('ALTA Combined Settlement Statement.pdf', 'Z:/Real Estate/Deals/2135 Brick Ave, Scranton', REG);
        const c = classifyDoc('Full_Owner_Policy.pdf', 'Z:/Real Estate/463 2nd Street Plymouth', REG);
        const d = classifyDoc('proposal.pdf', 'gov-drafts/sow', REG);
        return { pass: a.kind === 'receipt' && a.property === 'brick-ave' && a.entity === 'brickave-llc'
          && b.kind === 'hud' && c.kind === 'insurance' && c.property === 'second-463'
          && d.entity === 'rodgate', detail: JSON.stringify([a,b,c,d].map(x=>x.kind+'/'+x.property)) };
      } },

    { name: 'classifyDoc: no folder match → null property/entity; deed → closing kind',
      run: () => {
        const a = classifyDoc('random.pdf', 'C:/Downloads', REG);
        const b = classifyDoc('Deed___2135_Brick.pdf', 'Z:/Real Estate/2135 Brick Ave', REG);
        return { pass: a.property === null && a.entity === null && b.kind === 'closing' && b.property === 'brick-ave', detail: `${a.property}/${b.kind}` };
      } },

    { name: 'buildIndex: maps a walkResult to indexed rows with classification applied',
      run: () => {
        const walk = [{ path: 'Z:/Real Estate/2135 Brick Ave/Receipts/Siding material receipt.pdf', name: 'Siding material receipt.pdf', folder: 'Z:/Real Estate/2135 Brick Ave/Receipts', mtimeMs: 1000, sizeBytes: 2048 }];
        const idx = buildIndex(walk, REG);
        return { pass: idx.length === 1 && idx[0].kind === 'receipt' && idx[0].property === 'brick-ave' && idx[0].sizeBytes === 2048, detail: JSON.stringify(idx[0]) };
      } },

    { name: 'suggestDocs: a receipt matching entity + amount + date outranks an unrelated doc',
      run: () => {
        const index = [
          { path: 'x/Home Depot 43.00 receipt.pdf', name: 'Home Depot 43.00 receipt.pdf', kind: 'receipt', property: 'brick-ave', entity: 'brickave-llc', mtimeMs: Date.parse('2026-03-05T00:00:00Z') },
          { path: 'y/random insurance.pdf', name: 'random insurance.pdf', kind: 'insurance', property: null, entity: 'rodgate', mtimeMs: Date.parse('2025-01-01T00:00:00Z') },
        ];
        const entry = { dateISO: '2026-03-05', cents: 4300, payee: 'Home Depot', entity: 'brickave-llc', property: 'brick-ave' };
        const s = suggestDocs(entry, index, { withinDays: 30, limit: 5 });
        return { pass: s.length >= 1 && s[0].name.includes('Home Depot') && s[0].score > 0, detail: JSON.stringify(s.map(x=>x.name+':'+x.score)) };
      } },

    { name: 'suggestDocs: empty index → []',
      run: () => ({ pass: suggestDocs({ dateISO:'2026-03-05', cents:4300, payee:'x', entity:'rodgate' }, [], {}).length === 0, detail: 'ok' }) },
```

- [ ] **Step 2: red.** **Step 3: implement `pods/tax/docs-index.mjs` (pure section):**

```js
// Tax document indexer — turn scattered files into a manifest organized by property/entity/kind, and
// rank likely receipts for a ledger entry. PURE core (this section) + a thin fs walk wrapper (below).
// READ-ONLY on the filesystem: name + stat only, never opens/moves/deletes/uploads a file (doctrine §2/§4).

const KIND_RULES = [
  [/receipt|invoice|order[_ ]?conf|order[_ ]?ack|purchase/i, 'receipt'],
  [/\bhud\b|alta|settlement/i, 'hud'],
  [/contract|agreement|\bpsa\b|assignment/i, 'contract'],
  [/policy|insurance|\beoi\b|coverage|\bdp3\b/i, 'insurance'],
  [/appraisal|valuation|\bcma\b|comparative[_ ]?market/i, 'appraisal'],
  [/permit/i, 'permit'],
  [/statement|1099|bank|liquidity/i, 'statement'],
  [/deed|title|owner[_ ]?policy/i, 'closing'],
];
export function classifyDoc(name, folderPath, registry) {
  const n = String(name || '');
  let kind = 'other';
  for (const [re, k] of KIND_RULES) if (re.test(n)) { kind = k; break; }
  const hay = String(folderPath || '').toLowerCase().replace(/\\/g, '/');
  let property = null, entity = null;
  for (const p of registry.properties || []) {
    const needles = [String(p.address || ''), ...(p.aliases || [])].map((s) => String(s).toLowerCase()).filter(Boolean);
    // match on the full address OR an alias that is specific enough (>=3 chars) to avoid false hits
    if (needles.some((s) => (s.length >= 3 || /^\d+$/.test(s)) && hay.includes(s))) { property = p.id; entity = p.entity; break; }
  }
  if (!entity) {
    if (/gov[-_ ]?draft|\bgov\b|rodgate|sam\b/i.test(hay)) entity = 'rodgate';
    else if (/fiverr|studio/i.test(hay)) entity = 'sidehustles';
  }
  return { kind, property, entity };
}

export function buildIndex(walkResult, registry) {
  return (walkResult || []).map((f) => {
    const c = classifyDoc(f.name, f.folder, registry);
    return { path: f.path, name: f.name, folder: f.folder, kind: c.kind, property: c.property,
      entity: c.entity, mtimeMs: f.mtimeMs || 0, sizeBytes: f.sizeBytes || 0 };
  });
}

const DAY = 86400000;
export function suggestDocs(entry, index, { withinDays = 30, limit = 5 } = {}) {
  if (!entry || !Array.isArray(index) || !index.length) return [];
  const amt = Number(entry.cents) > 0 ? (entry.cents / 100).toFixed(2) : null;
  const payeeTokens = String(entry.payee || '').toLowerCase().split(/\W+/).filter((t) => t.length >= 3);
  const entryMs = Date.parse(String(entry.dateISO || '') + 'T00:00:00Z');
  const scored = index.map((d) => {
    let score = 0;
    const nl = String(d.name || '').toLowerCase();
    if (entry.property && d.property === entry.property) score += 5;
    else if (entry.entity && d.entity === entry.entity) score += 3;
    else if (entry.entity && d.entity && d.entity !== entry.entity) score -= 2;
    if (payeeTokens.some((t) => nl.includes(t))) score += 3;
    if (amt && nl.includes(amt)) score += 4;
    if (Number.isFinite(entryMs) && d.mtimeMs && Math.abs(d.mtimeMs - entryMs) <= withinDays * DAY) score += 2;
    if (d.kind === 'receipt') score += 1;
    return { path: d.path, name: d.name, kind: d.kind, score };
  }).filter((d) => d.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
```

- [ ] **Step 4: green** (`node evals/run.mjs`, ~364). **Step 5: commit** (`feat(tax): docs-index pure core - classifyDoc + buildIndex + suggestDocs (eval-pinned)`).

---

### Task 2: fs walk wrapper + docRoots config + append-only attach-doc

**Files:** Modify `pods/tax/docs-index.mjs` (append fs wrapper); modify `pods/tax/entities.json` (add `docRoots`); modify `pods/tax/ledger.mjs` (`resolveLedger` attach-doc branch + `makeResolution` carries `docPath`); modify `pods/tax/review.mjs` (`attach` decision); modify `evals/tax.eval.mjs`.

- [ ] **Step 1:** Add `"docRoots": ["Z:\\Real Estate", "gov-drafts", "fiverr"]` to `entities.json`.
- [ ] **Step 2:** In `pods/tax/ledger.mjs`: `makeResolution` already spreads optional fields — ensure a `docPath` passes through (add `if (docPath) rec.docPath = docPath;` and accept `docPath` in its args). In `resolveLedger`, add after the recategorize branch: `if (res.action === 'attach-doc' && res.docPath) merged.docPath = res.docPath;` (attach-doc does NOT change status — an already-confirmed entry stays confirmed; a needs_review entry stays needs_review, just gains docPath). NOTE: attach-doc must NOT be treated like confirm — adjust the fold so `attach-doc` only sets docPath and leaves status/reviewKind intact (guard the status→confirmed + reviewKind-strip block to run only for confirm/recategorize/void-handled actions, not attach-doc).
- [ ] **Step 3:** In `pods/tax/review.mjs` `resolve`: add `else if (d.type === 'attach-doc') { if (!d.docPath) return { error: 'attach-doc requires docPath' }; res.push(makeResolution({ target: entry.hash, action: 'attach-doc', docPath: d.docPath, dateISO: entry.dateISO })); }`.
- [ ] **Step 4:** Append the fs wrapper to `docs-index.mjs`: `indexDocs({ registry, dir })` walks each `registry.docRoots` (recursive `fs.readdirSync` with `withFileTypes`; skip dirs named `node_modules`/`.git`/`.tmp` and hidden; skip files `Thumbs.db`/`*.tmp`/`*.crdownload`; a root that throws on read → `{root,ok:false,error}` and continue), builds `walkResult` (path/name/folder/mtimeMs/sizeBytes from `stat`), runs `buildIndex`, writes `tax-docs/index.json` `{ builtAt, docs }`; returns `{ roots, total }`. `loadIndex()` reads it. Emit a `tax.docs.reindex` event.
- [ ] **Step 5: evals** — pin: `makeResolution({action:'attach-doc',docPath})` carries docPath; `resolveLedger` with an attach-doc resolution sets `entry.docPath` WITHOUT changing status (a needs_review entry stays needs_review + gains docPath); backward-compat (no attach → unchanged). **Step 6: green. Step 7: commit** (`feat(tax): docs index fs wrapper + docRoots config + append-only attach-doc resolution`).

---

### Task 3: Routes + review-screen "suggest receipts" + docsIndexed on status

**Files:** Modify `companion/server.js` (routes); modify `companion/public/tax-review.js` (suggest affordance); modify `pods/tax/status.mjs` (docsIndexed count).

- [ ] **Step 1:** Routes (mirror the existing `/api/tax/*` block, dynamic import + send/readBody + try/catch):
  - `GET /api/tax/docs` → `loadIndex()` + computed counts `{ byProperty, byEntity, byKind }`.
  - `POST /api/tax/docs/reindex` → `indexDocs({ registry: loadRegistry() })`.
  - `POST /api/tax/docs/suggest` `{ hash }` → find the entry (via `listPending`/`readLedger`), `suggestDocs(entry, loadIndex().docs)`, return candidates.
  - `POST /api/tax/entry/attach-doc` `{ hash, docPath }` → path-guard `docPath` (non-empty string, no `..`, under a configured root), `resolve(entry, {type:'attach-doc', docPath})`, `appendResolution`, emit, return `{ ok }`.
- [ ] **Step 2:** In `tax-review.js`, add a "📎 receipts" button per row → `POST /api/tax/docs/suggest` → render the candidate list → tap one → `POST /api/tax/entry/attach-doc` → show "attached". `.textContent` for filenames (untrusted).
- [ ] **Step 3:** `status.mjs buildStatus` (or `taxStatus`) adds `docsIndexed: <count>` from `loadIndex()` (best-effort try/catch → 0). Additive.
- [ ] **Step 4:** `node --check`; `node evals/run.mjs` green; live curl `/api/tax/docs` + `/reindex` (reindex will walk the real folders — that's fine, read-only; if Z: is offline it skips gracefully). **Step 5: commit** (`feat(tax): docs API + review-screen receipt suggest/attach + docsIndexed on status`).

---

### Task 4: Docs
**Files:** `docs/STATE-OF-BUILD.md`, `docs/whats-next.md`, `CLAUDE.md`.
- [ ] **Step 1:** Dated 3B entry (indexer shipped: classify by filename+folder, per-property/entity manifest, suggest+attach receipts, read-only/no-OCR); note 3C (filing pack) still ahead. **Step 2:** `node evals/run.mjs` green. **Step 3: commit** (`docs(tax): Phase 3B shipped - docs indexer`).

## Self-review
- Task 1 is the pure testable core (full code). The attach-doc fold (task 2) is the one cross-cutting ledger change — its evals must prove it sets docPath WITHOUT altering status (unlike confirm/recategorize) and stays backward-compatible.
- Read-only filesystem discipline is the key safety property — the walk only stats + reads names.
