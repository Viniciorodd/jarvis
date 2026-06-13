# DEPLOY NOW — get JARVIS live on the NAS

Everything's prepared. Your part is 4 steps. The longest is a one-time file copy.

---

## Step 1 — Get the project folder onto the NAS

You already have file access to the NAS over SMB (`\\ThanesKeep`). Copy the whole
`C:\Users\vinic\Desktop\jarvis` folder onto the NAS.

**Easiest (UGOS File Manager in the browser):**
1. Open `https://192.168.6.121` → **File Manager**.
2. Create a folder for it, e.g. under your `docker` share: `docker/jarvis`
   (or any share you can reach — the exact path doesn't matter, the script handles it).
3. Drag the entire `jarvis` folder contents in.

**IMPORTANT — the `.env` file:** Windows hides files starting with a dot, and the SMB copy
may skip it. After copying, confirm `.env` is present on the NAS. If it's missing, in File
Manager use "show hidden files" or copy `.env` manually. **Without `.env` the deploy stops.**
(`node_modules/` and `fiverr-assets/` do NOT need to be copied — skip them, they're large.)

Note the full path where it landed, e.g. `/volume1/docker/jarvis`. Find it via SSH with:
`ls -d /volume1/*/jarvis 2>/dev/null` or check the File Manager path.

---

## Step 2 — SSH in and run the deploy (one command)

In PowerShell:
```powershell
ssh vrodriguezd@192.168.6.121
```
(type your password). Then on the NAS, go to wherever the folder landed and run the script:
```sh
cd /volume1/docker/jarvis          # adjust path if different
bash scripts/deploy-nas.sh
```
If it says Docker needs sudo, run instead: `sudo bash scripts/deploy-nas.sh` (password once).

The script checks `.env`, creates the data folders, pulls images, builds the HQ app,
starts all services, waits, and prints the dashboard URLs. First run downloads a few
hundred MB — give it a few minutes.

**Done when** it prints `== DONE ==` and lists the HQ + n8n URLs, and `docker compose ps`
shows postgres / n8n / hq / whisper (and tailscale) all Up.

---

## Step 3 — Open the dashboards

From this PC's browser (same LAN) or your iPhone (on Tailscale):
- **HQ** → `http://192.168.6.121:8099` (or `http://jarvis-nas:8099` on Tailscale) → Add to Home Screen
- **n8n** → `http://192.168.6.121:5678` → **create your owner login** (do this before Step 4)

---

## Step 4 — Load the workflows

Back in your SSH session:
```sh
bash scripts/import-workflows.sh
```
Then in the n8n UI:
1. Open **00 HQ heartbeat**, click into its nodes once, Save, toggle **Active**.
2. Watch the HQ floor → within 15 min a "CORE" operator appears. **That proves the whole wire.**
3. Add the **Gmail OAuth2** credential (Settings → Credentials), then activate the
   morning-brief / email-triage / EOD workflows.
4. The SAM scout is already set to your NAICS — activate it for daily 6:10am digests.

---

## If anything fails
- **`.env not found`** → the dotfile didn't copy in Step 1. Copy it manually.
- **`docker compose not found`** → enable Docker in UGOS App Center, retry.
- **tailscale container errors about `/dev/net/tun`** → run `sudo modprobe tun` then
  `bash scripts/deploy-nas.sh` again. (Or use the UGOS Tailscale app and ignore the container.)
- **HQ floor stays empty after heartbeat is active** → `docker compose logs n8n`; usually the
  "Ping HQ" node — confirm `.env` has `HQ_URL=http://hq:8099`.
- **n8n won't write / restarts** → the data dir perms; re-run the deploy script (it chmods them).

---

## After it's running
- Turn the SSH auto-close back on (you won't need SSH for daily use — everything restarts itself).
- **Rotate the two secrets you pasted in chat:** the Claude API key (console.anthropic.com)
  and the Telegram bot token (@BotFather `/revoke`). Put the new values in the NAS `.env`,
  then `docker compose up -d` to reload. **Change your NAS password too.**
- Write your Operator Profile (`prompts/operator-profile-template.md` → `operator-profile.md`).
