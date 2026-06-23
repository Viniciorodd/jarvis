# Jarvis Personal OS — PRD
## "One app. Everything. Lives on my NAS."

---

## The vision

Jarvis is already being built as the operator's command center for business. This PRD extends it to cover personal life. The operator should never need to open Apple Notes, Day One, Voice Memos, or a separate todo app again. Everything lives in Jarvis. Everything syncs to the NAS. Jarvis has access to all of it.

One app. Dark green terminal aesthetic. Installable as a PWA on iPhone and iPad. Zero third-party cloud services for personal data.

---

## Modules to add

### 1. Voice capture
- Big red record button accessible from anywhere in the app (floating action button, one tap)
- Records audio directly in the browser via MediaRecorder API
- Saves `.m4a` / `.webm` to `/jarvis/knowledge/voice/` on NAS immediately on stop
- Fires local Whisper transcription automatically
- Transcript appears in the note within 30–60 seconds
- Telegram notification: "✓ Voice memo transcribed · 48s"

### 2. Notes
- Full markdown editor (use CodeMirror or simple textarea with preview toggle)
- Auto-save every 5 seconds, no save button needed
- Every note saved as a `.md` file to `/jarvis/knowledge/notes/` on NAS
- Searchable from the main search bar
- Tags (operator types `#government`, `#idea`, `#lesson`, etc.)
- Notes feed into Jarvis agent context automatically

### 3. Journal
- One entry per day, auto-created at midnight
- Daily template (configurable): Date · Today's intention · Gratitude · Notes · End-of-day reflection
- Entries stored as `/jarvis/knowledge/journal/YYYY-MM-DD.md`
- Private — not surfaced to agents unless operator explicitly tags a line with `#jarvis`
- Weekly reflection agent reads journal entries tagged `#jarvis` only

### 4. To-do list
- Simple: title, due date (optional), pod assignment (optional), priority (1–3), done/not done
- Stored in the events database (same one the control plane already uses)
- Visible in the HQ cockpit sidebar
- When a todo is assigned to a pod (e.g., "Gov"), it appears in that pod's task queue
- Syncs to Google Calendar (optional, gated behind operator enabling it)

### 5. Calendar
- Month/week/day view
- Reads from: Google Calendar (via API), Apple Calendar (via CalDAV), and internal Jarvis events
- Jarvis-created events (reminders, proposal deadlines, contract dates) appear here automatically
- Operator can add personal events directly
- All events stored locally first, then synced out — NAS is the source of truth

### 6. People / contacts log
- Simple CRM: name, relationship, last contact date, notes
- When you mention a person in a voice memo or note, Jarvis auto-links the mention
- Useful for: subcontractors, clients, government contacts, personal relationships
- Stored in `/jarvis/knowledge/people/{name}.md`

### 7. Search (the unifier)
- One search bar that searches across ALL of the above simultaneously
- Voice memos (by transcript), notes, journal (non-private lines), todos, calendar events, people
- Results ranked by recency + relevance
- This is what makes it feel like one app, not six

---

## Data storage — all on NAS

```
/jarvis/knowledge/
  /voice/
    2026-06-21T09-33.webm
    2026-06-21T09-33.md        # transcript
  /notes/
    {uuid}.md                  # one file per note
  /journal/
    2026-06-21.md
    2026-06-20.md
  /people/
    {slug}.md
  /todos.json                  # or a table in the existing Postgres DB
```

All files are plain Markdown. No proprietary format. Readable forever.

---

## What Jarvis agents can now access

Every agent prompt can now include:
- Latest journal lines tagged `#jarvis`
- All notes tagged with the relevant pod (`#government`, `#saas`, etc.)
- Voice memo transcripts from the past 7 days
- Operator's open todos for that pod
- Any people records relevant to the current task

This is how Jarvis graduates from task runner to actual advisor.

---

## Tech notes for Claude Code

- Use the existing React + Vite + Zustand stack (already defined in the world build)
- Voice recording: browser `MediaRecorder` API — no third-party library needed
- Markdown editor: `@uiw/react-md-editor` (MIT license, lightweight)
- Calendar: `react-big-calendar` (MIT) or build a simple custom grid (simpler, matches the design system)
- All file reads/writes go through the Jarvis Control Plane API — new endpoints needed:
  - `POST /api/knowledge/voice` — upload audio blob
  - `GET/POST /api/knowledge/notes` — list and create notes
  - `GET/PUT /api/knowledge/journal/{date}` — read/write daily journal
  - `GET/POST /api/knowledge/todos` — list and create todos
  - `GET /api/knowledge/search?q=` — unified search across all types
- Whisper runs as a sidecar container on the NAS; the control plane calls it after receiving audio
- No iCloud, no Day One API, no Apple sync needed — the app IS the capture layer

---

## Build order for Claude Code

1. Control plane endpoints (voice upload, notes CRUD, journal CRUD, todos, search)
2. Whisper sidecar Docker container wired to the voice endpoint
3. Notes module (simplest — just markdown files)
4. Journal module (daily template + auto-create)
5. Voice module (record button + upload + transcript display)
6. Todos (wire to existing event store)
7. Calendar (read-only from Google/Apple first, then add write)
8. People log
9. Unified search
10. Wire all of it into Jarvis agent context

---

## What to pass to Claude Code

Tell it:

> "Extend the Jarvis app with a Personal OS layer. Read the PRD at /docs/jarvis-personal-os-prd.md. This adds six modules to the existing app: voice capture, notes, journal, todos, calendar, and people. All data lives on the NAS as plain Markdown files or in the existing Postgres database. No third-party cloud storage. The UI must match the existing dark green terminal aesthetic exactly. Start by proposing the Control Plane API endpoints and the database schema additions. Wait for my approval before writing any component code."
