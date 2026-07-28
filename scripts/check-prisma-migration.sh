#!/usr/bin/env bash
# Guard against invalid Prisma migrations and schema/migration drift like
# commit 7478f9b6, where schema.prisma was edited but no migration was
# generated to match.
#
# Rules:
#   1. MySQL identifiers in migration SQL must not exceed 64 characters.
#   2. If schema.prisma changed in this diff range, at least one new file
#      under prisma/migrations/ must also have changed.
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

LONG_IDENTIFIERS="$(
  while IFS= read -r migration_file; do
    LC_ALL=C awk -F '`' -v file="$migration_file" '
      {
        for (field = 2; field <= NF; field += 2) {
          if (length($field) > 64) {
            printf "%s:%d: %d characters: %s\n",
              file, NR, length($field), $field
          }
        }
      }
    ' "$migration_file"
  done < <(rg --files "$MIGRATIONS_DIR" -g 'migration.sql' | sort)
)"

if [[ -n "$LONG_IDENTIFIERS" ]]; then
  cat >&2 <<'MSG'
[prisma-check] FAILED: migration SQL contains MySQL identifiers longer than
64 characters. Add explicit short names, such as Prisma index `map` values.
MSG
  printf '%s\n' "$LONG_IDENTIFIERS" >&2
  exit 1
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
