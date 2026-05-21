#!/bin/bash
set -e

echo '=== Step 1: Apply database migration ==='
npx prisma migrate deploy

echo '=== Step 2: Seed dictionary data (defect_type/defect_subtype/team) ==='
npx tsx apps/backend/scripts/seed-master-data-dictionaries.ts

echo '=== Step 3: Backfill processId from processName ==='
npx tsx apps/backend/scripts/backfill-process-id.ts

echo '=== Phase 2 deployment complete ==='
