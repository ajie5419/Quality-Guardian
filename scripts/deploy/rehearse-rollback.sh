#!/bin/bash

set -euo pipefail

if [[ $# -lt 6 ]]; then
  echo "用法: $0 <ssh_user> <ssh_ip> <ssh_key> <registry/repo> <current_tag> <rollback_tag>"
  exit 1
fi

SSH_USER="$1"
SSH_IP="$2"
SSH_KEY="$3"
IMAGE_REPO="$4"
CURRENT_TAG="$5"
ROLLBACK_TAG="$6"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$SSH_USER@$SSH_IP" "bash -s" <<EOF
set -euo pipefail
cd /opt/qms

set_tag() {
  local tag="\$1"
  sed -E -i \
    "s|(^[[:space:]]*image:[[:space:]]+).*:backend-[^[:space:]]+|\\1$IMAGE_REPO:backend-\$tag|" \
    docker-compose.yml
  sed -E -i \
    "s|(^[[:space:]]*image:[[:space:]]+).*:frontend-[^[:space:]]+|\\1$IMAGE_REPO:frontend-\$tag|" \
    docker-compose.yml
}

health_check() {
  local retries=10
  local i=0
  while [[ \$i -lt \$retries ]]; do
    if curl -sf http://127.0.0.1:3000/api/status >/dev/null 2>&1; then
      return 0
    fi
    i=\$((i + 1))
    sleep 2
  done
  return 1
}

echo "[rehearsal] step1 keep current tag: $CURRENT_TAG"
set_tag "$CURRENT_TAG"
docker-compose pull backend frontend
docker-compose up -d --no-deps backend frontend
health_check

echo "[rehearsal] step2 rollback to tag: $ROLLBACK_TAG"
set_tag "$ROLLBACK_TAG"
docker-compose pull backend frontend
docker-compose up -d --no-deps backend frontend
health_check

echo "[rehearsal] step3 switch back current tag: $CURRENT_TAG"
set_tag "$CURRENT_TAG"
docker-compose pull backend frontend
docker-compose up -d --no-deps backend frontend
health_check

echo "[rehearsal] done"
EOF
