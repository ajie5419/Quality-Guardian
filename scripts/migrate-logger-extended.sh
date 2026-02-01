#!/bin/bash
# Logger Migration Script - Extended
# 批量将剩余 console.error 迁移到 logApiError

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT/apps/backend" || exit

FILES=(
  # Auth
  "api/auth/codes.ts"
  "api/auth/departments.get.ts"
  # Uploads
  "api/uploads/[filename].get.ts"
  # User
  "api/user/info.ts"
  # System - Role
  "api/system/role/[id].delete.ts"
  "api/system/role/permission-tree.get.ts"
  "api/system/role/index.post.ts"
  "api/system/role/[id].put.ts"
  "api/system/role/list.get.ts"
  # System - AI Settings
  "api/system/ai-settings/test.post.ts"
  "api/system/ai-settings/index.get.ts"
  # System - User
  "api/system/user/[id].delete.ts"
  "api/system/user/index.post.ts"
  "api/system/user/[id].put.ts"
  "api/system/user/list.get.ts"
  # System - Menu
  "api/system/menu/[id].delete.ts"
  "api/system/menu/index.post.ts"
  "api/system/menu/[id].put.ts"
  "api/system/menu/list.get.ts"
  # System - Dept
  "api/system/dept/[id].delete.ts"
  "api/system/dept/index.post.ts"
  "api/system/dept/[id].put.ts"
  "api/system/dept/list.get.ts"
  # AI
  "api/ai/generate-report.post.ts"
  "api/ai/match-cases.post.ts"
  "api/ai/analyze.post.ts"
  # QMS - After Sales
  "api/qms/after-sales/[id].delete.ts"
  "api/qms/after-sales/index.post.ts"
  "api/qms/after-sales/[id].put.ts"
  "api/qms/after-sales/batch-delete.post.ts"
  "api/qms/after-sales/import.post.ts"
  # QMS - Work Order
  "api/qms/work-order/[id].delete.ts"
  "api/qms/work-order/index.get.ts"
  "api/qms/work-order/index.post.ts"
  "api/qms/work-order/[id].put.ts"
  "api/qms/work-order/batch-delete.post.ts"
  # QMS - Planning DFMEA
  "api/qms/planning/dfmea/[id].delete.ts"
  "api/qms/planning/dfmea/index.get.ts"
  "api/qms/planning/dfmea/index.post.ts"
  "api/qms/planning/dfmea/projects/[id].delete.ts"
  "api/qms/planning/dfmea/projects/index.post.ts"
  "api/qms/planning/dfmea/projects/[id].put.ts"
  "api/qms/planning/dfmea/projects/[id]/stats.get.ts"
  "api/qms/planning/dfmea/[id].put.ts"
  "api/qms/planning/dfmea/tree.get.ts"
  # QMS - Planning BOM
  "api/qms/planning/bom/[id].delete.ts"
  "api/qms/planning/bom/index.get.ts"
  "api/qms/planning/bom/index.post.ts"
  "api/qms/planning/bom/projects/[id].delete.ts"
  "api/qms/planning/bom/projects/index.get.ts"
  "api/qms/planning/bom/projects/index.post.ts"
  "api/qms/planning/bom/[id].put.ts"
  "api/qms/planning/bom/tree.get.ts"
  # QMS - Planning Project Docs
  "api/qms/planning/project-docs/projects/index.get.ts"
  "api/qms/planning/project-docs/projects/index.post.ts"
  # QMS - Planning ITP
  "api/qms/planning/itp/[id].delete.ts"
  "api/qms/planning/itp/index.get.ts"
  "api/qms/planning/itp/index.post.ts"
  "api/qms/planning/itp/projects/[id].delete.ts"
  "api/qms/planning/itp/projects/index.get.ts"
  "api/qms/planning/itp/projects/index.post.ts"
  "api/qms/planning/itp/projects/[id].put.ts"
  "api/qms/planning/itp/[id].put.ts"
  "api/qms/planning/itp/tree.get.ts"
  "api/qms/planning/itp/import.post.ts"
  # QMS - Inspection
  "api/qms/inspection/records/import.post.ts"
  "api/qms/inspection/issues/[id].delete.ts"
  "api/qms/inspection/issues/nc-number.get.ts"
  "api/qms/inspection/issues/index.get.ts"
  "api/qms/inspection/issues/index.post.ts"
  "api/qms/inspection/issues/[id].put.ts"
  "api/qms/inspection/issues/batch-delete.post.ts"
  "api/qms/inspection/issues/import.post.ts"
  "api/qms/inspection/issues/stats.get.ts"
  # QMS - Others
  "api/qms/vehicle-failure-rate.get.ts"
  "api/qms/pass-rate-trend.get.ts"
)

echo "=== Extended Logger Migration ==="
echo "Files to process: ${#FILES[@]}"
echo ""

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    if ! grep -q "import.*logApiError" "$FILE"; then
      if grep -q "from 'h3'" "$FILE"; then
        sed -i '' "/from 'h3'/a\\
import { logApiError } from '~/utils/api-logger';
" "$FILE"
      else
        sed -i '' "1i\\
import { logApiError } from '~/utils/api-logger';
" "$FILE"
      fi
      echo "[+] Added import: $FILE"
    fi

    ENDPOINT=$(basename "$FILE" .ts | sed 's/\[.*\]//g' | sed 's/\..*//g')
    if [ -z "$ENDPOINT" ] || [ "$ENDPOINT" = "index" ]; then
      ENDPOINT=$(dirname "$FILE" | xargs basename)
    fi

    if grep -q "console.error" "$FILE"; then
      sed -i '' "s/console.error([^)]*error[^)]*);/logApiError('$ENDPOINT', error);/g" "$FILE"
      echo "[*] Replaced: $FILE"
    fi
  fi
done

echo ""
echo "=== Done ==="
