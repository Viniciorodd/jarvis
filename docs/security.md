# Security ground rules (non-negotiable)

1. **Approval gates** on anything touching money, sending, submitting, publishing, listing.
   Autonomy is earned per workflow after weeks of clean drafts — and revoked on the first bad one.
2. **Prompt injection**: every agent that reads outside content (email, listings, buyer
   messages, web pages) carries the untrusted-data clause. The email agent has read +
   draft-create only — never send/delete/forward permissions.
3. **Secrets**: in `.env` and n8n's credential vault only. Never in prompts, Notion, Telegram,
   or this repo. One credential per pod, least privilege, 2FA on every account.
4. **Network**: Tailscale only. No port forwarding, no DDNS, no UGREENlink for these services.
5. **Kill switch**: n8n → Workflows → master toggle deactivates everything; reachable from
   your phone over Tailscale. Know where it is before you need it.
6. **Backups**: weekly, encrypted, offsite (see nas-setup.md). Test a restore once.
7. **HQ token**: set `HQ_TOKEN` in `.env` once you go live so only n8n can write events.
8. **Financial rails**: no agent ever holds bank/brokerage credentials. Trading stays
   monitor-only (the Watchtower) — decisions and executions are yours.
9. **Legal lines per pod**: federal proposals = you sign (False Claims Act exposure) ·
   supplements = no health claims without counsel-reviewed templates · kids content = your
   eyes on every frame + Made-for-Kids/COPPA designation · Etsy/POD = trademark check before
   any phrase goes on a product · Fiverr = you hold rights to everything delivered.
