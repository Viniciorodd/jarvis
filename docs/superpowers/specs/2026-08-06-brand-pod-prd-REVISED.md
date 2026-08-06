---
created: 2026-08-06
type: prd-revision
tags: [jarvis, brand, automation, prd]
---

# Revision of the Brand pod PRD, checked against the repo

**This is §0 of the PRD executed: the disagreement pass.** Nothing has been built. No pod or executor
code is written. Read §A first — one item there is time-sensitive and has nothing to do with the design.

Source: `2026-08-06-brand-pod-prd.md`. Everything below was verified by reading the files, not inferred.

---

## A. 🔴 The finding that outranks the whole document

**`pods/brand/`, `pods/redos/` and all three eval files are UNTRACKED. Nothing was committed.**

```
?? pods/brand/          compliance.mjs · features.mjs · platforms.mjs
?? pods/redos/          9 modules + targets.json
?? evals/brand.eval.mjs · redos-fit.eval.mjs · redos-policy.eval.mjs
```

The PRD §1 says *"Built in Cowork on 2026-08-06 and committed"* and the session log repeats it. They
are not in git. Two days of work — 107 evals — currently exists only as working-tree files. A
`git clean -fd`, a bad merge, or a stash gone wrong loses all of it.

I have been committing to this repo all session on explicit paths, so I have repeatedly committed
*around* these files without pulling them in. That was correct — they are not my work to commit — but
it means they have survived on luck, not on anything structural.

**This wants doing before any design conversation.** It is not my call to commit someone else's
uncommitted work, so say the word and I will, or run it yourself.

**The 107 figure is correct** — 42 brand + 65 redos = 107, all green inside the full suite (1,446).
One nit: §1 describes `brand.eval.mjs` as "30 cases"; it reports 42.

---

## B. Assumptions, checked

| # | Your assumption | Verdict |
|---|---|---|
| 1 | `llm({tier})` chains local → OpenRouter → Claude; `LOCAL_FAST` is `hermes3:latest` | **Half right.** Chain and `hermes3:latest` confirmed. **The tier names in §4 are invented.** |
| 2 | Approvals flow through Telegram + cockpit buttons hitting the same **n8n webhooks** | **Wrong mechanism.** It is the control-plane, not n8n. |
| 3 | Cockpit is `companion/server.js` + `public/index.html` | **Correct.** |
| 4 | `pods/gov/outreach-policy.mjs` is the right model for a policy core | **Correct, and it has guards yours lacks — including one that is a safety gap.** |
| 5 | Nothing in Jarvis already schedules or posts to social | **Partly wrong.** `pods/browser.mjs` exists and is Playwright. |
| 6 | `control-plane/schedule.json` registers recurring jobs | **Correct.** 15 jobs, and `tier` is already a field. |
| 7 | A JSON or SQLite ledger is right | **JSONL. There is no SQLite anywhere in the repo.** |

### B1. The real tier names

`pods/model-router.mjs` has exactly three: **`cheap`, `draft`, `reflect`**. `TIERS_BIG = {draft, reflect}`.
Provider is a **separate axis** — `llm({ tier, provider, privacy, prefer })` — so "local Hermes" is not
a tier, it is `tier` + `provider:'local'`.

Your §4 table, rewritten against the real API:

| Step | PRD said | Actual call | Resolves to |
|---|---|---|---|
| Classify hook / pillar / commenter | "Local, Hermes" | `llm({ tier:'cheap', provider:'local' })` | `hermes3:latest` (`LOCAL_FAST`) |
| Draft the raw register | "Local smart" | `llm({ tier:'draft', provider:'local' })` | `qwen3.6` (`LOCAL_SMART`) |
| Compress raw → public | "Claude" | `llm({ tier:'draft' })` | `claude-sonnet-5` via the chain |
| Weekly strategy rewrite | "Claude" | `llm({ tier:'reflect' })` | `claude-opus-4-8`, adaptive thinking |

Note the trap: `provider:'local'` **pins** to local, so a dead Ollama fails rather than silently
escalating to a paid model. For the two high-volume classification steps that is what you want — the
commenter classifier is the one job where an accidental Claude fallback is the whole avoidable bill.

### B2. The approval surface is the control-plane, not n8n

`control-plane/server.js:10` — `POST /approvals/:id {decision}`, described in its own header as
**"the one gate all UIs share"**. The companion proxies to `${CP_URL}/approvals/${id}`; Telegram hits
the same. `n8n/workflows/05-approval-executor.json` exists but is not the live gate.

**So the Sunday batch does not build an approval path at all.** It emits `approval.request` events and
the existing surfaces already render them — `pods/narrate.mjs` and `pods/catchup.mjs` both key on that
kind. Building a second one would be the mistake §0 warned about, aimed at the wrong target.

### B3. 🚨 The safety gap: the kill switch does not reach the brand pod

This is the one place the PRD is not just imprecise but **unsafe as specified**.

`pods/gov/outreach-policy.mjs` carries guards `pods/brand/compliance.mjs` has none of:

- **`killSwitchOn()` / `KILL_FILE`** → `control-plane/auto-send.json`. This is what Telegram `/kill`
  writes. As specified, **`/kill` would halt gov outreach and the brand pod would keep publishing.**
- `tierFromFile()` — the autonomy ladder.
- Control Center integration (the `control` argument in `canAutoSend`) — per-agent on/off and tier.
- Rate limiting (`sentToday`, `lastToRecipientAt`) and `verifiedRecipient()`.

`compliance.mjs` is a **content** guard. It is good at that and I would not change it. But content
clearance is not send authority, and the PRD merges the two. The brand pod needs a second module —
call it `pods/brand/policy.mjs`, mirroring `pods/redos/policy.mjs` — that answers *may this go out at
all*, honouring the same kill file and the same Control Center roster.

**Doctrine §2 (gate every irreversible action) and the standing kill switch both point the same way:
one halt must stop everything, or it is not a halt.**

### B4. Browser automation already exists, and its guard is stronger than yours

`pods/browser.mjs` is Playwright. But it never submits: `FORBIDDEN_CLICK` blocks submit/send/pay/buy/
checkout, it refuses credential and payment fields, and it treats page content as untrusted data.
It stages for approval.

This does **not** conflict with `assertRoute` for publishing — keep that exactly as written. But
"nothing exists" is wrong, and there is an opportunity: **read-only** research (ICP language harvesting
from BiggerPockets and r/realestateinvesting, which both Rogoff notes call the step everyone skips)
can use `browser.mjs` today, with its existing guards, rather than a new dependency.

### B5. Persistence: JSONL, append-only, one file per year

Confirmed in use: `actions/2026.jsonl`, `focus/<year>.jsonl`, `tax-ledger/<year>.jsonl`,
`audit-log/failures.jsonl`. **No SQLite, no `.db`.** `compliance.mjs` already declares
`CLAIM_LOG = 'claims-log.jsonl'`, which is consistent — good instinct, keep it.

So `store.mjs` is JSONL. The status machine you specified (`drafted → queued → approved|killed →
scheduled → published|failed`) needs care in an append-only file: **append transitions, derive current
state by folding**, exactly as `pods/tax/` resolves its ledger. Do not rewrite rows.

### B6. The redos executor is the contract the adapters should copy

`pods/redos/executor.mjs` is a better spec than PRD §2.4, and it already exists:

- **dry-run by default, and dry-run is the shipped state**
- **holds no credential — the caller injects the `send` adapter**, so a misconfigured deploy sends
  nothing rather than sending wrongly
- **verified send**: confirm it landed or report `NOT sent — <reason>`; an adapter that cannot confirm
  is a failure, never a success with a missing receipt
- anything the policy denies goes to the approval queue — "at tier 0 that is every message, by design"

Adopt this verbatim for `publish/*.mjs`. It also answers a hole in the PRD: your interface returns
`{ok, id, url, error}` but never says what happens when a platform accepts and then silently drops the
post. Under the redos contract, unconfirmed is failure.

---

## C. Two design disagreements

### C1. Three new cockpit surfaces is the wrong shape

§2.6 asks for Queue, Performance and Direction as three surfaces. **Hours ago he told me the opposite,
about work I had just shipped:**

> *"you created a new tab for log, but just have it in the Personal tab… i honestly didnt need a new
> log section, i didn't know we had a fully functional one. just merge both."*

And earlier: *"it's just so many different tabs. It should be LESS tabs, more focused work."*

Three brand tabs would repeat that exactly. **Recommend one surface** with the queue as the front
(it is the only one he acts on), performance and direction as sections inside it. The Sunday batch is
the real interface anyway; the cockpit is where he checks the machine's reasoning, which is a monthly
act, not a daily one.

### C2. The build order buries the $6 question

PRD §2 builds `store.mjs` first. **Both vault notes independently say the audience classifier comes
first**, and say it more forcefully than the PRD does:

> *"The question worth six dollars is: is anyone currently following me someone who would ever buy
> this? … That is the cheapest high-stakes answer available and it comes before the content calendar,
> not after."*

The session log agrees, calling it "the question that should come before all of it." Yet in the PRD
the commenter classifier is item 6 of 8 in the next-build list.

If his 897 posts pull founders and AI accounts rather than agents and investors, three weeks of
content lands in the wrong room and **no part of this pod fixes that.** Six dollars and one Hermes
run reorders everything downstream.

**Recommend: classifier first, over the existing 897 posts, before any adapter.** It needs no
handles, no app registration, and none of the four blocked items in the session log — so it is also
the only piece that can start today.

---

## C3. Addendum — the input files, checked (and a correction to my own §D)

Checked after the first pass, against the vault.

**The voice profile path in §2.2 is CORRECT.** `<VAULT>/00 - System/✍️ Writing Voice — how Vinicio
writes.md` exists. `REDOS — How Vinicio Writes.md` is a tombstone that redirects to it. I expected a
path error here and there is not one.

**`examples/` does NOT exist.** §2.2 tells the producer to read it "for reference posts" and to give
the model his actual sentences rather than a description of his voice. There is no such directory
anywhere in the vault. As written, the producer would silently fall back to describing his voice —
the exact failure §2.2 warns against, caused by the PRD's own missing prerequisite.

**But it is now cheap to build, because of what the archive turned out to contain.**

**🔍 The X archive carries engagement counts.** `06 - Journals/Transcribed (…)/X Archive (own
posts).md` — 897 posts, 150 KB — stores every post as:

```
**2018-10-24** · ❤️ 3 🔁 1
> 2 minutes of my life I'll never get back.
```

Likes and retweets, per post, already in the vault. Two consequences:

1. **The features table gets a real outcome column on day one.** The Rogoff teardown says "the outcome
   half attaches the day you start posting again" — that is too pessimistic. Rank by engagement now,
   and `examples/` can be generated from the top performers automatically, which is the manual step
   Rogoff did by hand and the note calls his hardest.
2. **⚠ Correction to my §D item 1.** I said the audience classifier can run "over the existing 897
   posts" with nothing blocking it. **That is wrong and I should have opened the file before writing
   it.** The archive holds his posts and their counts — it does not hold a single commenter. The $6
   question is *who replies*, and those people are not in the vault. That item needs an Apify scrape
   or an X export, exactly as both notes budget for.

So the split is sharper than I had it:

| Piece | Status |
|---|---|
| Features table over 897 posts, with real engagement attached | **unblocked, today** |
| `examples/` generated from top performers | **unblocked, today** |
| Audience classifier — who actually replies | **blocked on ~$6 of Apify credits or an export** |

The classifier is still the highest-value question. It is just not free, and I implied it was.

**Rogoff Stage 1 files are all missing**: no `audience-info.md`, no `evidence.md`, no ICP language
library. "The Machine" note calls these the foundation — *"Nothing works without them"* — and puts
them at build order #1. The PRD never mentions them. `evidence.md` matters most here: it is the
non-financial credibility file (years licensed, deals analysed as a count never a value, published
methodology, corrections issued) that a post reaches for when it needs proof. Without it the producer
has nothing legitimate to cite, and reaching for proof is precisely where an unwritten guard gets
tested.

---

## D. What I would build, revised

| # | Thing | Depends on | Blocked? |
|---|---|---|---|
| 0 | Commit the existing pods | nothing | **no — do this first** |
| 1a | Features table over the 897 posts, real engagement attached | nothing | no |
| 1b | Generate `examples/` from the top performers | 1a | no |
| 1c | `evidence.md` + `audience-info.md` + ICP library (Rogoff Stage 1) | you | **needs your input** |
| 1d | Audience classifier — *who replies* (`tier:'cheap', provider:'local'`) | commenter data | **~$6 Apify or an export** |
| 2 | `pods/brand/policy.mjs` — kill switch + Control Center + tiers | outreach-policy as the model | no |
| 3 | `store.mjs` — JSONL, append-only, fold-to-derive | — | no |
| 4 | Fold the seeded features into the store | 1a, 3 | no |
| 5 | `producer.mjs` — raw → compress → guards | 2, 3 | no |
| 6 | Sunday batch, emitting `approval.request` | 3, 5 | no |
| 7 | `bluesky.mjs` + `mastodon.mjs`, injected client, dry-run default | 2, 6 | **handles** |
| 8 | `loop.mjs`, scored on buyer composition | 1d, 4 | **needs 1d** |
| 9 | One cockpit surface | 3 | no |
| 10 | `linkedin.mjs` → `threads.mjs` → `x.mjs` last, + the 60-day refresh job | 7 | **app registration** |

Items 0, 1a, 1b, 2, 3, 4, 5, 6 and 9 are unblocked and can start today. The session log lists four
things blocked on you; **none of them block those nine steps**, which is worth knowing before another
week passes waiting on handles.

The two that do need you are small and unrelated to handles: **~$6 of Apify credits** (or an X
export) for the commenter data, and **`evidence.md`** — the non-financial credibility file, which
only you can populate.

---

## E. Your §7 questions, answered where the repo can answer them

1. **Handles** — genuinely blocking, but only from item 7. Not a reason to wait.
2. **Which Mastodon instance** — no repo opinion. `platforms.mjs` is instance-agnostic; any instance
   with the standard API works.
3. **Is $0.45/mo for X worth it** — `platforms.mjs` already strips links to a reply, which is the
   difference between $0.015 and $0.200 a post. At 3 posts a week that is ~$0.20/mo. The cost is not
   the question; X being last in the order already handles it.
4. **How hard the litigation line is** — still yours. `compliance.mjs` is written to the strictest
   reading and I would not loosen it on inference. If the attorney has drawn a specific line, encode
   that; otherwise strict stands.

**One more for the list, from §B3:** should the brand pod share the gov kill switch (`/kill` halts
everything, my recommendation) or carry its own? Sharing means one command stops all outbound
activity; separate means a gov emergency does not silence your brand. I recommend shared, because a
halt you have to remember to issue twice is not a halt.

---

## F. What I have NOT done

No pod code, no executor, no adapters, no schedule entries, no commits to `pods/brand/`. Per
`CLAUDE.md`, this defines architecture and grants autonomy, so it waits for an explicit go-ahead.

**Nothing in this revision has been built. Confirm the order in §D and the kill-switch question in §E,
and I will start at item 0.**
