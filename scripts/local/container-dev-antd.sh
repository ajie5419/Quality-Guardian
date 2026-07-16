#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=container-common.sh
source "$SCRIPT_DIR/container-common.sh"

require_container_cli
ensure_container_system
ensure_host_port_free 5320 "backend dev API used by web-antd proxy"
ensure_mysql
ensure_redis

cd "$ROOT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# container env files use host.container.internal for in-container runtime.
# This script runs Prisma and Nitro dev on the host, so force localhost ports.
export DATABASE_URL="mysql://$MYSQL_USER:$MYSQL_PASSWORD@127.0.0.1:${MYSQL_PORT}/$MYSQL_DATABASE"
export REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
export REDIS_ENABLED="${REDIS_ENABLED:-true}"
export REDIS_OPTIONAL="${REDIS_OPTIONAL:-true}"
export WX_APPID="${WX_APPID:-dev-local-wx-appid}"
export WX_APP_SECRET="${WX_APP_SECRET:-dev-local-wx-app-secret}"
export WX_SESSION_SECRET="${WX_SESSION_SECRET:-dev-local-wx-session-secret-32-bytes}"

echo "apple/container dependencies are ready."
echo "MySQL: 127.0.0.1:${MYSQL_PORT}/${MYSQL_DATABASE}"
echo "Redis: 127.0.0.1:${REDIS_PORT}"
echo "Running database migrations..."
pnpm --dir apps/backend exec prisma migrate deploy --schema prisma/schema.prisma

USER_COUNT="$(pnpm --dir apps/backend exec node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.users.count().then((count)=>{console.log(count);}).finally(()=>p.\$disconnect());")"

if [[ "${CONTAINER_DEV_SEED:-false}" == "true" || "$USER_COUNT" == "0" ]]; then
  echo "Seeding local container database..."
  pnpm --dir apps/backend run db:seed
fi

echo "Bootstrapping canonical TEAM dictionaries..."
pnpm --dir apps/backend exec tsx scripts/bootstrap-team-dictionaries.ts --apply

echo "Backfilling supplier identities..."
pnpm --dir apps/backend exec tsx scripts/backfill-quality-record-supplier-identities.ts --apply

echo "Starting pnpm dev:antd..."

export NODE_ENV=development

pnpm dev:antd
