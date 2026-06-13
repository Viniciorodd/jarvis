# PRD — JARVIS Knowledge Vault (your second brain)

> Goal: gather everything you've written, recorded, and researched — Notion, NAS docs, voice
> memos, Notability, Apple Notes, Day One, journals, mindmaps — into ONE private, organized,
> searchable place that's easy to find, read, and understand. It feeds the Operator Profile and
> becomes something you (and Jarvis) can ask questions of.

This is infrastructure, not a money pod. It plugs into the chassis: ingestion agents show up on
the HQ floor, the Companion ("her") becomes the way you talk to it, and a weekly job distills new
material into your Operator Profile.

---

## 1. The golden safety rule (your instinct, made architectural)

**Never point ingestion at another app's live sync/working folder.** Reading an iCloud Drive,
Notability auto-sync, or Notion-cache folder risks pulling half-synced data, or worse, an agent
writing into a space another app owns and corrupting it.

Instead: **one-way drop zone.** You *export* from each app into a dedicated inbox the vault owns.
Ingestion reads the inbox, processes, files into the vault, and **archives the original**. It never
reads from, writes to, or watches any source app's folder.

```
Source apps  ──(you export)──▶  Vault/_inbox/   ──(ingestion)──▶  Vault/<organized>/  +  search index
(Notion, Notability,                (the ONLY                     (read-only to agents;
 Apple Notes, Day One,               place agents                  originals archived in
 voice, mindmaps)                    pick things up)               Vault/_archive/_originals/)
```

The inbox lives on your NAS, created by us, used by nothing else. Drag exports in; that's the contract.

---

## 2. Source-by-source reality (honest)

| Source | How it gets in | Effort | Notes |
|---|---|---|---|
| **Notion** | Notion API (you have the key) — agents read pages/DBs directly; OR "Export" → Markdown ZIP into inbox | Easy | Notion stays your live company brain; vault aggregates/archives it |
| **NAS documents** | Already on the NAS — point the vault indexer at a *copy*, not your live working dirs | Easy | Don't index app-owned folders; copy into vault or index a read-only snapshot |
| **Voice recordings** | Drop audio in inbox → Whisper (your container) transcribes → text filed | Easy | Already have the Whisper service |
| **Day One** | App → Export → JSON or Markdown ZIP → inbox | Easy-ish | Sensitive (journals) — stays local, never sent to agents raw |
| **Notability** | App → Share/Export → PDF (per note or batch) → inbox | Medium | Handwriting needs OCR (we run it on ingest) |
| **Mindmaps** | Export to OPML / Markdown / PNG from your app → inbox | Medium | Text formats (OPML/MD) index well; images get OCR/caption |
| **Apple / iCloud Notes** | **No API, and you're on Windows.** Options: (a) export note-by-note to PDF via iCloud.com, (b) use a Mac once to bulk-export, (c) a paid exporter tool | **Hard** | The one walled garden. We'll pick the least-painful path when you get to it; don't let it block the rest |

Start with the easy wins (Notion, NAS, voice, Day One). Apple Notes last.

---

## 3. The vault layout (so things have a home)

On the NAS (the 20TB), a single root, e.g. `/volume1/JARVIS-Vault/`:

```
JARVIS-Vault/
  _inbox/                  ← you export into here (the only drop zone)
  _archive/_originals/     ← every ingested original, untouched, by date
  Businesses/
    Rodgate/   ReconTweaks/   Fiverr/   ...
  Personal/
    Journal/   Notes/   Voice/   Health/   ...
  Research/                ← topic folders, auto-tagged
  Reference/               ← boilerplate, templates, docs you reuse
  index/                   ← the search index (see §4)
```

Taxonomy is yours — this is a sane default. Ingestion proposes where each item goes (you can correct it).

---

## 4. Make it actually findable (the payoff)

Folders alone aren't "easy to find/understand." Two layers on top:

- **Auto-summary + tags:** on ingest, Claude (Haiku — cheap) writes a 2-line summary and tags for
  every item, stored alongside it. Skim summaries instead of opening 200 files.
- **Semantic search:** an embeddings index (local, on the NAS — e.g. SQLite + vectors) so you can
  ask *"what did I write about the Carlisle bid?"* or *"my notes on supplement compliance"* and get
  the right notes back, even if you don't remember the filename. This is the dream feature.

**Phase it:** start with folders + Claude summaries + plain full-text search (works day one). Add
the embeddings/semantic layer once the corpus is in and the pipeline is proven.

---

## 5. How it ties into the rest of JARVIS

- **Companion ("her")** becomes the front door: "Jarvis, find my notes on X" → she searches the
  vault and reads you the answer. (New `search_vault` tool, sibling to `read_hq`.)
- **Operator Profile:** the weekly Opus job reads *new* vault material and proposes Profile edits —
  this is how your recordings/journals teach Jarvis who you are, without dumping raw text into prompts.
- **Pods** pull from `Reference/` (e.g., the gov pod uses your capability boilerplate; Fiverr uses
  your style notes).

---

## 6. Privacy (non-negotiable for journals)

- The vault lives **on your NAS, local.** Nothing is published.
- Sensitive material (Day One, personal journals) is flagged `private` and **never injected into
  agent prompts**; only *you* and the Companion (on direct request) read it. The weekly distiller
  extracts lessons/themes, not raw entries.
- Only the text needed for a summary/embedding is sent to the Claude API (covered by API terms);
  local Whisper/OCR keep audio + handwriting processing on your box.
- Backed up encrypted offsite with the rest of the irreplaceable 1% (see nas-setup.md §4).

---

## 7. Build phases
- **V0:** create the vault + `_inbox` on the NAS; ingestion script: detect new file → (Whisper if
  audio / OCR if PDF-image / read if text) → Claude summary+tags → file into vault + archive original.
- **V1:** Notion pull (API) + Day One export ingest; full-text search.
- **V2:** semantic/embeddings search; `search_vault` tool in the Companion.
- **V3:** Notability + mindmaps (OCR); weekly Operator-Profile distiller wired to new material.
- **V4:** Apple Notes (the walled garden) via whichever export path hurts least.
