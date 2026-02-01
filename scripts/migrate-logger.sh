#!/bin/bash
# Logger Migration Script
# 批量将 console.error 迁移到 logApiError
# 使用方法: chmod +x migrate-logger.sh && ./migrate-logger.sh

# 获取脚本所在目录的父目录(项目根目录)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 进入 backend 目录
cd "$PROJECT_ROOT/apps/backend" || exit

# 需要迁移的文件列表
FILES=(
  "api/qms/quality-loss/index.get.ts"
  "api/qms/quality-loss/summary.get.ts"
  "api/qms/quality-loss/index.post.ts"
  "api/qms/quality-loss/[id].put.ts"
  "api/qms/quality-loss/[id].delete.ts"
  "api/qms/workspace.get.ts"
  "api/qms/reports/summary.get.ts"
  "api/qms/reports/daily-summary.get.ts"
  "api/qms/reports/[id].put.ts"
  "api/qms/reports/[id].delete.ts"
  "api/qms/reports/index.get.ts"
  "api/qms/supplier/index.get.ts"
  "api/qms/supplier/index.post.ts"
  "api/qms/supplier/[id].put.ts"
  "api/qms/supplier/[id].delete.ts"
  "api/qms/supplier/import.post.ts"
  "api/qms/supplier/batch.post.ts"
  "api/qms/supplier/batch-delete.post.ts"
  "api/qms/knowledge/index.get.ts"
  "api/qms/knowledge/index.post.ts"
  "api/qms/knowledge/[id].get.ts"
  "api/qms/knowledge/[id].put.ts"
  "api/qms/knowledge/[id].delete.ts"
  "api/qms/knowledge/categories/index.get.ts"
  "api/qms/knowledge/categories/index.post.ts"
  "api/qms/knowledge/categories/[id].put.ts"
  "api/qms/knowledge/categories/[id].delete.ts"
  "api/qms/work-order/import.post.ts"
  "api/qms/task-dispatch/index.get.ts"
  "api/qms/task-dispatch/index.post.ts"
  "api/qms/task-dispatch/stats.get.ts"
  "api/qms/task-dispatch/[id]/status.put.ts"
  "api/qms/common/years.get.ts"
  "api/qms/ai/extract-tags.post.ts"
  "api/qms/ai/generate-itp.post.ts"
  "api/qms/quality-loss-trend.get.ts"
  "api/menu/all.ts"
)

echo "=== Logger Migration Script ==="
echo "Total files to process: ${#FILES[@]}"
echo ""

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    # 检查是否已经导入了 logApiError
    if ! grep -q "import.*logApiError" "$FILE"; then
      # 添加 import 语句
      if grep -q "from 'h3'" "$FILE"; then
        # 如果有 h3 import，在其后添加
        sed -i '' "/from 'h3'/a\\
import { logApiError } from '~/utils/api-logger';
" "$FILE"
      else
        # 否则在文件开头添加
        sed -i '' "1i\\
import { logApiError } from '~/utils/api-logger';
" "$FILE"
      fi
      echo "[+] Added import to: $FILE"
    fi

    # 替换 console.error 调用
    # 提取端点名称从文件路径
    ENDPOINT=$(basename "$FILE" .ts | sed 's/\[.*\]//g' | sed 's/\..*//g')
    if [ -z "$ENDPOINT" ] || [ "$ENDPOINT" = "index" ]; then
      ENDPOINT=$(dirname "$FILE" | xargs basename)
    fi

    # 替换 console.error
    if grep -q "console.error" "$FILE"; then
      sed -i '' "s/console.error([^)]*error[^)]*);/logApiError('$ENDPOINT', error);/g" "$FILE"
      echo "[*] Replaced console.error in: $FILE"
    fi
  else
    echo "[!] File not found: $FILE"
  fi
done

echo ""
echo "=== Migration Complete ==="
echo "Run 'pnpm run lint:fix' to format the code"
