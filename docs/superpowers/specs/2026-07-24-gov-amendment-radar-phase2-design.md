# Design — Amendment & Deadline-Change Radar, Phase 2

**Date:** 2026-07-24
**Status:** Approved (operator: "continue to phase 2") → implementation plan next
**Phase context:** Phase 2 of the 8-phase GovCon build. Builds directly on the Phase-1 attachment cache/manifest.

---

## 1. Problem

A federal solicitation gets **amended** — the PWS is revised, a Q&A set is added, quantities change, or the **submission deadline moves**. Miss an amendment and your bid is non-responsive or late: an automatic loss. Jarvis already reminds you when a pursued bid is *closing soon* (`pods/gov/deadlines.mjs` → `runDeadlineRadar`), but nothing detects that a solicitation *changed*. And after an attachment changes, the Phase-1 matrix cache can serve **stale** requirements (SAM sometimes updates a file at the same URL → same cache hash → stale text), so a "compliant" matrix could be scoring the wrong scope.

## 2. Goal

Detect, across scans, when a **pursued** opportunity changes — a moved deadline, a new/changed attachment, or a bumped "Amendment 000N" — alert the operator once, and invalidate the stale attachment cache so the matrix rebuilds fresh.

### Non-goals (Phase 2)
- Summarizing *what specifically* changed inside a revised PWS (text-diff → LLM summary) — a later nice-to-have; the MVP says "it changed, re-check," which is the actionable signal.
- Auto-re-drafting after an amendment — that's Phase 4.
- Changing the existing "closing soon" reminder (`deadlines.mjs`) — Phase 2 is the *change* detector, complementary to it.

## 3. Doctrine constraints
- **Code disposes** on what changed: detection is PURE + deterministic + eval-pinned; no LLM in the hot path.
- **Analysis + alert only.** Pushes a notification and (best-effort) deletes a stale cache dir so the next scan refreshes. Never sends/submits/spends. Cache invalidation is reversible (the scan re-downloads).
- **Idempotent / no spam:** an alert is recorded as a `gov.amendment.flagged` event; the same change never re-alerts (mirrors `deadline.reminded`).
- **Noise control:** only **pursued** opportunities (latest `bid.score` recommendation `bid`, OR a `proposal.draft`, OR a pending submit gate) alert. Others still get snapshots recorded, so if they later become pursued the history exists.

## 4. Architecture

Mirrors `deadlines.mjs` exactly (PURE detector + event-store runner).

### 4.1 Snapshot emission — `pods/gov/worker.mjs` `runScan`
After the matrix pre-build loop (which already ran `ingestAttachments` for the bid-worthy), for each **scored** opp emit one event:
```
emit({ kind:'trace', actor:'SAM-SCOUT', pod:'gov', action:'gov.snapshot', status:'done',
       payload:{ noticeId, title, url, deadline, attSig, amendmentN } })
```
- `attSig` = `attSignature(manifest.files)` where the manifest is read from `gov-drafts/att/<slug>/manifest.json` (Phase-1 output). Empty/no manifest → `''`.
- `amendmentN` = `amendmentLevel(sowText)` over the pulled SOW description text.
- `deadline` = `op.deadline` (already on the payload elsewhere).
Best-effort — snapshot emission never fails the scan.

### 4.2 `pods/gov/amendments.mjs` (NEW)
PURE (eval-pinned):
- `attSignature(files = []) → string` — deterministic signature of an attachment set. Sort each file's `hash` (or `url` if no hash), join, and return a short stable hash (reuse `hashUrl` from `attachments.mjs`, or a local djb2). Order-independent; empty set → `''`.
- `amendmentLevel(text = '') → number` — the highest N in `/amendment\s+0*(\d+)/ig` across the text; `0` if none. (So "Amendment 0002" → 2.)
- `detectAmendments(events = [], { pursued } ) → [{ noticeId, title, url, changes:[...], prev, latest }]`:
  1. Group `gov.snapshot` payloads per notice in chronological (append) order.
  2. For each notice with ≥2 snapshots, take `latest` + `prev` (the one before it).
  3. `changes = []`: push `'deadline'` if `prev.deadline !== latest.deadline` (both non-empty); `'attachments'` if `prev.attSig !== latest.attSig` (and latest non-empty); `'amendment'` if `latest.amendmentN > prev.amendmentN`.
  4. Keep only notices with ≥1 change **and** `pursued.has(noticeId)`.
  5. Dedup: skip if a `gov.amendment.flagged` event already exists for `noticeId` with the same `latest` signature (`${noticeId}|${latest.deadline}|${latest.attSig}|${latest.amendmentN}`).
- `pursuedSet(events) → Set<noticeId>` — notices whose latest `bid.score` is `recommendation:'bid'`, or that have a `proposal.draft`, or a pending gov submit gate (derive from events; the gate list can come from the caller). Keep it event-derived + PURE.

Runner:
- `runAmendmentRadar() → { ok, flagged, changes }` — read `CP_URL + '/events?pod=gov'` (like `runDeadlineRadar`), compute `pursued`, `detectAmendments`, then for each change: `notify({ pod:'Gov War Room', title:'⚠️ Amendment — <title>', detail:<what changed> + ' — re-open the bid and re-run the compliance matrix.' + url })`; record `emit({ action:'gov.amendment.flagged', payload:{ noticeId, deadline, attSig, amendmentN, changes } })`; and **invalidate the stale cache** — best-effort `fs.rm(attDir({noticeId}), {recursive:true,force:true})` when `changes` includes `'attachments'` (so the next scan re-downloads + the matrix rebuilds). `mirror('SAM-SCOUT', flagged?'need':'idle', …)`.

### 4.3 Wiring
- **control-plane** `POST /maintenance/amendment-check` → `import('../pods/gov/amendments.mjs').runAmendmentRadar()` (mirrors `/maintenance/deadline-check`).
- **`control-plane/schedule.json`** — a new `amendment-radar` job (daily, `at_hour` alongside the 9am deadline radar; deterministic, no LLM).

## 5. Testing (`evals/gov-amendments.eval.mjs`)
- `attSignature`: order-independent (same set, different order → same sig); a changed/added file → different sig; empty → `''`.
- `amendmentLevel`: "Amendment 0002" → 2; multiple → the max; none → 0.
- `detectAmendments`: a moved deadline on a pursued bid → one `'deadline'` change; a changed `attSig` → `'attachments'`; a bumped amendment → `'amendment'`; **no change** across identical snapshots → nothing; a change on a **non-pursued** notice → skipped; a change already in `gov.amendment.flagged` → skipped (idempotent).
- `pursuedSet`: a `bid` scored notice + a drafted notice are pursued; a `no-bid`/`watch` notice is not.

## 6. Risks & mitigations
- **Same-URL content update invisible to `attSig`** (SAM replaces a file at the same URL → same hash → `attSig` unchanged; and the cache never re-downloads a same-URL file, so per-file size is stale anyway — `attSig` is keyed on the hash SET only, deliberately, so cache-hit-vs-fresh byte noise can't fire a false alert). This is fine because a real amendment almost always ALSO bumps the notice text ("Amendment 000N") or moves the deadline — and on ANY flagged change the runner invalidates the attachment cache, so the next scan re-downloads the revised file at that URL fresh and the matrix rebuilds. Residual gap: a silent same-URL swap with no amendment-marker bump and no deadline change is not detected (rare in practice).
- **Cache invalidation races a running scan** — best-effort `fs.rm`; if the scan is mid-write the next scan still recovers (re-ingest). No lock needed (single-writer scan cadence).
- **First-ever snapshot** (only one snapshot for a notice) → never a change (needs ≥2). Correct: nothing to compare yet.
- **Event volume** — `gov.snapshot` adds one trace event per scored opp per scan; small, and the radar reads the same `/events?pod=gov` the deadline radar already reads.

## 7. Success criteria
1. Two scans where a pursued bid's deadline moves → exactly one Telegram/HQ alert naming the change; a third scan with no change → no repeat.
2. A pursued bid gains a new attachment → alert + its `gov-drafts/att/<slug>/` cache dir is removed (next scan re-ingests, matrix rebuilds).
3. A non-pursued notice that changes → snapshot recorded, no alert.
4. All detection eval-pinned; full suite green.
