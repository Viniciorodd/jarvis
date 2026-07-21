# Audit & Evergreen PRD — reconciliation (what we're doing about the strategy docs)

**Purpose.** You shared several strategy/planning docs from your vault (the 7/12 *State of the Business
— Full Audit & Evergreen PRD* with its six workstreams WS1–WS6, plus the 7/5 and 7/9 Claude-Code
alignment prompts). This file maps every actionable item to its real status in the **code** —
DONE / PARTIAL / OPEN — and marks who owns it (⚙️ = engineering/Jarvis, 🧑 = your hands: money,
credentials, life-ops). It is the living answer to "what are we doing regarding all of that?"

> Update cadence (per WS6): reviewed at each session that touches a workstream; dated log at the bottom.
> Status as of **2026-07-20**. Where a claim isn't fully verified in this pass it's marked *(verify)*.

---

## WS1 · Revenue throughput  — owner: 🧑 you (taps) + gov pods (drafts)
The bottleneck is now volume-through-the-gate, not fear. This is mostly **your** execution; Jarvis's
job is to keep drafts staged and nothing missed.
- ⚙️ **DONE** — Gov Pipeline Board is the single source of truth (`pods/gov/pipeline.mjs` → `/api/gov-board`);
  "your next gov move" is derived live and shared with the cockpit Home glance.
- ⚙️ **DONE** — Deadline radar scheduled job (`deadline-radar`) pushes final-stage reminders so nothing
  silently lapses.
- ⚙️ **DONE (new 2026-07-20)** — Subcontractor bench + backup ladder on `/govcon`, with reach-out drafts
  staged behind the gate (never auto-sent). Coverage% + price-to-win now show **on the board cards**.
- 🧑 **OPEN (yours)** — the weekly quota (3 SS responses + 5 prime/SBLO outreach + every reply <24h),
  locking the labor bench, W Ridge, Konzel/USACE/Control Towers. Jarvis stages; you send.

## WS2 · Automation completion  — owner: ⚙️ Jarvis (control-plane + scheduler + telegram-bridge)
The nervous system that was "dark" (NAS/Tailscale) is now **live**.
- ⚙️ **DONE** — NAS runs control-plane + scheduler + telegram-bridge in Docker; reached privately over
  Tailscale; redeploy path documented (robocopy → `docker compose up -d --build`).
- ⚙️ **DONE** — Approval gate loop: any send/submit/publish/spend pauses for a human tap (Telegram
  buttons + HQ buttons hit the same webhooks). Gate-dedup done; unsendable drafts are pruned before they
  can reach a gate (`prune-unsendable-gates` job + `pods/gov/draft-check.mjs`).
- ⚙️ **DONE** — Two-way Telegram (free-text + "show my pending" reads the real draft store; router is
  retrieval-aware).
- ⚙️ **OPEN** — **WS2 #8: every status-reporting scheduled job must read the Pipeline Board BEFORE
  reporting**, to kill the "false-overdue" class (a job reconstructing state from email reported an
  already-sent item as overdue). Candidates: `morning-brief`, `deadline-radar`, `gov-growth-digest`.
  *(This is the clearest open ⚙️ item; needs a prompt line + NAS redeploy — see "Next" below.)*
- 🧑 **OPEN (yours, 5-min)** — Fiverr Settings → Notifications → point order alerts at the mailbox Jarvis
  watches, so the order watch can actually fire.
- 🧑 **OPEN (yours)** — confirm the PC's duplicate Cowork scheduled tasks are deleted (avoid double runs).

## WS3 · Cost-efficient AI ops (the pay-per-use hedge)  — owner: ⚙️ Jarvis config
- ⚙️ **DONE** — Model tiering is real and eval-pinned: `pods/model-router.mjs` + `claudeCost` (Haiku =
  scan/triage, Sonnet = draft, Opus = price/audit/decide). Model IDs pinned in CLAUDE.md.
- ⚙️ **PARTIAL** — per-job token budgets + a monthly "AI spend" line aren't surfaced yet. *(candidate build)*
- ⚙️ **ongoing principle** — "the vault IS the cost control": every SOP/template written downgrades the
  model needed to run it. Keep writing specs (we do — `docs/superpowers/specs/`).

## WS4 · Idle engines  — owner: 🧑 you (90-min money blocks)
Almost entirely **your** hands — Jarvis can draft/track but not photograph a unit or post Marketplace ads.
- 🧑 **OPEN** — 218 W Ridge photos → agent (biggest single lever, ~+$2,500/mo); Fiverr gig optimization
  (expansion stays HELD); Edward/Edgard site finish; brother crew (verify it operates locally — L-009 honesty).
- ⚙️ **can help** — Jarvis can stage listing copy, gig titles/tags, and track each engine's status so none
  silently sits at $0. Say the word and I'll draft any of these.

## WS5 · Life ops  — owner: 🧑 you + scheduled nudges
- 🧑 **OPEN (yours)** — Ana threads (NIH follow-up overdue), Selia sessions, insurance decision, health floor.
- 🧑 **OPEN (yours) — money loose ends the audit flagged:** confirm the SBA EIDL payment posted; pick the
  Chase payment plan (3 options, undecided). *(Tax & Wealth pod / debt desk can track once you tell it which.)*
- 🧑 **SECURITY (yours, overdue)** — rotate the exposed key(s) and move any `env.txt`/secrets out of the
  synced vault. Jarvis must never handle these — this stays your hands by rule.

## WS6 · Governance (the evergreen loop itself)  — owner: ⚙️ Weekly reflection + this file
- ⚙️ **DONE** — `weekly-reflection` scheduled job (the Sunday synthesis) + `eod-log` exist.
- ⚙️ **DONE** — Lessons ledger + canonical-facts guard (catches drift; the L-005…L-009 class of error).
- ⚙️ **PARTIAL** — KPI panel in the morning brief (sends this week · primes contacted · replies pending ·
  $/mo · AI spend) is not fully assembled. *(candidate build)*
- ⚙️ **OPEN** — **post-loss debrief rule** (every lost bid → an agent-drafted debrief request to the CO,
  staged like any other send). Not built yet. *(candidate build)*
- ⚙️ **DONE (this file)** — the audit/PRD now has a home in the repo, not just the vault.

---

## The two older Claude-Code prompts (7/5 align + 7/9 revive-NAS/Phase-3) — mostly delivered
Both were about getting off a dark NAS and standing up the approval/outbox/telegram loop. That
infrastructure is now live (see WS2). What remains from them collapses into the WS2/WS6 OPEN items
above — there's nothing separate still owed.

---

## What I recommend we DO next (the OPEN ⚙️ items I can apply)
1. **WS2 #8 — board-first status reporting** (kills false-overdue). Add one line to the status-reporting
   job prompts. Needs a NAS redeploy.
2. **WS6 — post-loss debrief rule**: when a bid closes as lost, stage a CO-debrief draft behind the gate.
3. **WS6 / WS3 — KPI + AI-spend panel** on the morning brief / Home glance.

None of these move money, change architecture, or touch credentials, so I can build them on your go-ahead.
The 🧑 items stay yours by design (and by rule, for anything touching money or secrets).

*Update log: 2026-07-20 · initial reconciliation written from the shared audit/PRD + alignment prompts.*
