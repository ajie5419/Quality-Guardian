#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo '=== Step 1: Apply database migration ==='
pnpm --dir apps/backend exec prisma migrate deploy

echo '=== Step 2: Seed dictionary data (defect_type/defect_subtype/team) ==='
npx tsx apps/backend/scripts/seed-master-data-dictionaries.ts

echo '=== Step 3: Backfill processId from processName ==='
npx tsx apps/backend/scripts/backfill-process-id.ts

echo '=== Phase 2 deployment complete ==='
