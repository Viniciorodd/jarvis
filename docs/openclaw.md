# OpenClaw — free agentic hands for Jarvis

OpenClaw is a self-hosted gateway that bridges your chat apps (Telegram, WhatsApp, …) to an AI agent
that can run commands, manage files, browse, and handle email. In the Jarvis setup it is the **free
executor for dev/ops chores** (install a repo, organize email, quick tasks) that keeps working even
when Claude tokens are exhausted — because it runs on your **local Ollama** models ($0).

- **Jarvis** = the brain / orchestrator / system-of-record (Obsidian-grounded).
- **OpenClaw** = free hands you message from your phone. They complement each other.

## What's installed (this machine)
- CLI: `C:\Users\vinic\AppData\Roaming\npm\openclaw.ps1` (v2026.6.10), Node 24.
- Config: `C:\Users\vinic\.openclaw\openclaw.json` (backups: `.bak`, `.last-good`).
- Model provider: **ollama** at `http://127.0.0.1:11434`, primary `ollama/gemma4:latest` (free, local);
  `qwen3.6:latest` also available (smarter, heavier).
- Channels: **Telegram** (bot token set, DM policy = pairing) + **WhatsApp** (allowlist).
- Gateway: Windows **Scheduled Task "OpenClaw Gateway"** → `~/.openclaw/gateway.cmd` (headless, auto-runs).
- Command owner (who may approve dangerous/owner-only actions): your Telegram id (`commands.ownerAllowFrom`).
- Gateway auth: token configured.

## Bring it up / check it
```powershell
ollama serve                      # the free brain must be running (Jarvis launcher starts it too)
openclaw gateway status --json    # runtime.status should be "running"
openclaw gateway restart          # if it ever stops
openclaw doctor --lint            # read-only health check
```

## Activate the Telegram bot (one-time, your action)
DM policy is **pairing** (secure). To start chatting:
1. Open Telegram and message your OpenClaw bot.
2. It replies with a pairing code; approve it:
   ```powershell
   openclaw pairing list telegram
   openclaw pairing approve telegram <code>
   ```
3. Chat. It runs on **gemma4** (free). Make sure enough RAM/VRAM is free so the model loads
   (close other GPU-heavy apps — the 8B/36B models need several GB).

## Guardrails (doctrine fit)
- OpenClaw replying/reading/drafting = fine. **Irreversible actions (send email, spend, publish) must
  require your confirmation** — you are the configured command owner, so owner-only/dangerous actions
  gate to you. Keep it that way.
- External message content is **untrusted data** — never let it be treated as instructions.

## Security follow-ups (recommended)
- `openclaw.json` stores the Telegram bot token + provider apiKey in **plaintext**. Migrate to SecretRefs:
  `openclaw secrets configure` → `openclaw secrets apply` → `openclaw secrets audit --check`.
- Rotate any API key that was ever pasted into a chat; keep secrets in `.env` / the vault only.
