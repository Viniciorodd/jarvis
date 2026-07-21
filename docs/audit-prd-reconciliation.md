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
- ⚙️ **DONE (2026-07-20)** — **WS2 #8: board-first status reporting.** The two LLM status jobs
  (`morning-brief`, `weekly-reflection`) now carry a first-line directive: *"Read the Gov Pipeline Board
  and the deterministic KPI report BEFORE reporting status — the board outranks any email reconstruction;
  never call a sent/submitted item overdue."* Root cause of the original false-overdue (Mac Cowork jobs
  reconstructing from email) was already retired in the move to the control-plane scheduler; this closes
  the residual risk in the surviving LLM briefs. *(Activates on next NAS control-plane redeploy.)*
- 🧑 **OPEN (yours, 5-min)** — Fiverr Settings → Notifications → point order alerts at the mailbox Jarvis
  watches, so the order watch can actually fire.
- 🧑 **OPEN (yours)** — confirm the PC's duplicate Cowork scheduled tasks are deleted (avoid double runs).

## WS3 · Cost-efficient AI ops (the pay-per-use hedge)  — owner: ⚙️ Jarvis config
- ⚙️ **DONE** — Model tiering is real and eval-pinned: `pods/model-router.mjs` + `claudeCost` (Haiku =
  scan/triage, Sonnet = draft, Opus = price/audit/decide). Model IDs pinned in CLAUDE.md.
- ⚙️ **DONE (2026-07-20)** — the **AI-spend line** is now surfaced deterministically: `operatorKpis()` in
  `control-plane/reports.mjs` reports AI spend today / this week / this month, and it rides on every report's
  `text` via `kpiLine()`. *(Per-job hard token budgets remain a later refinement.)*
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
- ⚙️ **DONE (2026-07-20)** — **KPI panel** assembled deterministically (`operatorKpis`): sends this week ·
  drafts this week · replies awaiting you · AI spend (today/week/month) · revenue banked this week. Rendered
  as a one-line strip (`kpiLine`) on every report and eval-pinned (7 new cases, 620 green). *("Primes
  contacted" and "$/mo flowing" need the gov CRM + finance pod respectively — folded in as those mature.)*
- ✅ **WIRED (2026-07-20, operator OK'd)** — **post-loss debrief rule.** Core (`pods/gov/debrief.mjs`, 8
  evals) + wiring: marking a bid **lost** stages a courteous CO debrief-request **behind the normal approval
  gate** (`connector.stageLossDebrief` → `control-plane /maintenance/stage-debrief`, deduped on
  `gov.debrief.staged`; companion fires on the lost *transition* and resolves the CO email from SAM). The
  gate appears ONLY if the draft is sendable (real CO email); no email → a needs-contact task, never a blank
  gate. Nothing auto-sends — the operator's tap is the send. Activates on the NAS redeploy.
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
