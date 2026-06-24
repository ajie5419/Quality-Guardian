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

export DATABASE_URL="${DATABASE_URL:-mysql://$MYSQL_USER:$MYSQL_PASSWORD@127.0.0.1:${MYSQL_PORT}/$MYSQL_DATABASE}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:${REDIS_PORT}}"
export REDIS_ENABLED="${REDIS_ENABLED:-true}"
export REDIS_OPTIONAL="${REDIS_OPTIONAL:-true}"

echo "apple/container dependencies are ready."
echo "MySQL: 127.0.0.1:${MYSQL_PORT}/${MYSQL_DATABASE}"
echo "Redis: 127.0.0.1:${REDIS_PORT}"
echo "Synchronizing Prisma schema..."
pnpm --dir apps/backend exec prisma db push --schema prisma/schema.prisma

USER_COUNT="$(pnpm --dir apps/backend exec node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.users.count().then((count)=>{console.log(count);}).finally(()=>p.\$disconnect());")"

if [[ "${CONTAINER_DEV_SEED:-false}" == "true" || "$USER_COUNT" == "0" ]]; then
  echo "Seeding local container database..."
  pnpm --dir apps/backend run db:seed
fi

echo "Starting pnpm dev:antd..."

pnpm dev:antd
