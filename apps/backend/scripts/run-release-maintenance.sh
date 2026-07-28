#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TSX_BIN="${TSX_BIN:-$BACKEND_DIR/node_modules/.bin/tsx}"

cd "$BACKEND_DIR"

"$TSX_BIN" scripts/backfill-role-page-permissions.ts --apply
"$TSX_BIN" scripts/reconcile-team-identities.ts --apply
"$TSX_BIN" scripts/backfill-inspection-issue-divisions.ts --apply
"$TSX_BIN" scripts/backfill-quality-record-supplier-identities.ts --apply
"$TSX_BIN" scripts/backfill-identity-relations.ts
"$TSX_BIN" scripts/backfill-inspection-request-categories.ts --apply
"$TSX_BIN" scripts/backfill-inspection-issue-responsibilities.ts --apply
"$TSX_BIN" scripts/backfill-quality-loss-index.ts
