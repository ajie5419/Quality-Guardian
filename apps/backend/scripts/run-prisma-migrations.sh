#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
APP_DIR="$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)"
PRISMA_BIN="${PRISMA_BIN:-$APP_DIR/node_modules/.bin/prisma}"
PRISMA_SCHEMA="${PRISMA_SCHEMA:-$APP_DIR/prisma/schema.prisma}"
TSX_BIN="${TSX_BIN:-$APP_DIR/node_modules/.bin/tsx}"

"$TSX_BIN" "$SCRIPT_DIR/inspection-request-responsibility-migration-recovery.ts" \
  --apply \
  --prisma-bin "$PRISMA_BIN" \
  --schema "$PRISMA_SCHEMA"

exec "$PRISMA_BIN" migrate deploy --schema "$PRISMA_SCHEMA"
