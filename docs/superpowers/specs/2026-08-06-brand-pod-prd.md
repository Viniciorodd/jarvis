---
created: 2026-08-06
type: prd
tags: [jarvis, brand, automation, prd]
---

# PRD — the Brand pod: queue, approval, publishing, loop

**For Claude Code, working in `C:\Users\vinic\Documents\Projects\jarvis`.**

**Status: proposed. Not approved to build.** `CLAUDE.md` requires an explicit go-ahead before pod or
executor code, because this defines architecture and grants autonomy. Read this, do §1, then propose
before writing.

---

## 0. Your first job is to disagree with this document

This was written from Cowork with **partial reads** of the repo. Files were staged individually, not
explored. **You have the whole codebase. I did not.**

So the first deliverable is not code. It is a revision of this PRD against reality.

**Verify every one of these and correct me where I am wrong:**

| Assumption I made | Check |
|---|---|
| `pods/model-router.mjs` `llm({tier})` chains local → OpenRouter → Claude, and `LOCAL_FAST` is `hermes3:latest` | Read it. Confirm the tier names I use in §4 are real tier names, not invented ones. |
| Approvals already flow through Telegram buttons and cockpit buttons hitting the same n8n webhooks | Find the actual approval surface. **Reuse it. Do not build a second one.** |
| The cockpit is `companion/server.js` plus `companion/public/index.html`, and new surfaces belong there | Confirm where a new tab or panel actually goes. |
| `pods/gov/outreach-policy.mjs` is the right model for a policy core | You have both it and my `pods/brand/compliance.mjs`. If the gov one has guards mine lacks, port them. |
| Nothing in Jarvis already schedules or posts to social | Search for it. If `pods/browser.mjs`, `pods/openclaw.mjs` or `n8n/workflows/` already solve part of this, use that instead of my design. |
| `control-plane/schedule.json` is where recurring jobs are registered | Confirm the real mechanism. |
| A JSON or SQLite ledger is the right store | You know what the rest of Jarvis uses. Match it. Do not introduce a new persistence pattern for one pod. |

**Where this PRD conflicts with the doctrine in `docs/operating-doctrine.md`, the doctrine wins.**
Say so and change the design rather than following me.

---

## 1. What already exists

Built in Cowork on 2026-08-06 and committed. **107 evals green** via `node evals/run.mjs`.

| File | What it does |
|---|---|
| `pods/brand/compliance.mjs` | The never-publish guard. Blocks income claims, asset counts, follower and impression counts, transformation figures, real addresses, tenant references. Allows deal arithmetic and the honest zero. `complianceCheckRedos` escalates emoji to a block. |
| `pods/brand/features.mjs` | The writing eval harness. Deterministic feature extraction plus a fixed taxonomy. **`score()` ranks on buyer composition and returns null when composition is unknown.** |
| `pods/brand/platforms.mjs` | The publishing matrix. Per-platform caps, safe cadence, link handling, `assertRoute()` which throws on any non-API route, deterministic jitter. |
| `evals/brand.eval.mjs` | 30 cases across all three. |

Also in the vault, as context rather than code: `The Publishing Machine — design`, `The Machine —
modeling Rogoff`, `Personal Brand Engine`, and the v2 voice profile in `00 - System`.

---

## 2. What to build

### 2.1 The store — `pods/brand/store.mjs`

Persistence for drafts, approvals, published posts and outcomes. **Match whatever pattern the rest
of Jarvis uses.** Append-only where it can be.

A draft record needs: id, created, pillar, platform, body, source (which memo or log it came from),
the feature row from `features.mjs`, the compliance result, status, scheduled time, published time,
platform post id and url, and the outcome once metrics land.

Status values: `drafted` → `queued` → `approved` | `killed` → `scheduled` → `published` | `failed`.

**The claims log is separate and append-only.** Every published post: text, platform, timestamp, and
the compliance record that cleared it. Nothing ever mutates or deletes a row here. While the
$0-income filings stand, a published claim is a discoverable document and the record of what was
said and when is the point.

### 2.2 The producer — `pods/brand/producer.mjs`

Turns raw material into drafts. **Never publishes.**

Input: a voice memo transcript, a work log entry, a deal that was run, or a `/last-30-days` style
research brief.

Steps, with the brain for each in §4:

1. Draft in the **raw register**: dense, comma spliced, unpolished.
2. **Compress to the public register.** Median sentence at or under 10 words, capital letters, line
   breaks doing the punctuation work, zero em dashes. Drafting straight into public produces
   something generic; the compression step is what makes it his.
3. Run `features.extract()` and `voiceDrift()`. **Regenerate on drift rather than shipping it.**
4. Run `complianceCheck()`. On a block, do not queue. Attach the reason and surface it.
5. Adapt per platform via `platforms.checkPost()`.

Read the voice profile at `<VAULT>/00 - System/✍️ Writing Voice — how Vinicio writes.md` for the
register rules, and `examples/` for reference posts. **Do not describe his voice to the model. Give
it his actual sentences.**

### 2.3 The Sunday batch — `pods/brand/approval.mjs`

**Seven drafts, once a week, over Telegram.** This is the only recurring human touchpoint.

Sunday morning: select the top seven queued drafts, send one Telegram message per draft with
platform, pillar, body, compliance line, and Approve or Kill. Approved drafts get scheduled across
the week using `platforms.jitter()`, respecting `safeDaily` and `safeWeekly`.

**Reuse the existing approval webhooks.** Same buttons, same plumbing as gov approvals.

If fewer than seven clear the guards, send what there is and say how many were blocked and why. Do
not pad.

### 2.4 The adapters — `pods/brand/publish/*.mjs`

One per platform, all behind the same interface: `publish({body, replyLink}) → {ok, id, url, error}`.

**Every adapter calls `assertRoute(platform, 'api')` first.** It throws on anything else. No
Playwright, no headless browser, no unofficial wrapper. LinkedIn's user agreement prohibits
automated access and it restricts accounts for it; his LinkedIn is his distribution.

Build order: **`bluesky.mjs` and `mastodon.mjs` first.** Free, no app registration, no review, done
in a day, and they give the pipeline somewhere real to publish while the LinkedIn and Threads apps
are pending. Then `linkedin.mjs`, then `threads.mjs`, then `x.mjs` last.

**Verified constraints as of 2026-08-06:**

- **X is no longer free.** Free tier discontinued for new signups 2026-02-06. Pay-per-use at $0.015
  a post, **$0.200 with a URL**. `platforms.mjs` already strips links to a reply. Do not undo that.
- **LinkedIn personal profile only.** `w_member_social` via the self-serve Share on LinkedIn product,
  free, 150 calls a day. Company Page posting needs the Community Management API, which excludes
  solo developers. Do not build a Page path.
- **Threads skips App Review** if he is added as a tester under App Roles.
- **Tokens expire at 60 days on LinkedIn and Threads.** A refresh job is required and its failure
  must alert. A silently expired token is how these systems die.

Least privilege: one scoped credential per platform, in env or the vault, never in code.

### 2.5 Metrics and the loop — `pods/brand/loop.mjs`

Fetch outcomes, attach with `features.withOutcome()`, classify who engaged, then rewrite the strategy.

**The strategy rewrite scores on buyer composition, not reach.** This is the one place the design
deliberately departs from the source material it was modelled on. Rogoff's own audience dashboard
found his highest-reach posts pulled in competitors and peers while the posts that drew buyers
looked different, and his loop still optimises for reach. `features.score()` already refuses to
score a post whose composition is unknown. Keep that.

**Seed before the first analysis.** There are 897 published X posts in the vault. Run
`features.extract()` over all of them so the first strategy rewrite has a baseline. Without seeding
the first run learns from nothing, which is exactly what happened to Rogoff on camera.

Cadence: two or three times a week, not weekly.

### 2.6 The cockpit — three surfaces

In the existing companion, not a new app.

**Queue.** Drafted, approved, scheduled, with times.
**Performance.** The features table joined to outcomes, ranked by buyer composition.
**Direction.** The current strategy file, when it was last rewritten, and what changed, in a
sentence. If the loop concluded pain hooks beat contrarian ones, that should be readable, not buried.

### 2.7 Telegram — exactly three messages

1. **Sunday**, the seven-draft approval batch.
2. **Monday**, one performance line.
3. **Any time**, a failure alert: publish failed, token expired, guard blocked everything.

Nothing else. Notification fatigue is how a system gets muted and then abandoned.

---

## 3. Hard rules, enforced in code and not in prompts

1. **Nothing publishes without an approval.** Rogoff autopublishes on a cron and declined the
   approval step when Claude offered it. That is reasonable with no legal exposure. It is not the
   call here.
2. **No browser automation to any platform.** `assertRoute` throws.
3. **No post reaches the queue without passing `complianceCheck`.**
4. **No post reaches the queue with voice drift.** Regenerate.
5. **Append-only claims log.** Never mutate, never delete.
6. **Failure is loud.** A silent token expiry is worse than a crash.
7. **No fabricated engagement.** If metrics could not be fetched, the field is null. Never zero.

---

## 4. Model routing, and the point of the whole thing

He wants free brains doing the work, Claude reserved for validation and hard tasks. `model-router.mjs`
already implements the chain, so this is a routing table rather than a build.

| Step | Brain |
|---|---|
| Fetch, parse, dedupe, schedule | **No model.** Plain code. |
| Feature extraction, compliance, voice drift | **No model.** Deterministic, eval-pinned. |
| Classify hook type, angle, pillar | **Local, Hermes.** Fixed taxonomy, short input, high volume. |
| Classify a commenter as buyer or peer | **Local, Hermes.** Hundreds of short classifications; the single largest avoidable bill in the system. |
| Draft the raw register | **Local smart.** |
| **Compress raw to public** | **Claude.** The step that decides whether it sounds like him. |
| **Weekly strategy rewrite** | **Claude.** Runs 52 times a year and governs everything downstream. |

**Verify the real tier names** in `model-router.mjs` before wiring. I inferred these from a partial
read.

---

## 5. Success criteria

1. `node evals/run.mjs` fully green, including new cases for the store, the batch and each adapter.
2. A dry run prints exactly what would publish and publishes nothing.
3. No code path reaches a platform without a passed compliance check and an approval.
4. `assertRoute` refuses every non-API route, proven by a test.
5. The Sunday batch renders in Telegram and both buttons work end to end.
6. A forced token expiry produces an alert, not silence.
7. The cockpit shows the queue, buyer-ranked performance, and the current strategy.
8. The claims log has one row per published post and no code can update or delete one.

---

## 6. Out of scope

Instagram and Facebook until the other five run unattended for a month. Postiz or any scheduler
platform, considered and rejected: it ships no provider credentials, so the same apps get registered
either way, and it adds Postgres, Redis and a 90-request-per-hour cap. Autopublishing without
approval. Any paid SaaS. LinkedIn Company Pages.

---

## 7. Open questions for the operator

1. **Handles and accounts.** Still not reserved per the Open Register. Blocks every adapter.
2. **Which Mastodon instance**, if any.
3. **Is the $0.45 a month for X worth it**, or does X wait.
4. **How hard is the litigation line.** `compliance.mjs` is written to the strictest reading. If the
   attorney has drawn it somewhere specific, encode that instead of guessing conservatively.
