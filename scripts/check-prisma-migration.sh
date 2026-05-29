#!/usr/bin/env bash
# Guard against schema/migration drift like commit 7478f9b6, where
# schema.prisma was edited but no migration was generated to match.
#
# Rule: if schema.prisma changed in this diff range, at least one new file
# under prisma/migrations/ must also have changed. Otherwise fail.
#
# Usage: bash scripts/check-prisma-migration.sh [BASE_REF]
#   BASE_REF defaults to origin/main (CI) or main (local).
set -euo pipefail

SCHEMA_PATH="apps/backend/prisma/schema.prisma"
MIGRATIONS_DIR="apps/backend/prisma/migrations"

BASE_REF="${1:-}"
if [[ -z "$BASE_REF" ]]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_REF="origin/main"
  else
    BASE_REF="main"
  fi
fi

# Merge-base so we only look at what THIS branch changed.
if ! MERGE_BASE="$(git merge-base "$BASE_REF" HEAD 2>/dev/null)"; then
  echo "[prisma-check] cannot resolve merge-base with $BASE_REF; skipping."
  exit 0
fi

CHANGED="$(git diff --name-only "$MERGE_BASE" HEAD)"

if ! grep -qx "$SCHEMA_PATH" <<<"$CHANGED"; then
  echo "[prisma-check] schema.prisma unchanged — OK."
  exit 0
fi

if grep -qE "^${MIGRATIONS_DIR}/.+/migration\.sql$" <<<"$CHANGED"; then
  echo "[prisma-check] schema.prisma changed AND a migration was added — OK."
  exit 0
fi

cat >&2 <<'MSG'
[prisma-check] FAILED: schema.prisma changed but no migration was added.

You edited apps/backend/prisma/schema.prisma without generating a matching
migration. Applying this to production leaves the DB out of sync with the
schema (exactly the roles.permissions incident).

Fix: generate a migration so schema and DB stay in lockstep:
  pnpm --filter @qgs/backend exec prisma migrate dev --name <describe_change>

Then commit the new files under apps/backend/prisma/migrations/.
MSG
exit 1
