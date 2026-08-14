#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TSX_BIN="${TSX_BIN:-$BACKEND_DIR/node_modules/.bin/tsx}"

cd "$BACKEND_DIR"

# The manifest records only release-specific, idempotent prerequisites. Its
# durable ledger skips completed tasks and retries interrupted or failed work.
exec "$TSX_BIN" scripts/run-release-maintenance.ts
