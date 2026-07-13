# One Source of Truth — ending the "two Jarvises" drift

> Written 2026-07-12 in response to the July audit (`Second Brain/00 - System/📊 State of the Business —
> Audit & Evergreen PRD`). The audit's findings #5 and #8 are not two bugs — they are one architectural
> problem wearing two masks. This doc names it and gives the convergence path.

## The problem, stated plainly

There are **two Jarvises**, and they reconstruct reality from **different sources**:

- **Cowork-Jarvis** (Mac scheduled jobs + n8n on the NAS) — reads Gmail + the vault, writes vault notes,
  reasons about "what's the status" by *reconstructing* it from email threads.
- **Code-Jarvis** (this repo: `pods/`, `companion/`, `control-plane/` on the PC + NAS) — the control-plane
  event log (`control-plane/data/events.jsonl`) is its system of record; the Gov Pipeline board
  (`pods/gov/pipeline.mjs → govBoardData()`) derives every opportunity's stage from those events.

When two systems each believe they own the truth, they drift. The audit caught the drift live:

- **Finding #8 — false "overdue".** Gov Inbox Watch + Morning Brief reported the West Point unit rates
  "2 days overdue" *after* they were sent 7/10 and logged on the board. The watcher reconstructed state
  from the *absence of a reply email* instead of reading the board that already said "sent."
- **Finding #5 — "Southern Research Station queued with NO vault source."** A gate existed in the
  control-plane with no matching vault note — the three-place rule (vault ⊕ staged draft ⊕ board) broke
  because the two systems wrote to different places without a shared origin.

Both are the same failure: **a claim was made from a source that isn't the source of truth.** This is the
exact class of bug we fixed on the Telegram side 2026-07-12 (truthful narration: "sent" requires send
evidence, not the absence of a reply). The reporting layer needs the same discipline.

## The principle

> **The control-plane event log is the single system of record. Everything else — vault notes, Gmail
> drafts, the board, Telegram, HQ, the cockpit — is a PROJECTION of it, never an independent source.**

A status is never *inferred* from a side effect (a missing reply, a file on disk). A status is *read* from
the board, which is *derived* from events, which are *appended* when something actually happens. One origin,
many views. The "three-place rule" is not three copies to keep in sync by hand — it is **one event
materialized into three views**.

## Five rules that make it real

1. **The board outranks reconstruction.** Any reporter (Morning Brief, Gov Inbox Watch, EOD, Telegram
   narration) reads `/api/gov-board` (or the control-plane `/gov-board`) for status. It may use email to
   *discover new facts* (a CO replied) — but it emits that as an **event**, then reports from the board.
   It never says "overdue / done / sent" by reasoning about what email is or isn't present.
2. **Every state change is an event first.** Before a vault note is written or a Telegram message is sent,
   the fact is `POST /events` to the control-plane. Vault + Telegram + board all render *from* that event.
   No event → the fact does not exist → no claim may be made about it.
3. **Both Jarvises write to the same spine.** Cowork/Mac jobs `POST http://<nas>:8787/events` and read
   `/gov-board` over Tailscale — exactly as the code pods do. No status lives only on the Mac or only in a
   vault note. (Least-privilege still applies: the Mac jobs get a scoped token, not the vault keys.)
4. **Every scheduled job's prompt begins with the board-first line** (audit WS2.8):
   > "Read the 🏛 Gov Pipeline Board (`/api/gov-board`) BEFORE reporting any status — the board outranks
   > your email/vault reconstruction. If your reading disagrees with the board, emit an event to correct
   > the board; do not narrate the disagreement as fact."
5. **Provenance on every claim.** A status assertion carries the id of the event that justifies it (the
   same contract as `pods/narrate.mjs hasSendEvidence()`). No justifying event → the weaker claim, or
   silence. This is what makes the reporting layer trustworthy again.

## Migration — smallest steps first

**Now (this week, mostly Cowork-side + a little code-side):**
- Point **Gov Inbox Watch** and **Morning Brief** at `/api/gov-board` for status; let them use Gmail only
  to *detect new replies*, which they record as events (`kind:'gov.reply'`) rather than status guesses.
- Prepend the **board-first line** (rule 4) to every scheduled-job prompt — the Mac/n8n jobs and any
  code-side reporter. (Kills the finding-#8 class of false alarm immediately.)
- Enforce **no gate without a vault note + SAM verification** (fixes finding #5): the gov worker refuses
  to open a `submit` gate unless the three-place materialization exists.

**Next (the shared spine):**
- Every Cowork job that currently writes a vault note *also* (or *first*) posts the event to the
  control-plane. The vault note becomes a render of the event, not a parallel truth.
- Retire all email-reconstruction of status. Email is an input channel that produces events; it is never
  queried to answer "where does this opportunity stand."

**North star — one brain, many faces:**
- A single Jarvis reasoning core, fronted by many thin clients — Telegram, the cockpit, HQ, (later) Alexa,
  (maybe) Hermes/OpenClaw as local hands. Each client reads and writes the *same* control-plane. There is
  no "Cowork-Jarvis" vs "Code-Jarvis" — there is Jarvis, and there are surfaces.

## Why this is the highest-leverage architectural move

The audit's own F2 says the nervous system is dark and waits on one fix (the NAS redeploy). That's true for
*delivery*. But *trust* waits on this: as long as two systems narrate reality from two sources, every
false-overdue alarm erodes confidence in the whole reporting layer — and a report you can't trust is worse
than no report, because you have to re-verify it by hand, which is the manual toil the machine was built to
remove. Convergence is what lets you believe the 8am brief without checking it.
