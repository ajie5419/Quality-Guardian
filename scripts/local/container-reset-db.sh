#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=container-common.sh
source "$SCRIPT_DIR/container-common.sh"

require_container_cli
ensure_env_file
ensure_container_system
ensure_host_dns
ensure_mysql

remove_container_if_exists "$BACKEND_CONTAINER"

echo "Resetting Prisma database defined by $ENV_FILE"
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && /app/apps/backend/node_modules/.bin/prisma migrate reset --force --skip-generate --schema /app/apps/backend/prisma/schema.prisma"

echo "Running ordered release maintenance..."
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && sh scripts/run-release-maintenance.sh"

echo "Database reset finished."
