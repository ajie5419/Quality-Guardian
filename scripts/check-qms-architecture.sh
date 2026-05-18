#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QMS_VIEWS_DIR="$ROOT_DIR/apps/web-antd/src/views/qms"
MAX_INDEX_LINES=500
BASELINE_FILE="${QMS_ARCH_BASELINE:-$ROOT_DIR/scripts/qms-architecture-baseline.txt}"
SCOPE="${QMS_ARCH_SCOPE:-changed}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

violations=0
baseline_hits=0
declare -a TARGET_FILES=()

usage() {
  cat <<'USAGE'
Usage: check-qms-architecture.sh [--changed|--all]

Rules:
  R1: no direct requestClient usage under apps/web-antd/src/views/qms
  R3: index.vue must not exceed the line threshold

Modes:
  --changed  Check changed files only, including committed diff, staged changes,
             unstaged changes, and untracked files. This is the default.
  --all      Check all tracked QMS view files against the baseline.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --all)
      SCOPE="all"
      ;;
    --changed)
      SCOPE="changed"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument:${NC} $arg"
      usage
      exit 2
      ;;
  esac
done

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
  if [[ "$SCOPE" == "all" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && TARGET_FILES+=("$line")
    done < <(
      git -C "$ROOT_DIR" ls-files \
        "apps/web-antd/src/views/qms/**/*.vue" \
        "apps/web-antd/src/views/qms/**/*.ts" \
        "apps/web-antd/src/views/qms/**/*.tsx" \
        "apps/web-antd/src/views/qms/**/*.js" \
        "apps/web-antd/src/views/qms/**/*.jsx" \
        | sed "s#^#$ROOT_DIR/#" \
        | sort
    )
    echo "scope: all tracked files"
    return 0
  fi

  if base_ref="$(resolve_base_ref)"; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && TARGET_FILES+=("$line")
    done < <(
      {
        git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR "$base_ref"...HEAD -- \
          "apps/web-antd/src/views/qms/**/*.vue" \
          "apps/web-antd/src/views/qms/**/*.ts" \
          "apps/web-antd/src/views/qms/**/*.tsx" \
          "apps/web-antd/src/views/qms/**/*.js" \
          "apps/web-antd/src/views/qms/**/*.jsx"
        git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR -- \
          "apps/web-antd/src/views/qms/**/*.vue" \
          "apps/web-antd/src/views/qms/**/*.ts" \
          "apps/web-antd/src/views/qms/**/*.tsx" \
          "apps/web-antd/src/views/qms/**/*.js" \
          "apps/web-antd/src/views/qms/**/*.jsx"
        git -C "$ROOT_DIR" diff --cached --name-only --diff-filter=ACMR -- \
          "apps/web-antd/src/views/qms/**/*.vue" \
          "apps/web-antd/src/views/qms/**/*.ts" \
          "apps/web-antd/src/views/qms/**/*.tsx" \
          "apps/web-antd/src/views/qms/**/*.js" \
          "apps/web-antd/src/views/qms/**/*.jsx"
        git -C "$ROOT_DIR" ls-files --others --exclude-standard -- \
          "apps/web-antd/src/views/qms/**/*.vue" \
          "apps/web-antd/src/views/qms/**/*.ts" \
          "apps/web-antd/src/views/qms/**/*.tsx" \
          "apps/web-antd/src/views/qms/**/*.js" \
          "apps/web-antd/src/views/qms/**/*.jsx"
      } \
        | sed "s#^#$ROOT_DIR/#" \
        | sort -u
    )
    echo "scope: changed files"
    echo "base ref: $base_ref"
    return 0
  fi

  # Fallback: local unstaged/staged/untracked changes under views/qms
  while IFS= read -r line; do
    [[ -n "$line" ]] && TARGET_FILES+=("$line")
  done < <(
    {
      git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR -- \
        "apps/web-antd/src/views/qms/**/*.vue" \
        "apps/web-antd/src/views/qms/**/*.ts" \
        "apps/web-antd/src/views/qms/**/*.tsx" \
        "apps/web-antd/src/views/qms/**/*.js" \
        "apps/web-antd/src/views/qms/**/*.jsx"
      git -C "$ROOT_DIR" diff --cached --name-only --diff-filter=ACMR -- \
        "apps/web-antd/src/views/qms/**/*.vue" \
        "apps/web-antd/src/views/qms/**/*.ts" \
        "apps/web-antd/src/views/qms/**/*.tsx" \
        "apps/web-antd/src/views/qms/**/*.js" \
        "apps/web-antd/src/views/qms/**/*.jsx"
      git -C "$ROOT_DIR" ls-files --others --exclude-standard -- \
        "apps/web-antd/src/views/qms/**/*.vue" \
        "apps/web-antd/src/views/qms/**/*.ts" \
        "apps/web-antd/src/views/qms/**/*.tsx" \
        "apps/web-antd/src/views/qms/**/*.js" \
        "apps/web-antd/src/views/qms/**/*.jsx"
    } \
      | sed "s#^#$ROOT_DIR/#" \
      | sort -u
  )
  echo "scope: changed files"
  echo "base ref: <not found, fallback to local diff>"
}

to_repo_path() {
  local file="$1"
  printf '%s' "${file#"$ROOT_DIR"/}"
}

baseline_has_r1() {
  local repo_path="$1"
  [[ -f "$BASELINE_FILE" ]] && grep -Fxq "R1|$repo_path" "$BASELINE_FILE"
}

baseline_r3_limit() {
  local repo_path="$1"
  [[ -f "$BASELINE_FILE" ]] || return 1
  awk -F'|' -v path="$repo_path" '$1 == "R3" && $2 == path { print $3; found = 1 } END { if (!found) exit 1 }' "$BASELINE_FILE"
}

echo "QMS architecture check"
echo "views dir: $QMS_VIEWS_DIR"
echo "rules: no requestClient in views, index.vue <= $MAX_INDEX_LINES lines"
echo "baseline: $BASELINE_FILE"
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
    repo_path="$(to_repo_path "$file")"
    if baseline_has_r1 "$repo_path"; then
      echo -e "${YELLOW}Baseline R1:${NC} $repo_path"
      baseline_hits=$((baseline_hits + 1))
    else
      echo -e "${RED}Violation R1:${NC} $repo_path"
      sed 's/^/  /' /tmp/qms_arch_tmp_grep.txt
      violations=$((violations + 1))
    fi
  fi
done

echo
echo "[R3] Check index.vue line limits..."
for index_file in "${TARGET_FILES[@]}"; do
  [[ -f "$index_file" ]] || continue
  [[ "$index_file" == */index.vue ]] || continue
  lines="$(wc -l <"$index_file" | tr -d ' ')"
  if (( lines > MAX_INDEX_LINES )); then
    repo_path="$(to_repo_path "$index_file")"
    baseline_limit=''
    if baseline_limit="$(baseline_r3_limit "$repo_path")" && (( lines <= baseline_limit )); then
      echo -e "${YELLOW}Baseline R3:${NC} $repo_path ($lines lines, baseline <= $baseline_limit)"
      baseline_hits=$((baseline_hits + 1))
    else
      if [[ -n "$baseline_limit" ]]; then
        echo -e "${RED}Violation R3:${NC} $repo_path ($lines lines > baseline $baseline_limit)"
      else
        echo -e "${RED}Violation R3:${NC} $repo_path ($lines lines > $MAX_INDEX_LINES)"
      fi
      violations=$((violations + 1))
    fi
  fi
done

rm -f /tmp/qms_arch_tmp_grep.txt

echo
if (( violations > 0 )); then
  echo -e "${RED}QMS architecture check failed.${NC} violations=$violations baseline=$baseline_hits"
  exit 1
fi

echo -e "${GREEN}QMS architecture check passed.${NC} baseline=$baseline_hits"
