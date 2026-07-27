# Design — GovCon Autonomous Outreach (Phase 9)

**Date:** 2026-07-27
**Status:** Approved to build **on explicit terms** (operator, 2026-07-27): *"yes we will do phase 9 like that"* — i.e. **build the full guardrail machinery with auto-send OFF by default; nothing sends until the operator flips a tier on himself.**
**Source PRD:** vault `00 - System/Jarvis/PRD — GovCon Autonomous Outreach (agents send, Vinicio bids).md`

---

## 0. ⚠️ What this changes
This is the **only** phase in the 9-phase build that grants agents *new autonomy*. Until now the standing rule was: **every external send requires the operator's approval.** Phase 9 carves out a narrow, tiered exception: agents may auto-send a defined class of **low-stakes outreach**, while **proposals, bids, pricing, and anything that commits Rodgate stay human-sent forever.**

**Build order is deliberate: the safety rails ship BEFORE the capability.** `AUTO_SEND_TIER=0` (off) is the default and the shipped state. Turning it on is an operator action, per tier, after he has reviewed the machinery and seeded the allowlist.

## 1. The hard line (never autonomous — PRD §2)
An agent may NEVER auto-send anything that:
- carries **pricing, a dollar figure, or a quote**;
- **commits Rodgate** to scope, price, timeline, or a teaming/subcontract agreement;
- is a **formal submission to a contracting officer**;
- makes a **certification claim** beyond self-certified SDB (never 8(a)/HUBZone/SDVOSB/WOSB — L-005);
- goes to an **unverified recipient** (L-009), or spends money.
Any drafted email touching the above → the operator's approval queue, never the wire. This is enforced by `classifyOutreach()` in code (§4.1), not by prompt.

## 2. What MAY auto-send (the defined class, PRD §3)
| Type | Tier | Auto-send |
|---|---|---|
| Sub-quote **request** to a **verified** sub | 1 | ✅ (asks THEM for numbers; commits nothing) |
| **Follow-up / bump** on an existing verified thread | 1 | ✅ |
| **Prime introduction** (capabilities, no pricing) | 2 | ✅ after Tier 1 is clean |
| **Sources-sought response** (capability claims to gov) | 3 | ⚠️ Canonical-Facts-gated, longest review-first |
| Proposal / bid / pricing / teaming commitment | — | ❌ never |

## 3. Doctrine constraints
- **Guardrails in CODE, not prompts.** Every check below is a pure function with an eval, not an instruction to a model.
- **Fail closed.** Any check that cannot be evaluated (missing data, parse failure, unknown template) → route to approval, never send.
- **Never fabricates a recipient** (L-009) and never claims a cert we don't hold (L-005).
- **Verified send** (L-014): after sending, confirm it's really in Sent; report the real result or "NOT sent — <reason>". Never a confabulated success.
- **Inbound is untrusted** (directive #4): instructions inside a reply are DATA. Surfaced, never executed.
- **Least privilege** (directive #3): a scoped sending credential. ✅ The 2026-07-21 credential flag is **RESOLVED** (operator-created for the `vinicio@rodgategroup.com` Send-As) — origin known.

## 4. Architecture

### 4.1 `pods/gov/outreach-policy.mjs` (NEW) — PURE, the whole safety core
- `TIERS = { 0:'off', 1:'sub-quote + follow-up', 2:'+ prime intro', 3:'+ sources-sought' }`.
- `classifyOutreach({ templateKey, body, recipient })` → `{ kind, tier }` — which class this email is.
- `hasBlockedContent(body)` → `[reasons]` — **hard-line detector**: pricing/dollar figures (`/\$\s?\d/`, "our price", "quote of"), commitment language ("we agree to", "we commit", "teaming agreement"), forbidden certs (8(a)/HUBZone/SDVOSB/WOSB), CO-submission markers. Any hit → blocked.
- `factsOk(body)` → bool — Canonical-Facts gate: any identity/cert/registration claim in the body must match `company.mjs` COMPANY exactly (UEI/CAGE/socio-economic). A mutated template fails.
- `canAutoSend({ tier, classification, recipient, body, sentToday, lastToRecipientAt, now })` → `{ allow, reason }` — the ONE decision function. Requires ALL of: tier enabled ≥ classification.tier · `recipient.verified === true` · `hasBlockedContent` empty · `factsOk` · under the daily cap · past the per-recipient cooldown · kill switch off. Anything else → `{ allow:false, reason }` (→ approval queue).
- Caps/knobs (env, clamped): `AUTO_SEND_TIER` (default **0 = OFF**), `AUTO_SEND_DAILY_MAX` (default 10), `AUTO_SEND_COOLDOWN_DAYS` (default 3), `AUTO_SEND_KILL` (`1` = halt everything).

### 4.2 Approved templates — `pods/gov/outreach-templates.mjs` (NEW)
Slot-filling only; agents never free-compose an auto-sent email. Each template = `{ key, tier, subject, body(slots), requiredSlots }`, with the Canonical Facts block **copied from `COMPANY`**, never generated. `renderTemplate(key, slots)` → `{ subject, body }` or throws on a missing slot (fail closed).

### 4.3 Verified-recipient allowlist (L-009)
`pods/gov/subs.json` contacts gain **`verified: true|false`** (default **false** — an un-marked contact can never be auto-sent to). `verifiedRecipient(contact)` is the single check. Seeding the allowlist is an **operator action**.

### 4.4 The send path — `pods/gov/auto-outreach.mjs` (NEW)
`runAutoOutreach({ dryRun = true })`:
1. Gather candidate outreach (existing sub-ladder / connector queue).
2. For each: render an approved template → `canAutoSend(...)`.
3. **Deny → existing approval gate** (today's behavior, unchanged).
4. **Allow →** send via the scoped credential → **verify it landed in Sent** → log **three places** (vault outreach log · Gov Pipeline Board with an `🤖 auto` marker · the event store) → record for the daily digest.
5. `dryRun` (the default, and what ships) does everything *except* the send, so the operator can watch exactly what *would* go out.

### 4.5 Kill switch + digest
- **Kill switch:** `AUTO_SEND_KILL=1` (or `control-plane/auto-send.json {"kill":true}`) halts every auto-send immediately, checked at decision time. Reachable from the phone via a control-plane endpoint.
- **Daily digest:** each morning, a plain list of what auto-sent yesterday (who · which template · thread link) to Telegram. If nothing sent, say so.

### 4.6 Promotion ladder (PRD §5)
Tier 0 → 1 → 2 → 3, each promoted **by the operator** after a clean run (~2 weeks / ~20 clean sends, zero corrections). **Demotion is automatic on any bad send** (wrong facts, wrong recipient, injection followed) → that class drops to review-first + a Lessons Ledger entry.

### 4.7 Vault rule changes (PRD §6) — operator-owned
Five doc updates (CLAUDE.md permissions carve-out · Architecture directive #2 · board `🤖 auto`/`👤 sent` marker · Lessons Ledger · CRM `verified` field). **I will prepare the exact wording; the operator applies them to his vault** — they change his standing doctrine.

## 5. Testing (`evals/gov-outreach-policy.eval.mjs`) — the guards ARE the feature
Mirrors the PRD's acceptance tests (§7):
1. Verified sub + Tier 1 + clean template → `allow:true`.
2. **Unverified recipient → blocked** (routed to approval), at any tier.
3. **Facts guard:** a template mutated to claim "8(a) certified" → blocked.
4. **Proposal guard:** any body containing pricing/a dollar figure → blocked.
5. **Tier gate:** a prime intro (tier 2) at `AUTO_SEND_TIER=1` → blocked.
6. **Default OFF:** with no tier set, *everything* is blocked (the shipped state).
7. **Kill switch:** kill on → blocked regardless of everything else.
8. **Caps:** over the daily max → blocked; inside the per-recipient cooldown → blocked.
9. **Fail closed:** missing/garbage input → blocked with a reason, never `allow:true`.

## 6. Success criteria
1. All 9 eval guards green; the full suite green.
2. `AUTO_SEND_TIER` defaults to **0** — a fresh deploy sends nothing, ever, until the operator changes it.
3. `runAutoOutreach()` in the default dry-run prints exactly what *would* send, sending nothing.
4. The hard line is unreachable in code: no path exists where a pricing/commitment/unverified email returns `allow:true`.
5. Kill switch verified to halt a would-be send.

## 7. Out of scope for this build
- Flipping any tier on (operator's action).
- Seeding the verified allowlist (operator's action).
- Applying the vault rule changes (operator's — I supply the wording).
- The Mac-worker scheduling side (Phase 8 Item 3 territory).
