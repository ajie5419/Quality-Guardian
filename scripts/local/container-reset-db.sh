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

echo "Resetting Prisma database defined by $ENV_FILE"
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && /app/apps/backend/node_modules/.bin/prisma migrate reset --force --skip-generate --schema /app/apps/backend/prisma/schema.prisma"

echo "Bootstrapping canonical TEAM dictionaries..."
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && /app/apps/backend/node_modules/.bin/tsx scripts/bootstrap-team-dictionaries.ts --apply"

echo "Backfilling inspection issue divisions..."
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && /app/apps/backend/node_modules/.bin/tsx scripts/backfill-inspection-issue-divisions.ts --apply"

echo "Backfilling supplier identities..."
container run --rm \
  --env-file "$ENV_FILE" \
  "$BACKEND_IMAGE" \
  sh -lc "cd /app/apps/backend && /app/apps/backend/node_modules/.bin/tsx scripts/backfill-quality-record-supplier-identities.ts --apply"

echo "Database reset finished."
