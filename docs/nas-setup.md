# UGREEN NAS setup

Your 20TB NASync runs UGOS Pro with native Docker/Compose — it is the server for this whole
plan. The 20TB is the asset vault (renders, design files, transcripts, backups). N100-class
CPUs handle this stack easily; heavy AI stays on the Claude API by design.

## 1. Tailscale first (private access, nothing public)

Pick ONE method:

**Method A — UGREEN App Center (easiest).** If "Tailscale" is in the App Center, install it,
log in, done. Then DELETE the `tailscale:` service from `docker-compose.yml` (don't run both).

**Method B — Docker container (already in this compose file).** Use when there's no App Center app.
1. Auth key: https://login.tailscale.com/admin/settings/keys → **Generate auth key**.
   Reusable OFF, Ephemeral OFF (state persists in `./volumes/tailscale`). Copy `tskey-auth-...`.
2. Paste it into `.env` as `TS_AUTHKEY=`.
3. Confirm the TUN device on the NAS: `ls -l /dev/net/tun`. If missing: `sudo modprobe tun`
   (add `tun` to `/etc/modules` so it survives reboot).
4. Bring up Tailscale first, alone: `docker compose up -d tailscale`
5. Verify: `docker compose logs tailscale` → look for "Success." + a `100.x.y.z` IP. The machine
   shows up as **jarvis-nas** in your Tailscale admin console.
6. In the admin console: enable **MagicDNS** (DNS tab) so `jarvis-nas` resolves tailnet-wide,
   and disable key expiry for the machine so it doesn't drop off later.

Either method:
- Install the Tailscale app on iPhone + iPad, logged into the **same** tailnet account.
- **Never** use UGREENlink, DDNS, or port forwarding. Exposed NAS devices are the #1
  ransomware target in self-hosting; Tailscale keeps yours invisible to the public internet.
- Known UGOS quirk: it occupies port 53 and can fight Tailscale's DNS — the compose service
  already passes `--accept-dns=false` to sidestep it. More at guide.ugreen.community.
- Reference: https://nas.ugreen.com/blogs/how-to/ugreen-nas-remote-access

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
