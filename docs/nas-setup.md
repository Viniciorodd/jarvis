# UGREEN NAS setup

Your 20TB NASync runs UGOS Pro with native Docker/Compose — it is the server for this whole
plan. The 20TB is the asset vault (renders, design files, transcripts, backups). N100-class
CPUs handle this stack easily; heavy AI stays on the Claude API by design.

## 1. Tailscale first (private access, nothing public)

Preferred: install Tailscale from UGREEN's App Center if available, else run the container
(commented block in `docker-compose.yml` — pick ONE method, not both).
UGREEN's guide: https://nas.ugreen.com/blogs/how-to/ugreen-nas-remote-access

- Install Tailscale on iPhone + iPad too; log into the same tailnet.
- **Do not** use UGREENlink, DDNS, or port forwarding for any of this. Exposed NAS devices
  are the #1 ransomware target in self-hosting; Tailscale keeps yours invisible.
- Known UGOS quirk: it occupies port 53 and can fight Tailscale's DNS. Fix documented at
  guide.ugreen.community if you hit it.

## 2. Deploy the stack

```sh
# SSH into the NAS (enable SSH in UGOS control panel), then:
mkdir -p /volume1/docker/jarvis && cd /volume1/docker/jarvis
# copy this repo's files here (git clone, or SMB-copy the folder)
cp .env.example .env && vi .env          # fill every key
docker compose up -d
docker compose ps                         # all services healthy?
```

Then from your iPhone (on Tailscale):
- n8n → `http://<nas-tailscale-name>:5678`
- HQ → `http://<nas-tailscale-name>:8099` → Safari share menu → **Add to Home Screen** (it's a PWA)

## 3. Wire n8n

Follow `n8n/README.md`: import `00-hq-heartbeat` first, confirm the HQ floor lights up,
then the rest. Create the Gmail (and later Notion) credentials in n8n's vault.

## 4. Backups — RAID is not a backup

RAID survives a dead drive, not ransomware/fire/fat fingers. Weekly, encrypted, offsite
(any cheap cloud) for the irreplaceable 1%:

- `volumes/hq/` (your money/XP ledger), `volumes/n8n/` (workflows + credential vault)
- Notion export, the Operator Profile, financial records

UGOS's built-in backup app or a simple `restic` cron container both work — set it up in
week 1, not after the first scare.
