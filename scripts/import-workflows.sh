#!/usr/bin/env bash
# Imports the JARVIS workflows into the running n8n container.
# Run AFTER the stack is up and you've created the n8n owner login in the browser:
#   bash scripts/import-workflows.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
else COMPOSE="docker-compose"; fi

echo "== copying workflow JSON into the n8n container =="
CID="$($COMPOSE ps -q n8n)"
[ -n "$CID" ] || { echo "ERROR: n8n container not running. Run scripts/deploy-nas.sh first."; exit 1; }

docker exec "$CID" sh -c 'mkdir -p /tmp/wf'
for f in n8n/workflows/*.json; do
  docker cp "$f" "$CID:/tmp/wf/$(basename "$f")"
done

echo "== importing =="
docker exec "$CID" n8n import:workflow --separate --input=/tmp/wf || {
  echo "Import via CLI failed (n8n owner account may not be set yet)."
  echo "Fix: open http://<nas>:5678, create the owner login, then re-run this script."
  exit 1
}
echo ""
echo "== imported. Now in the n8n UI =="
echo " - Settings → Credentials: add Gmail OAuth2 (workflows 02/03) and Notion (optional)."
echo " - Open each workflow, click into its nodes once, Save."
echo " - Activate '00 HQ heartbeat' FIRST — watch the HQ floor show a CORE operator within 15 min."
echo " - Then activate the rest."
