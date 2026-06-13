# PRD — JARVIS Companion (voice-first desktop assistant)

> This does NOT replace the master plan (`docs/reference/jarvis-build-plan.md`) or the pods.
> It adds a new **surface**: the voice/face you talk to. The pods + HQ + n8n are the muscle;
> the Companion is the brain you converse with that can *drive* all of it.

---

## 1. The vision (what "done" feels like)

You sit at your desk. You say **"Hello Jarvis"** (or tap her orb, or type). The orb wakes — a
living particle ring (your reference image #2) on a dark HUD. You talk to her like a person:

> "Good morning — what's on my plate?"
> *(she speaks back)* "Three things. A sub quote came back on the Carlisle janitorial bid,
> your 2pm moved to 3, and Stripe shows $1,240 collected this week, up 18%. Want the bid details?"

You ask her to do things — create a folder, draft a proposal, edit a doc, check email, pull
your calendar, summarize Stripe. The big or risky stuff she *proposes* and you approve. When you
want to see the operation, you say "show me the floor" or click the toggle, and the **HQ pod
ecosystem** (already built) slides in — agents working in their rooms. Two views, one Jarvis.

She runs on your **desktop as a real app**, not a browser tab. Hotkey or tray icon, always there.

---

## 2. Scope

**In scope (Companion):**
- Voice in (wake word + speech-to-text), voice out (ElevenLabs), and text chat — all three.
- A desktop app (Electron) with two views: **Companion** (orb) ⇄ **HQ** (pods, existing).
- Tools/superpowers: files & folders (create/read/edit/move/delete), PC actions, calendar,
  email, Stripe — each behind the right safety gate.
- Integration: she can read HQ state, trigger pods/workflows, and voice you the approvals that
  today go to Telegram.

**Out of scope (already built / separate):** the pods themselves, n8n, the HQ floor rendering,
the gov/Fiverr/etc. business logic. The Companion *uses* these; it doesn't rebuild them.

---

## 3. Architecture (how it plugs into what exists)

```
   ┌─────────────────────────── JARVIS Companion (Electron app, your PC) ──────────────────────────┐
   │  UI: Companion orb view  ⇄  HQ pod view (loads the existing HQ at :8099)                       │
   │                                                                                                │
   │  Voice loop:                                                                                   │
   │   mic ─▶ [Porcupine wake word "Hello Jarvis", local] ─▶ [STT: Deepgram/Whisper] ─▶ text        │
   │   text (from voice OR typing) ─▶  THE BRAIN  ─▶ reply text ─▶ [ElevenLabs TTS] ─▶ speakers      │
   │                                      │                                                          │
   │   THE BRAIN = Claude (Opus/Sonnet) agent loop with tools:                                      │
   │     • filesystem (create/edit/move/delete — gated on destructive)                              │
   │     • computer/PC control (open apps, click, type — gated)                                     │
   │     • calendar (Google) · email (Gmail) · Stripe (read free; money gated)                      │
   │     • jarvis-backend: read HQ state, trigger n8n workflows, answer approvals                   │
   └───────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                │  (same Tailscale network)
                          ┌─────────────────────▼─────────────────────┐
                          │  EXISTING NAS STACK (already running)      │
                          │  n8n · HQ (:8099) · Postgres · pods        │
                          └────────────────────────────────────────────┘
```

Key point: the Companion is **another client** of the same backend. An approval she voices is the
same approval that hits the HQ floor and Telegram — one gate, three interfaces.

---

## 4. The voice stack (decision)

| Layer | Choice | Why | Cost |
|---|---|---|---|
| Wake word | **Picovoice Porcupine** | Custom "Hello Jarvis", runs **locally** (privacy — mic audio doesn't leave the PC until woken), low CPU | Free tier OK |
| Speech-to-text | **Deepgram** (streaming) — or local **Whisper** for full privacy | Deepgram = fast, accurate, cheap; Whisper = private but slower | ~$ pay-as-you-go / $0 local |
| Brain | **Claude** (Opus 4.8 for hard, Sonnet for chat) with tool use | The decision-maker + tool driver; already your stack | API usage |
| Voice out | **ElevenLabs** | Best natural "her" voice; pick/clone a voice | ~$5–22/mo |

Wake word, click, and text all feed the same brain. ElevenLabs is the *voice* — confirmed the
right tool — but it's one of four layers, not the whole thing. (Alternative all-in-one: ElevenLabs
"Conversational AI" or OpenAI Realtime bundle STT+LLM+TTS, but they put a different model in the
brain seat; we want Claude driving your tools, so we assemble the layers.)

---

## 5. Superpowers & their safety gates (non-negotiable)

She's powerful, so blast radius matters — *especially* because voice can be misheard
("delete the **folder**" vs "delete the **older**"). Gates by risk:

| Power | Autonomy | Gate |
|---|---|---|
| Read files, list dirs, read calendar/email/Stripe | **Free** | none — read-only is safe |
| Create folders/files, write new docs, draft emails/proposals | **Free-ish** | creates in safe paths; drafts never auto-send |
| Edit existing files | Confirm | shows a diff / says what changes before saving |
| Move / delete files & dirs | **Confirm always** | she repeats the exact target and waits for "yes" |
| Send email, publish, post | **Confirm always** | same gate as the pods |
| **Stripe: any charge, refund, payout, transfer** | **Hard confirm** | she can read all day; moving money needs explicit typed/spoken confirm + amount read back |
| PC control (open apps, click, type) | Confirm on anything destructive | scoped allow-list of safe actions |

Rule, same as the chassis: **read & draft are free; send/spend/delete pause for you.** Voice
confirmations for money and deletion must read the specifics back ("Refund $340 to order 1051 —
say confirm"). This protects you from both mistakes and mis-hearing.

---

## 6. UI (from your reference images)

- **Companion view:** dark background, a central **reactive particle orb** (image #2) that idles
  calm, pulses/ripples while she listens and speaks. A subtle HUD ring (image #1 Iron Man vibe).
  A text input at the bottom for type-to-Jarvis. Minimal: her, a transcript, a mic state.
- **HQ view:** the pod floor already built — toggle/say "show the floor" to slide to it.
- **Frameless, draggable, tray icon + global hotkey** (e.g. ⌥-Space) to summon from anywhere.
- Aesthetic: dark, teal/cyan accents (matches both your orb image and the HQ I built), Olas-style
  agent cards for the pod side (image #3).

---

## 7. Build phases (so this doesn't become a 6-month rabbit hole)

**Phase A — Companion MVP (talk + act, text + push-to-talk).** Electron window with the orb;
type or hold-to-talk; Claude brain; **filesystem tools** (create/edit/folders) with gates. No wake
word, no cloud TTS yet (use the OS voice to start). *You can already create files and chat by voice.*

**Phase B — Real voice.** Add **ElevenLabs** voice out + **Deepgram** STT for natural back-and-forth.

**Phase C — "Hello Jarvis."** Add **Picovoice** wake word + tray/hotkey summon. Now she's ambient.

**Phase D — Life integrations.** Calendar (Google) + Email (Gmail) + **Stripe** (read first, then
gated actions). She can now run your day.

**Phase E — Fuse with the empire.** Companion ⇄ HQ toggle; she reads HQ state aloud, voices pod
approvals, and triggers workflows ("Jarvis, run the SAM scout"). One Jarvis over everything.

**Phase F — Polish.** PC control superpowers, the full HUD orb animation, voice personality tuning.

Each phase is usable on its own. We do not start B until A works, etc. — same discipline as the pods.

---

## 8. Honest costs & cautions

- **Cost:** Companion adds ElevenLabs (~$5–22/mo) + Deepgram (cheap, usage) + more Claude tokens
  (voice conversations are chattier). Picovoice free tier. Call it +$15–50/mo on top of the pods,
  scaling with how much you talk to her.
- **Token burn:** realtime voice is more token-hungry than the batch pods — we tier (Sonnet for
  chat, Opus only for hard reasoning) and keep her replies tight.
- **Security:** PC + email + Stripe in one assistant is a big surface. Gates above are mandatory.
  Stripe keys and tokens live in the app's secure store / OS keychain, never in prompts. The
  always-listening wake word is **local-only** (Picovoice) so ambient audio isn't streamed anywhere.
- **This is a real software build.** It's very achievable, but it's a multi-session project, not a
  one-evening thing. Phase A is the first real milestone.

---

## 9. Open decisions for you
1. **Her voice & name on screen:** "Jarvis" everywhere, or a distinct name for the companion?
2. **Start point:** build Phase A now, or design the orb UI first so you see her before wiring tools?
3. **Stripe comfort:** read-only forever (she reports, you act), or gated actions later? (Recommend
   read-only until you trust her for months.)
