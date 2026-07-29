#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=container-common.sh
source "$SCRIPT_DIR/container-common.sh"

require_container_cli
ensure_env_file
ensure_container_system
ensure_host_dns
ensure_uploads_dir
ensure_mysql
ensure_redis

cd "$ROOT_DIR"

remove_container_if_exists "$BACKEND_CONTAINER"
remove_container_if_exists "$FRONTEND_CONTAINER"

echo "Running database migrations..."
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "/app/apps/backend/node_modules/.bin/prisma migrate deploy --schema /app/apps/backend/prisma/schema.prisma"

echo "Running ordered release maintenance..."
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && sh scripts/run-release-maintenance.sh"

echo "Starting backend: $BACKEND_CONTAINER"
container run -d \
  --name "$BACKEND_CONTAINER" \
  --env-file "$ENV_FILE" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -p "127.0.0.1:${BACKEND_PORT}:3000" \
  -v "${UPLOADS_DIR}:/app/uploads" \
  "$BACKEND_IMAGE"

echo "Waiting for backend health..."
for _ in {1..60}; do
  if curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/status" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://127.0.0.1:${BACKEND_PORT}/api/status" >/dev/null 2>&1; then
  echo "Backend healthcheck failed. Recent backend logs:"
  container logs "$BACKEND_CONTAINER" || true
  exit 1
fi

echo "Starting frontend: $FRONTEND_CONTAINER"
container run -d \
  --name "$FRONTEND_CONTAINER" \
  -p "127.0.0.1:${FRONTEND_PORT}:80" \
  --mount "type=bind,source=$ROOT_DIR/apps/web-antd/nginx.container-local.conf,target=/etc/nginx/conf.d/default.conf,readonly" \
  "$FRONTEND_IMAGE"

echo "Waiting for frontend health..."
for _ in {1..30}; do
  if curl -sf "http://127.0.0.1:${FRONTEND_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://127.0.0.1:${FRONTEND_PORT}/health" >/dev/null 2>&1; then
  echo "Frontend healthcheck failed. Recent frontend logs:"
  container logs "$FRONTEND_CONTAINER" || true
  exit 1
fi

echo "Local apple/container stack is ready."
echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Backend:  http://127.0.0.1:${BACKEND_PORT}/api/status"
