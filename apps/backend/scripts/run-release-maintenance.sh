#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
TSX_BIN="${TSX_BIN:-$BACKEND_DIR/node_modules/.bin/tsx}"

cd "$BACKEND_DIR"

# Historical fact name snapshots are frozen. Every identity backfill below may
# create canonical IDs and audit evidence, but must never normalize a fact name.
"$TSX_BIN" scripts/backfill-role-page-permissions.ts --apply
"$TSX_BIN" scripts/reconcile-team-identities.ts --apply
TEAM_IDENTITY_MAINTENANCE_MODE=1 "$TSX_BIN" scripts/merge-confirmed-team-duplicates.ts --apply
"$TSX_BIN" scripts/backfill-inspection-issue-divisions.ts --apply
"$TSX_BIN" scripts/backfill-quality-record-supplier-identities.ts --apply
"$TSX_BIN" scripts/backfill-identity-relations.ts
"$TSX_BIN" scripts/bootstrap-pass-rate-identities.ts --apply
"$TSX_BIN" scripts/backfill-inspection-request-categories.ts --apply
"$TSX_BIN" scripts/backfill-inspection-request-process-options.ts --apply
"$TSX_BIN" scripts/backfill-inspection-issue-responsibilities.ts --apply
"$TSX_BIN" scripts/backfill-quality-classifications.ts --apply
"$TSX_BIN" scripts/historical-identity-sidecar-bootstrap.ts --apply --rebuild
"$TSX_BIN" scripts/classify-historical-identity-unresolved.ts --apply
"$TSX_BIN" scripts/bootstrap-master-data-identity-baseline.ts
"$TSX_BIN" scripts/process-pass-rate-projection-refresh.ts --apply
"$TSX_BIN" scripts/reconcile-pass-rate-identity-windows.ts --apply
"$TSX_BIN" scripts/reconcile-supplier-score-snapshots.ts
