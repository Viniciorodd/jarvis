# Second brain — Obsidian on the NAS

The operator's second brain is an **Obsidian vault**, hosted on the NAS. Everything is plain
Markdown under one folder — no lock-in, Obsidian opens it directly. (Memory:
`project-obsidian-second-brain`.)

## Where it lives
The companion's knowledge layer writes to:
```
KNOWLEDGE_DIR = process.env.JARVIS_KNOWLEDGE || ~/knowledge   (companion/server.js)
```
To host it on the NAS Obsidian vault, set one env var (PC `.env` and the NAS `.env`/compose):
```
JARVIS_KNOWLEDGE=/path/to/NAS/ObsidianVault     # e.g. a Tailscale/SMB mount or the NAS container path
```
Vault layout (auto-created): `notes/ journal/ people/ projects/ ideas/ tasks/ voice/ braindumps/`.

## Brain dump + AI sorter
- Personal → **Brain** tab (or `POST /api/knowledge/braindump {text}`).
- Every dump is **archived verbatim** to `braindumps/<timestamp>.md` (never lost), then Claude sorts it
  and files a cleaned copy into the right library: journal entries append to today's `journal/<date>.md`;
  people notes go to `people/<name>.md`; everything else becomes a note in `notes|projects|ideas|tasks/`.
- The dump is treated as untrusted data — the sorter classifies it, never executes anything inside it.

## Apple Notes → Obsidian (migration)
Apple Notes has no Windows API, so migration is export-then-import:
1. **Export** from Apple Notes (on a Mac/iCloud): select notes → File → Export as PDF is lossy; prefer a
   plain export tool or copy each note to `.txt`/`.md` into one folder. Or use iCloud.com → Notes.
2. **Import**: `POST /api/knowledge/import-dir {dir:"C:/path/to/exported-notes"}` — reads every
   `.md/.txt/.html` file, strips basic HTML, and runs each through the same sorter into the vault.
3. **Delete from Apple Notes** — this is **manual and gated**. Jarvis will not auto-delete iCloud notes.
   Once you've confirmed everything imported, delete them yourself in Apple Notes.
