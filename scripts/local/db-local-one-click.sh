#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_COMPOSE_FILE="$ROOT_DIR/docker-compose.db.yml"
BACKEND_DIR="$ROOT_DIR/apps/backend"

echo "Starting local MySQL..."
docker compose -f "$DB_COMPOSE_FILE" up -d

echo "Waiting for MySQL to accept connections..."
for i in {1..60}; do
  if docker exec qms-mysql-local mysqladmin ping -h 127.0.0.1 -ppassword --silent >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec qms-mysql-local mysqladmin ping -h 127.0.0.1 -ppassword --silent >/dev/null 2>&1; then
  echo "MySQL did not become ready in time."
  exit 1
fi

export DATABASE_URL="mysql://qms:qms123456@127.0.0.1:3306/quality_guard"

echo "Applying Prisma schema..."
pnpm --dir "$BACKEND_DIR" run db:push

echo "Seeding database..."
pnpm --dir "$BACKEND_DIR" run db:seed

echo "Done."
echo "DATABASE_URL=$DATABASE_URL"
