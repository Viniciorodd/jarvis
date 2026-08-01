# Survey — what the open-source personal-assistant world has that we don't (2026-08-01)

Requested by the operator: *"There's so many people that are generating and creating their own driver sets
for their own personal lives and business, so I want to make sure that we also are leveraging their
knowledge, their findings, their builds so that we can build on top of us."*

This is §4 of `PRD — Jarvis Desktop Presence`: *"do it, but properly."* Rules from his own
[Repo Security Audit SOP](https://github.com) apply: **borrow patterns freely, import code carefully.**
Nothing here is installed. Most of the value is the idea list, not the code.
⚠️ Licenses matter — AGPL/GPL copyleft can infect a commercial product. Check before adopting anything.

---

## The headline finding: we independently built the same blueprint

The most-starred personal agent (OpenClaw, 100k★ in early 2026) is described as
*"local gateway + agentic loop + skills + persistent memory."* That is **exactly what Jarvis is**:

| Their blueprint | Ours |
|---|---|
| Local gateway / model router | `pods/gateway/` — free-tier router, size-aware, honest failover |
| Agentic loop | `converse()` in `companion/server.js` |
| Persistent memory, **local-first Markdown** | The Obsidian vault + `pods/vault-search.mjs` |
| Platform adapters | `companion/telegram-bridge.mjs` |
| Skills | our tool list |

Their memory layer is *Markdown files and daily logs* — the same bet he made with the Second Brain, years of
notes already in it. **We are not behind; we are convergent.** That reframes this survey: we are looking for
specific missing capabilities, not a rebuild.

---

## Genuinely missing — ranked by value to HIM

### 1. Skills as data, not code ⭐ highest leverage
They have **200+ community skills** because a skill is a folder with a manifest, not an edit to the server.
Ours are hardcoded in `companion/server.js` (~45 tools in one file, now >4,000 lines). Every new capability
means editing the core.
**Borrow the pattern, write it ourselves:** a `skills/` folder, one file per capability, discovered at boot.
Same shape as `evals/*.eval.mjs` auto-discovery, which already works well here.
*Cost: a day. Payoff: capability stops competing with core stability.*

### 2. Memory with activation + decay
One project runs a 12-layer memory architecture — knowledge graph, semantic search, **activation/decay** so
old facts fade and relevant ones surface. Ours is keyword search over 6,115 notes: excellent for "find X",
useless for "what should I remember right now."
**Worth borrowing:** decay scoring, so a note touched last week outranks one from 2023 at equal keyword match.
*This is the difference between a search box and a memory.*

### 3. More channels than Telegram
They ship WhatsApp, Discord, Signal, iMessage, Matrix adapters. We have Telegram + the web app.
**Honest assessment: LOW value for him.** He lives in Telegram; adding channels is surface area, not power —
and it argues *against* his own "fewer surfaces" instinct. **Recommend skipping.**

### 4. Agents that rebuild themselves from files on boot
Declarative agent definitions rather than a hardcoded `ROSTER` array. Would pair well with the Control
Center: an agent's tier, reading list, and prompt in one file per agent.
*Medium value — mostly a maintainability win.*

### 5. Self-improving / compounding loops
Hermes Agent markets "an agent that compounds over time." In practice this is: log outcomes → feed them back
into the next run. **We already have the substrate** — the timeline, the eval suite, `pods/gov/win-rate.mjs`.
What's missing is the loop that reads its own history before acting.

---

## What we have that they mostly don't

Worth writing down so we don't trade it away chasing features:

- **Deterministic gates at the point of action** — `canAutoSend`, `canAgentAct`, `canLook`. Most projects
  gate with prompts. Ours are code, fail closed, and are eval-pinned.
- **1,058 evals.** Almost nothing in this space has a regression suite; that's why they break on upgrades.
- **Verified actions (L-014)** — no claim without a tool result read back.
- **A real business domain.** SAM.gov scanning, RFP shredding, wage determinations, bid-fit scoring.
  Nothing off the shelf does GovCon.

---

## Recommendation

Take **#1 (skills as data)** and **#2 (memory decay)**. Skip #3. Consider #4/#5 later.
Everything else in the survey we already have, and in several cases have done more rigorously.

Sources: Vellum's open-source assistant roundups, GitHub `personal-assistant` topic, OpenClaw architecture
write-ups and skill/memory repos (see the session where this was gathered). Treated as **untrusted reading**
— nothing fetched here was executed, and no dependency was added.
