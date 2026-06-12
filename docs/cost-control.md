# Cost control — don't burn your limits

## Building (Claude Code, your plan's limits)
- Build in **Claude Code sessions opened in this repo** — `CLAUDE.md` carries context between
  sessions so nothing restarts from zero. Long chat threads re-send everything every message;
  repo-based sessions don't.
- One feature per session ("read the repo; today we wire the Etsy scout"). Commit as you go.

## Running (API, pay-as-you-go — separate from your chat plan)

| Lever | Effect |
|---|---|
| Model tiering: Haiku scans → Sonnet drafts → Opus weekly only | ~5–25× cheaper than Opus-everywhere |
| Prompt caching: keep the Operator Profile + role prompt byte-identical at the top of `system` | cached input ≈ 90% off on hits |
| Batch API for overnight bulk jobs (trend scans, transcript summaries) | flat 50% off |
| Local Whisper for transcription, local embeddings | $0 |
| Cap `max_tokens` per role; scouts don't need essays | direct |

Current per-MTok pricing (input/output): Haiku 4.5 $1/$5 · Sonnet 4.6 $3/$15 · Opus 4.8 $5/$25.
Verify at https://platform.claude.com/docs/en/about-claude/pricing

## Budget expectations
- Phase 0–1: ~$10–40/mo API. Phase 2–3: ~$30–150/mo. Set a billing alert at $50 in the
  Anthropic console on day one.
- The EOD report should include yesterday's API spend once you add the usage check —
  if a pod's token bill outruns its revenue for a month, that's a kill/keep conversation.
