#!/usr/bin/env bash
# ONE-COMMAND UPDATE for the NAS. Pulls the latest Jarvis code from GitHub and restarts everything,
# leaving your .env and volumes/ untouched. This is the "I had an idea, you built it, now update me" button.
#
#   1) Make the repo public for a moment:  github.com/Viniciorodd/jarvis  → Settings → change visibility
#   2) On the NAS:   cd /volume1/docker/jarvis && ./scripts/update-nas.sh
#   3) Flip the repo back to private.
set -euo pipefail
REPO="${JARVIS_REPO:-https://github.com/Viniciorodd/jarvis}"
DEST="$(cd "$(dirname "$0")/.." && pwd)"

echo "▸ downloading latest from $REPO …"
if ! curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" -o /tmp/jarvis.tar.gz; then
  echo "✗ download failed — is the repo set to PUBLIC right now? (Settings → visibility). Then re-run."
  exit 1
fi
tar -xzf /tmp/jarvis.tar.gz -C /tmp

echo "▸ updating code in $DEST  (your .env + volumes/ are left untouched) …"
cp -rf /tmp/jarvis-main/* "$DEST"/ 2>/dev/null || sudo cp -rf /tmp/jarvis-main/* "$DEST"/
rm -rf /tmp/jarvis-main /tmp/jarvis.tar.gz

echo "▸ rebuilding + restarting (docker may ask your password) …"
cd "$DEST"
sudo docker compose up -d --build control-plane scheduler jarvis-world hq

HOST="$(hostname)"
echo ""
echo "✅ Updated. Reopen on your devices (hard-refresh once):"
echo "   World : http://${HOST}:8095   (or http://192.168.6.121:8095 on home wifi)"
echo "   HQ    : http://${HOST}:8099"
