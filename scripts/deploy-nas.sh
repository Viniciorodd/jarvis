#!/usr/bin/env bash
# JARVIS one-shot deploy for the UGREEN NAS.
# Run from the project root (the folder containing docker-compose.yml):
#   bash scripts/deploy-nas.sh
# If your user needs sudo for docker, run:  sudo bash scripts/deploy-nas.sh
set -euo pipefail

cd "$(dirname "$0")/.."          # project root
ROOT="$(pwd)"
echo "== JARVIS deploy =="
echo "project: $ROOT"

# 1. Preflight
[ -f docker-compose.yml ] || { echo "ERROR: docker-compose.yml not found in $ROOT"; exit 1; }
[ -f .env ] || { echo "ERROR: .env not found. Copy your .env into $ROOT first."; exit 1; }

# Pick the compose command this NAS has (v2 plugin vs legacy binary)
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
else echo "ERROR: docker compose not found. Install/enable Docker in UGOS first."; exit 1; fi
echo "compose: $COMPOSE"

# Warn on unset critical secrets
grep -q '^N8N_ENCRYPTION_KEY=.\+' .env || { echo "ERROR: N8N_ENCRYPTION_KEY is empty in .env"; exit 1; }
grep -q 'change-me' .env && echo "WARNING: a 'change-me' placeholder is still in .env — check it." || true
grep -q '^TS_AUTHKEY=tskey-' .env || echo "NOTE: TS_AUTHKEY not set — the tailscale container will fail to authenticate (fine if you use the UGOS Tailscale app instead; remove the service or ignore)."

# 2. Create bind-mount dirs with writable perms (n8n/hq run as non-root uid inside their images)
echo "== preparing volumes =="
mkdir -p volumes/postgres volumes/n8n volumes/hq volumes/whisper-cache volumes/voice-inbox volumes/tailscale
chmod -R 777 volumes/n8n volumes/hq volumes/voice-inbox volumes/whisper-cache 2>/dev/null || true

# 3. /dev/net/tun for the tailscale container (skip silently if not using it)
if ! [ -e /dev/net/tun ]; then
  echo "== loading tun module (for tailscale) =="
  (modprobe tun 2>/dev/null || sudo modprobe tun 2>/dev/null) || echo "  (could not load tun — tailscale container may fail; UGOS app or 'sudo modprobe tun' fixes it)"
fi

# 4. Pull + build + start
echo "== pulling images (first run downloads a few hundred MB) =="
$COMPOSE pull --ignore-buildable 2>/dev/null || $COMPOSE pull 2>/dev/null || true
echo "== building + starting the stack =="
$COMPOSE up -d --build

# 5. Wait for health and report
echo "== waiting 25s for services to settle =="
sleep 25
echo "== status =="
$COMPOSE ps

# 6. Quick reachability check on HQ (internal)
echo "== HQ health =="
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://localhost:8099/api/state" >/dev/null 2>&1 && echo "HQ responding on :8099 OK" || echo "HQ not responding yet — check: $COMPOSE logs hq"
fi

HOST="$(grep -E '^N8N_HOST=' .env | cut -d= -f2)"
echo ""
echo "== DONE =="
echo "Open from a device on your Tailscale tailnet (or LAN IP 192.168.6.121):"
echo "  HQ  dashboard : http://${HOST:-jarvis-nas}:8099   (add to iPhone home screen)"
echo "  n8n workflows : http://${HOST:-jarvis-nas}:5678   (create your owner login first)"
echo ""
echo "Next: 1) create the n8n owner account in the browser,"
echo "      2) run  bash scripts/import-workflows.sh  to load the workflows,"
echo "      3) in n8n, open each workflow, Save, and toggle Active (heartbeat first)."
