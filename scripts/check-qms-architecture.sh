#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QMS_VIEWS_DIR="$ROOT_DIR/apps/web-antd/src/views/qms"
MAX_INDEX_LINES=500

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

violations=0
declare -a TARGET_FILES=()

resolve_base_ref() {
  if [[ -n "${BASE_REF:-}" ]]; then
    printf '%s' "$BASE_REF"
    return 0
  fi

  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    printf 'origin/%s' "$GITHUB_BASE_REF"
    return 0
  fi

  if git -C "$ROOT_DIR" rev-parse --verify origin/main >/dev/null 2>&1; then
    printf 'origin/main'
    return 0
  fi

  return 1
}

collect_target_files() {
  local base_ref=''
  TARGET_FILES=()
  if base_ref="$(resolve_base_ref)"; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && TARGET_FILES+=("$line")
    done < <(
      git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR "$base_ref"...HEAD -- \
        "apps/web-antd/src/views/qms/**/*.vue" \
        "apps/web-antd/src/views/qms/**/*.ts" \
        "apps/web-antd/src/views/qms/**/*.tsx" \
        "apps/web-antd/src/views/qms/**/*.js" \
        "apps/web-antd/src/views/qms/**/*.jsx" \
        | sed "s#^#$ROOT_DIR/#" \
        | sort
    )
    echo "base ref: $base_ref"
    return 0
  fi

  # Fallback: local unstaged/staged changes under views/qms
  while IFS= read -r line; do
    [[ -n "$line" ]] && TARGET_FILES+=("$line")
  done < <(
    git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR -- \
      "apps/web-antd/src/views/qms/**/*.vue" \
      "apps/web-antd/src/views/qms/**/*.ts" \
      "apps/web-antd/src/views/qms/**/*.tsx" \
      "apps/web-antd/src/views/qms/**/*.js" \
      "apps/web-antd/src/views/qms/**/*.jsx" \
      | sed "s#^#$ROOT_DIR/#" \
      | sort
  )
  echo "base ref: <not found, fallback to local diff>"
}

echo "QMS architecture check"
echo "views dir: $QMS_VIEWS_DIR"
echo "rules (changed files only): no requestClient in views, index.vue <= $MAX_INDEX_LINES lines"
echo

if [[ ! -d "$QMS_VIEWS_DIR" ]]; then
  echo -e "${YELLOW}Skip: directory not found: $QMS_VIEWS_DIR${NC}"
  exit 0
fi

collect_target_files
echo "target files: ${#TARGET_FILES[@]}"
echo

if (( ${#TARGET_FILES[@]} == 0 )); then
  echo -e "${GREEN}No changed files under views/qms. Skip.${NC}"
  exit 0
fi

echo "[R1] Scan for direct requestClient usage under views/qms..."
for file in "${TARGET_FILES[@]}"; do
  [[ -f "$file" ]] || continue
  if grep -nE '\brequestClient\s*\.' "$file" >/tmp/qms_arch_tmp_grep.txt; then
    echo -e "${RED}Violation R1:${NC} $file"
    sed 's/^/  /' /tmp/qms_arch_tmp_grep.txt
    violations=$((violations + 1))
  fi
done

echo
echo "[R3] Check index.vue line limits..."
for index_file in "${TARGET_FILES[@]}"; do
  [[ -f "$index_file" ]] || continue
  [[ "$index_file" == */index.vue ]] || continue
  lines="$(wc -l <"$index_file" | tr -d ' ')"
  if (( lines > MAX_INDEX_LINES )); then
    echo -e "${RED}Violation R3:${NC} $index_file ($lines lines > $MAX_INDEX_LINES)"
    violations=$((violations + 1))
  fi
done

rm -f /tmp/qms_arch_tmp_grep.txt

echo
if (( violations > 0 )); then
  echo -e "${RED}QMS architecture check failed.${NC} violations=$violations"
  exit 1
fi

echo -e "${GREEN}QMS architecture check passed.${NC}"
