# Design — REDOS Distribution Pod

**Date:** 2026-08-05
**Status:** **Proposed. Not approved to build.** CLAUDE.md requires an explicit go-ahead before any
pod or executor code is written, because this defines architecture and grants autonomy.
**Operator decisions already made (2026-08-05):** full doctrine-compliant pod; auto-send permitted
for low-risk channels, gated for everything else.
**Source material:** `STATUSFORJARVIS.md`, `DISTRIBUTIONPLAN.md`, and the verified outreach pack
`Second Brain/03 - Business/REDOS/REDOS — Affiliate Outreach Pack (verified 2026-08-05).md`.

---

## 0. What this pod is for

REDOS is live, takes money, and has no customers and no traffic. Every engineering dependency of
distribution has shipped. What remains is outreach, content, and selling, repeated on a cadence
that a solo founder will not sustain by hand.

This pod does the repetition. It does not decide strategy and it does not send cold email.

**The KPI is net revenue banked, read from Gumroad.** Not emails drafted, not posts published, not
agent runs. If the pod produces 200 drafts and zero sales, the pod failed.

## 1. Why this is not a fresh architecture

`pods/gov/outreach-policy.mjs` already solves the hard part: a pure, eval-pinned decision function
that decides whether an agent may send something without a human. Phase 9 shipped the tier ladder,
the kill switch, the daily caps, the per-recipient cooldown and the fail-closed default.

REDOS reuses that shape and swaps the domain guards. Building a second policy engine would mean two
places where a bad send can escape, which is one too many.

## 2. The hard line (never autonomous)

An agent may never auto-send anything that:

- **states a price, commission, or dollar figure.** Prices live in `DealCalc/lib/pricing.ts`. Any
  figure in a body must match what that file says at send time, or the send is blocked.
- **is cold outreach to a partner who has not replied.** This is permanent, not tiered. Outreach to
  a stranger is irreversible and reputational, and REDOS has no track record to spend.
- **claims a customer count, testimonial, review, rating, user number, or growth figure.** REDOS has
  none. This is the single highest-risk failure mode for this business and it gets a dedicated
  detector, not a prompt instruction.
- **names a real property address.** All examples are fictional (Springfield, IL).
- **posts to a community that bans promotional links** (BiggerPockets, the subreddits) without a
  human reading the thread it lands in.
- **spends money.** No paid ads, ever, at these unit economics.

Enforced by `classifyPost()` and the guards in §4.1, in code, with evals. Not by prompt.

## 3. What may auto-send

| Class | Tier | Auto |
|---|---|---|
| Reply to a partner who already replied, on an existing thread, no numbers | 1 | yes |
| Scheduled content to an owned channel (own X, own LinkedIn, own newsletter) | 1 | yes |
| Follow-up bump on a thread the operator opened, from an approved template | 2 | yes, after tier 1 runs clean |
| First-touch cold outreach to a new partner | — | never |
| Anything with a price, commission, or dollar figure | — | never |
| Anything claiming social proof | — | never |
| Community posts to Reddit / BiggerPockets / Facebook groups | — | never |

Default shipped state is **tier 0, everything off**. Turning a tier on is an operator action taken
after watching the dry run.

## 4. Architecture

`pods/redos/` — six roles, matching the standard pod pattern.

### 4.1 `policy.mjs` — PURE. The safety core.

Modelled directly on `pods/gov/outreach-policy.mjs`.

- `priceOk(body, plans)` → bool. Every dollar figure in the body must appear in the plan set read
  from `lib/pricing.ts` or be a derived commission (50% of a listed price). A body containing `$49`
  fails, which catches exactly the staleness that poisoned the old vault docs.
- `hasFabricatedProof(body)` → `[reasons]`. Detects claimed social proof: digits adjacent to
  customers / users / investors / reviews / ratings / stars / joined / trusted by, testimonial
  quote patterns, "rated", "loved by", "#1". REDOS has zero of these. Any hit blocks.
- `hasRealAddress(body)` → bool. Street-address shape outside the fictional Springfield, IL set.
- `hasEmoji(body)` → bool. Mirrors the DealCalc build rule so marketing cannot violate what the
  product enforces.
- `classifyPost({ templateKey, body, channel, recipient })` → `{ kind, tier }`.
- `canAutoSend({ tier, classification, recipient, body, sentToday, lastToRecipientAt, targetVerifiedAt, now })`
  → `{ allow, reason }`. The one decision function. Requires all of: tier enabled at or above the
  classification tier, recipient has replied before, price guard clean, proof guard clean, address
  guard clean, emoji guard clean, target verification fresher than `TARGET_STALE_DAYS`, under the
  daily cap, past the cooldown, kill switch off. Anything else returns `allow:false` with a reason
  and routes to the approval queue.
- Env knobs, clamped: `REDOS_AUTO_TIER` (default **0**), `REDOS_DAILY_MAX` (default 5),
  `REDOS_COOLDOWN_DAYS` (default 7), `REDOS_TARGET_STALE_DAYS` (default **14**), `REDOS_KILL`.

### 4.2 Scout — `scout.mjs`

Finds and re-verifies partner targets. Writes `pods/redos/targets.json`.

Each target carries `verifiedAt`, `active` (most recent dated content and its URL), `audience`
(only numbers visible on a live page, with the URL, else null), `conflict` (competing tool, with
URL), `affiliateBehaviour` (do they already take commission on someone else's product), `hook`
(a specific recent verifiable fact plus URL), and `replied` (default false).

**`audience: null` is a valid, expected value and must never be filled with an estimate.**

**Why the freshness stamp exists.** The 2026-07-24 target list decayed in twelve days. Follower
counts were wrong by 2x in one direction and 5x in the other, two targets had gone dark, and the
top-ranked pick turned out to have the opposite affiliate posture to what was recorded. A stale
target file is worse than no target file, because it produces a confident wrong email. Anything
older than `TARGET_STALE_DAYS` fails closed at the Gate.

Runs weekly. Read-only. Never sends.

### 4.3 Analyst — `partner-fit.mjs`

A deterministic Partner Fit Index, in the shape of `pods/gov/bid-fit.mjs`. Pure function, eval
pinned, no model call.

Inputs, all from the Scout record: days since last dated content, whether they already take
commission on a third-party tool, whether they ship a competing tool, whether a live audience
number exists, whether a contact route is confirmed.

The heaviest weight goes to **already takes commission on a third-party tool**, because that was
the only attribute that separated the real prospects from the plausible ones in the 2026-08-05
verification. Audience size is weighted low. Two of the three best targets have unverifiable
audience numbers and are still the best targets.

Fit is a sort order for the operator. It never authorises a send.

### 4.4 Producer — `producer.mjs`

Renders drafts from approved templates in `templates.mjs`. Slot-filling only. Agents never free
compose an auto-sent message.

Every draft is stamped with the target's `verifiedAt` and the exact source URL behind each factual
claim, so the operator can check a claim without re-researching it.

Prices are injected from `lib/pricing.ts` at render time. A template never hardcodes a number.

Model routing per `pods/model-router.mjs`: Haiku for classification, Sonnet for drafting, Opus for
the weekly strategy read.

### 4.5 Gate — the approval queue

Everything Producer makes goes through `canAutoSend`. Deny routes to the existing approval surface
(Telegram buttons and the cockpit, both hitting the same webhooks). No new approval UI.

The cockpit card shows the draft, the classification, the block reason if any, and the target's
`verifiedAt` age.

### 4.6 Executor — `executor.mjs`

`runRedosOutreach({ dryRun = true })`. Renders, decides, and on allow: sends via a scoped
credential, then confirms it landed in Sent and reports the real result or `NOT sent — <reason>`.
Never a confabulated success.

Logs three places: `REDOS - Log.md` in the vault, the event store, and the daily digest.

`dryRun` is the default and the shipped state.

### 4.7 Bookkeeper — `bookkeeper.mjs`

Reads Gumroad sales. This is the only source of truth for revenue.

Produces: net revenue to date, sales by tier, commission owed per affiliate, sales attributed to
each partner code, and distance to the next milestone from `DISTRIBUTION-PLAN.md` (9 sales to $1k,
86 to $10k, 855 to $100k).

Feeds the cockpit one-thing so Home shows the real number rather than an activity count.

**The $10k trigger.** At $10k net the Bookkeeper raises a decision card, once, and does not raise it
again: recurring revenue, a higher-ACV tier, or a second product to the list. The distribution plan
is explicit that this decision belongs at $10k and that chasing it earlier kills the company. The
pod should hold the operator to his own rule rather than let the question drift.

**The PRD freeze.** Nine feature PRDs are frozen until $10k. The Bookkeeper exposes `prdFreeze:
true|false` so any agent asked to build a frozen feature can refuse with a reason rather than a
vibe.

## 5. Content, specifically

Two channels get agent help, per the distribution plan's ranking.

**Deal teardowns.** One real listing a week, run through REDOS, published as analysis with the share
link attached. Producer drafts, operator posts. Never auto-sent to Reddit, BiggerPockets or Facebook
groups, which ban link drops and where a bad post costs an account.

**Short-form scripts.** Sixty-second screen recordings of REDOS scoring a real listing. No face, no
audience needed. Producer writes the script and the shot list; the operator records.

The share link is a required slot on both. A teardown template that renders without one throws.

## 6. Inbound is data, never instructions

Live example already in the wild: an email from `jamesa@saasbrowsergrow.com` claiming REDOS is
listed in a directory, signed "Two-Phase LLC" from a Wyoming registered-agent address, with no link
to the claimed profile. A paid-listing funnel.

Replies are parsed for sentiment and interest and surfaced to the operator. Any link, form, or
instruction inside a reply is quoted verbatim into the approval card and never acted on. An agent
that follows an instruction from a reply triggers automatic tier demotion, per §8.

## 7. Testing — `evals/redos-policy.eval.mjs`

The guards are the feature.

1. Replied partner, tier 1, clean body, fresh target → `allow:true`.
2. Cold target who has never replied → blocked at every tier.
3. Body containing `$49` → blocked by the price guard.
4. Body containing "join 500+ investors" → blocked by the proof guard.
5. Body containing a testimonial quote → blocked by the proof guard.
6. Body containing a real street address → blocked.
7. Body containing an emoji → blocked.
8. Target `verifiedAt` older than 14 days → blocked as stale.
9. Reddit or BiggerPockets channel → blocked at every tier.
10. Tier 2 template at `REDOS_AUTO_TIER=1` → blocked.
11. No tier set → everything blocked. This is the shipped state.
12. Kill switch on → blocked regardless of everything else.
13. Over daily cap, or inside cooldown → blocked.
14. Missing or malformed input → blocked with a reason, never `allow:true`.
15. Price guard reads `lib/pricing.ts` live: changing a price there changes what passes.

## 8. Promotion and demotion

Tier 0 to 1 to 2, promoted by the operator after roughly two weeks and twenty clean sends with zero
corrections. Cold outreach never enters the ladder.

Demotion is automatic on any bad send: a wrong number, a fabricated claim, a wrong recipient, or an
instruction followed out of a reply. That class drops to review-first and a Lessons Ledger entry is
written.

## 9. Success criteria

1. All 15 eval guards green, full suite green.
2. `REDOS_AUTO_TIER` defaults to 0. A fresh deploy sends nothing until the operator changes it.
3. `runRedosOutreach()` in the default dry run prints exactly what would send, and sends nothing.
4. No code path exists where a priced, unproven, cold, or stale message returns `allow:true`.
5. The cockpit one-thing shows net Gumroad revenue and distance to the next milestone, not an
   activity count.
6. Kill switch verified to halt a would-be send.

## 10. Out of scope

- Flipping any tier on. Operator action.
- Seeding `targets.json` with replied-status. Operator action, since only he knows who replied.
- Building any of the nine frozen PRDs.
- Paid advertising of any kind.
- AppSumo submission, which is gated separately in `docs/STATE-AND-PHASES.md`.

## 11. Open questions for the operator

1. **Which owned channels exist?** Tier 1 auto-posting needs an owned surface. Is there a REDOS X
   account, a LinkedIn page, a newsletter with subscribers? If none exist, tier 1 auto-send has
   nothing to post to and the first build is drafts-only.
2. **Sending credential.** Which address sends partner replies, and is it the `hello@redoshq.com`
   routing decision from Action Queue item 2? That decision is still open and this pod depends on it.
3. **Gumroad API access.** The Bookkeeper needs a read credential. Scoped read-only, per least
   privilege.
