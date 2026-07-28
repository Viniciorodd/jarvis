# Phase 9 — vault rule-change wording (paste-ready)

The autonomous-outreach PRD §6 requires five doctrine changes in the vault, because the system's **hard rule
is changing**: agents may now auto-send a narrow class of low-stakes outreach. These are the operator's own
governing documents, so **he applies them** — this file supplies the exact wording so nothing gets lost or
softened in translation.

⚠️ **Apply these only when you're actually ready to turn Tier 1 on.** Until `AUTO_SEND_TIER=1` is set, the
machinery is built but inert, and the current "everything needs approval" wording is still literally true.

---

## 1. `CLAUDE.md` → Permissions

**Find the blanket rule** (currently something like *"Sending anything externally requires my approval."*)
**Replace with:**

> **Sending anything externally requires my approval — with ONE scoped exception.**
> Agents MAY auto-send the defined low-stakes outreach class (sub-quote requests, follow-ups, prime
> introductions, sources-sought responses) **only** under the Phase 9 guardrails: approved slot-fill templates
> only · canonical facts copied from the company record · recipient explicitly marked `verified: true` in the
> CRM · daily cap + per-recipient cooldown · every send logged in three places · kill switch honored on every
> decision · and only at the tier I have personally enabled (`AUTO_SEND_TIER`, default **0 = off**).
> **Everything else still requires my approval, and these NEVER auto-send at any tier:** proposals, bids,
> quotes, pricing, or any dollar commitment · anything committing Rodgate to scope, price, timeline, or a
> teaming/subcontract agreement · formal submissions to a contracting officer · any certification claim beyond
> self-certified SDB · anything to an unverified recipient · anything that spends money.
> **I send every proposal myself. That line never moves.**

---

## 2. `Jarvis - Architecture.md` → Prime Directive #2

**Current:** *"Gate every irreversible action (send/submit/publish/list/spend) until that workflow earns promotion."*
**Replace with:**

> **2. Gate every irreversible action *above the outreach tier*.** Send/submit/publish/list/spend stay gated by
> default. The **autonomy ladder** is the promotion mechanism this directive always referenced but never had:
> **Tier 0** (all gated) → **Tier 1** (sub-quote requests + follow-ups auto-send to verified contacts) →
> **Tier 2** (+ prime introductions) → **Tier 3** (+ sources-sought responses). A tier is earned by a clean
> record (~2 weeks / ~20 clean sends, zero corrections) and granted **only by Vinicio**. **Any bad send — wrong
> facts, wrong recipient, an injected instruction followed — demotes that class to review-first immediately and
> writes a Lessons Ledger entry. One strike = back to manual.** Proposals, pricing, and commitments are never
> on the ladder.
> **Also add to the gated list: creating or modifying a credential.** (2026-07-21 showed prose reminders —
> "never Jarvis" — are not a gate.)

---

## 3. `🏛 Gov Pipeline Board.md` → Rule of the board

**Add:**

> **Auto-sent outreach is logged by the agent in the same breath it sends** (three-place rule, L-003): the vault
> outreach log, this board, and the actual Sent folder. **No log = it didn't happen.** Every outreach row carries
> a marker: **🤖 auto** (an agent sent it under the Phase 9 guardrails) or **👤 sent** (Vinicio sent it). If a row
> has neither, treat it as *not sent* until proven otherwise — never assume.

---

## 4. `🧠 Lessons Ledger.md` → new entry

**Add:**

> **L-016 — The autonomy ladder (2026-07-27).** The standing rule "every external send needs approval" was
> changed, deliberately and narrowly: agents may auto-send low-stakes outreach (asking others for things) while
> **proposals, pricing, and commitments stay human-sent forever.** The reasoning: the outreach grind was the
> bottleneck, and asking a sub for a quote commits nothing — but a price or a certification claim leaving in
> Rodgate's name is irreversible.
> **What made it safe was building the guardrails BEFORE the capability**, in code rather than in prompts:
> tier gate (default OFF) · verified-recipient allowlist · hard-line content block · canonical-facts gate ·
> caps + cooldowns · kill switch · verified-send · three-place logging — **all failing closed.**
> **Wiring the guard to its own approved templates caught four real bugs that would otherwise have shipped:**
> "woman-owned" (the singular, more common spelling) slipped the false-certification filter · `UEI is <wrong>`
> slipped the canonical-facts gate · the allowlist read `email` while the CRM stores `contact_email`, so it
> would never have matched a real contact · and the pricing guard blocked "the quote request" (us *asking* for
> a quote), permanently disabling an approved template.
> **The lesson: a guard you haven't run your own real inputs through is a guess.** Test the safety net with the
> exact thing it's meant to catch, and with the exact thing it must let through.

---

## 5. CRM (`Contacts (CRM).md` / `pods/gov/subs.json`) → the allowlist field

**Add to the CRM's conventions:**

> **`verified: true|false` — the auto-send allowlist (L-009).** An agent may auto-send **only** to a contact
> explicitly marked `verified: true`. Default is unverified: a missing field, `false`, or any truthy-ish value
> like `"yes"` all count as **not verified**. **Only Vinicio sets this** — nothing in the system may mark a
> contact verified, because that would defeat the allowlist. Verifying means: *I know this is a real business,
> at a real address, that I'm willing to have contacted in Rodgate's name without me reading it first.*
> As of 2026-07-27: **20 real subs, none verified**; 6 temporary test contacts (`isTest: true`) are verified for
> end-to-end testing and are safe to delete.

---

## After applying these
- Set `AUTO_SEND_TIER=1` in the **NAS** `.env`, then `docker compose up -d --build control-plane scheduler telegram-bridge`.
- Watch the first days' digests. **Any bad send → `/kill` from Telegram, then demote.**
- Update `🖥 Machine Status`: component **"GovCon auto-outreach"** → Built / RUNNING, tier noted, verified timestamp.
