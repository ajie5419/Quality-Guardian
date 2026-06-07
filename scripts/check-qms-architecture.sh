#!/usr/bin/env bash
# Quality Guardian Architecture Check v2 — phase 8 step 40

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QMS_VIEWS_DIR="$ROOT_DIR/apps/web-antd/src/views/qms"
BACKEND_DIR="$ROOT_DIR/apps/backend"
MAX_INDEX_LINES=500
BASELINE_FILE="${QMS_ARCH_BASELINE:-$ROOT_DIR/scripts/qms-architecture-baseline.txt}"
SCOPE="${QMS_ARCH_SCOPE:-changed}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TMP_DIR="${TMPDIR:-/tmp}/qms-arch-check.$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

violations=0
baseline_hits=0
declare -a violated_rules=()
declare -a QMS_VIEW_TARGETS=()
declare -a API_TS_TARGETS=()
declare -a MODULE_TS_TARGETS=()
declare -a REPO_TS_TARGETS=()
declare -a BACKEND_TEST_TARGETS=()

usage() {
  cat <<'USAGE'
Usage: check-qms-architecture.sh [--changed|--all]

Rules:
  R1: no direct requestClient usage under apps/web-antd/src/views/qms
  R3: index.vue must not exceed the line threshold
  B-D1: backend legacy architecture directories must not exist
  B-R1: api/ files must not import prisma directly
  B-R2: api/ files must stay thin
  B-R3: api/ files must not bypass request body typing
  B-S2: modules/ files must not cast Prisma delegates to any
  B-S3: modules/ files must not use execSync
  B-SEC1: raw SQL must not combine $queryRawUnsafe with template strings
  B-MAP1: new module/route/view directories must update code_map.md (changed mode only)
  B-TEST1: backend tests must not live in centralized __tests__/tests/test directories
  B-TEST2: backend test files must have a sibling source file (orphan tests forbidden)
  B-TEST3: tests importing ~/utils/prisma must also vi.mock it

Modes:
  --changed  Check changed files only, including committed diff, staged changes,
             unstaged changes, and untracked files. This is the default.
  --all      Check all tracked files for enabled rules.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --)
      ;;
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

  if [[ -n "${GITHUB_BASE_REF:-}" ]] &&
    git -C "$ROOT_DIR" rev-parse --verify "origin/$GITHUB_BASE_REF" >/dev/null 2>&1; then
    printf 'origin/%s' "$GITHUB_BASE_REF"
    return 0
  fi

  if git -C "$ROOT_DIR" rev-parse --verify origin/main >/dev/null 2>&1; then
    printf 'origin/main'
    return 0
  fi

  return 1
}

to_repo_path() {
  local file="$1"
  printf '%s' "${file#"$ROOT_DIR"/}"
}

absolute_path() {
  local file="$1"
  if [[ "$file" == "$ROOT_DIR/"* ]]; then
    printf '%s\n' "$file"
  else
    printf '%s/%s\n' "$ROOT_DIR" "$file"
  fi
}

mark_rule_violation() {
  local rule="$1"
  local existing=''

  if (( ${#violated_rules[@]} > 0 )); then
    for existing in "${violated_rules[@]}"; do
      [[ "$existing" == "$rule" ]] && return 0
    done
  fi

  violated_rules+=("$rule")
}

report_violation() {
  local rule="$1"
  local location="$2"
  local message="$3"

  printf '[%s] %s  %s\n' "$rule" "$location" "$message"
  violations=$((violations + 1))
  mark_rule_violation "$rule"
}

collect_changed_files() {
  local output_file="$1"
  local base_ref=''

  : >"$output_file"

  if base_ref="$(resolve_base_ref)"; then
    git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR "$base_ref"...HEAD >>"$output_file"
  fi

  git -C "$ROOT_DIR" diff --name-only --diff-filter=ACMR >>"$output_file"
  git -C "$ROOT_DIR" diff --cached --name-only --diff-filter=ACMR >>"$output_file"
  git -C "$ROOT_DIR" ls-files --others --exclude-standard >>"$output_file"
  sort -u "$output_file" -o "$output_file"
}

collect_targets() {
  local output_file="$1"
  local pattern="$2"
  local changed_file="$TMP_DIR/changed-files.txt"

  : >"$output_file"

  if [[ "$SCOPE" == "all" ]]; then
    git -C "$ROOT_DIR" ls-files | grep -E "$pattern" | while IFS= read -r file; do
      absolute_path "$file"
    done >"$output_file" || true
    return 0
  fi

  collect_changed_files "$changed_file"
  grep -E "$pattern" "$changed_file" | while IFS= read -r file; do
    absolute_path "$file"
  done >"$output_file" || true
}

load_targets() {
  local file=''

  collect_targets "$TMP_DIR/qms-view-targets.txt" '^apps/web-antd/src/views/qms/.*\.(vue|ts|tsx|js|jsx)$'
  collect_targets "$TMP_DIR/api-ts-targets.txt" '^apps/backend/api/.*\.ts$'
  collect_targets "$TMP_DIR/module-ts-targets.txt" '^apps/backend/modules/.*\.ts$'
  collect_targets "$TMP_DIR/repo-ts-targets.txt" '.*\.ts$'
  collect_targets "$TMP_DIR/backend-test-targets.txt" '^apps/backend/.*\.test\.ts$'

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && QMS_VIEW_TARGETS+=("$file")
  done <"$TMP_DIR/qms-view-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && API_TS_TARGETS+=("$file")
  done <"$TMP_DIR/api-ts-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && MODULE_TS_TARGETS+=("$file")
  done <"$TMP_DIR/module-ts-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && REPO_TS_TARGETS+=("$file")
  done <"$TMP_DIR/repo-ts-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && BACKEND_TEST_TARGETS+=("$file")
  done <"$TMP_DIR/backend-test-targets.txt"
}

baseline_r3_limit() {
  local repo_path="$1"
  [[ -f "$BASELINE_FILE" ]] || return 1
  awk -F'|' -v path="$repo_path" '$1 == "R3" && $2 == path { print $3; found = 1 } END { if (!found) exit 1 }' "$BASELINE_FILE"
}

baseline_has_test2() {
  local repo_path="$1"
  [[ -f "$BASELINE_FILE" ]] || return 1
  awk -F'|' -v path="$repo_path" '$1 == "B-TEST2" && $2 == path { found = 1 } END { exit !found }' "$BASELINE_FILE"
}

grep_rule() {
  local rule="$1"
  local message="$2"
  local pattern="$3"
  shift 3
  local file=''
  local match=''
  local repo_path=''

  for file in "$@"; do
    [[ -f "$file" ]] || continue
    while IFS= read -r match; do
      [[ -n "$match" ]] || continue
      repo_path="$(to_repo_path "$file")"
      report_violation "$rule" "$repo_path:$match" "$message"
    done < <(grep -nE "$pattern" "$file" || true)
  done
}

count_lines_violation() {
  local rule="$1"
  local file="$2"
  local max_lines="$3"
  local message="$4"
  local lines=''
  local repo_path=''

  [[ -f "$file" ]] || return 0
  lines="$(wc -l <"$file" | tr -d ' ')"
  if (( lines > max_lines )); then
    repo_path="$(to_repo_path "$file")"
    report_violation "$rule" "$repo_path:$lines" "$message"
  fi
}

check_r1() {
  (( ${#QMS_VIEW_TARGETS[@]} == 0 )) && return 0
  grep_rule "R1" "Do not call requestClient directly from qms views." '\brequestClient[[:space:]]*\.' "${QMS_VIEW_TARGETS[@]}"
}

check_r3() {
  local index_file=''
  local lines=''
  local repo_path=''
  local baseline_limit=''

  (( ${#QMS_VIEW_TARGETS[@]} == 0 )) && return 0
  for index_file in "${QMS_VIEW_TARGETS[@]}"; do
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
          report_violation "R3" "$repo_path:$lines" "index.vue exceeds baseline $baseline_limit lines."
        else
          report_violation "R3" "$repo_path:$lines" "index.vue exceeds $MAX_INDEX_LINES lines."
        fi
      fi
    fi
  done
}

check_b_d1() {
  local dir=''

  for dir in \
    "$BACKEND_DIR/services" \
    "$BACKEND_DIR/core/module-registry" \
    "$BACKEND_DIR/core/master-data"; do
    if [[ -d "$dir" ]]; then
      report_violation "B-D1" "$(to_repo_path "$dir"):1" "Legacy backend architecture directory must not exist."
    fi
  done
}

check_b_r1() {
  (( ${#API_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-R1" "API files must not import Prisma directly." "import[[:space:]].*from[[:space:]]+['\"](~/?|/)?utils/prisma['\"]|from[[:space:]]+['\"]prisma['\"]|import[[:space:]]+prisma" "${API_TS_TARGETS[@]}"
}

check_b_r2() {
  local file=''
  local repo_path=''
  local max_lines=50

  (( ${#API_TS_TARGETS[@]} == 0 )) && return 0
  for file in "${API_TS_TARGETS[@]}"; do
    repo_path="$(to_repo_path "$file")"
    max_lines=50
    [[ "$repo_path" == "apps/backend/api/menu/all.ts" ]] && max_lines=80
    count_lines_violation "B-R2" "$file" "$max_lines" "API route file exceeds $max_lines lines."
  done
}

check_b_r3() {
  (( ${#API_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-R3" "API files must use validated request types instead of unsafe casts." 'as Record<string, unknown>| as any' "${API_TS_TARGETS[@]}"
}

check_b_s2() {
  (( ${#MODULE_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-S2" "Prisma delegate casts to any are not allowed in modules." '\(prisma\.[a-zA-Z_]+ as any\)' "${MODULE_TS_TARGETS[@]}"
}

check_b_s3() {
  (( ${#MODULE_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-S3" "Use async process execution instead of execSync." 'execSync' "${MODULE_TS_TARGETS[@]}"
}

check_b_sec1() {
  (( ${#REPO_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-SEC1" "Do not combine queryRawUnsafe with template strings." '\$queryRawUnsafe.*`' "${REPO_TS_TARGETS[@]}"
}

# B-MAP1: new business module / top-level route / view directories require code_map.md update.
# Only meaningful in --changed mode (need a base ref to compare directory listings).
check_b_map1() {
  [[ "$SCOPE" == "all" ]] && return 0

  local changed_file="$TMP_DIR/changed-files.txt"
  [[ -f "$changed_file" ]] || collect_changed_files "$changed_file"

  # If code_map.md itself was touched, the rule is satisfied.
  if grep -qx 'code_map.md' "$changed_file"; then
    return 0
  fi

  local pattern='^(apps/backend/modules/[^/]+/|apps/backend/api/[^/]+/|apps/backend/api/qms/[^/]+/|apps/web-antd/src/views/[^/]+/|apps/web-antd/src/views/qms/[^/]+/)'
  local repo_path=''
  local seen_dirs=' '

  while IFS= read -r repo_path; do
    [[ -n "$repo_path" ]] || continue
    [[ "$repo_path" =~ $pattern ]] || continue
    local dir="${BASH_REMATCH[1]}"

    # Skip directories that already exist on the base ref (only flag *new* dirs).
    local base_ref=''
    if base_ref="$(resolve_base_ref)"; then
      if git -C "$ROOT_DIR" cat-file -e "$base_ref:$dir" 2>/dev/null; then
        continue
      fi
    fi

    [[ "$seen_dirs" == *" $dir "* ]] && continue
    seen_dirs="$seen_dirs$dir "

    report_violation "B-MAP1" "${dir}1" "New module/route/view directory must be reflected in code_map.md."
  done <"$changed_file"
}

# B-TEST1: backend test files must not live in centralized __tests__/tests/test directories.
check_b_test1() {
  (( ${#BACKEND_TEST_TARGETS[@]} == 0 )) && return 0
  local file=''
  local repo_path=''
  for file in "${BACKEND_TEST_TARGETS[@]}"; do
    repo_path="$(to_repo_path "$file")"
    if [[ "$repo_path" == */__tests__/* || "$repo_path" == */tests/* || "$repo_path" == */test/* ]]; then
      report_violation "B-TEST1" "$repo_path:1" "Tests must live next to source files, not in centralized test directories."
    fi
  done
}

# B-TEST2: foo.<suffix>.test.ts must have a sibling foo.<suffix>.ts.
# Existing legitimate orphan tests are baselined.
check_b_test2() {
  (( ${#BACKEND_TEST_TARGETS[@]} == 0 )) && return 0
  local file=''
  local repo_path=''
  local sibling=''
  for file in "${BACKEND_TEST_TARGETS[@]}"; do
    repo_path="$(to_repo_path "$file")"
    sibling="${file%.test.ts}.ts"
    if [[ ! -f "$sibling" ]]; then
      if baseline_has_test2 "$repo_path"; then
        echo -e "${YELLOW}Baseline B-TEST2:${NC} $repo_path (orphan test grandfathered)"
        baseline_hits=$((baseline_hits + 1))
      else
        report_violation "B-TEST2" "$repo_path:1" "Test file has no sibling source ($(to_repo_path "$sibling") missing)."
      fi
    fi
  done
}

# B-TEST3: a test importing ~/utils/prisma must also vi.mock it.
check_b_test3() {
  (( ${#BACKEND_TEST_TARGETS[@]} == 0 )) && return 0
  local file=''
  local repo_path=''
  for file in "${BACKEND_TEST_TARGETS[@]}"; do
    [[ -f "$file" ]] || continue
    if grep -qE "from[[:space:]]+['\"]~/utils/prisma['\"]" "$file"; then
      if ! grep -qE "vi\.mock\([[:space:]]*['\"]~/utils/prisma['\"]" "$file"; then
        repo_path="$(to_repo_path "$file")"
        report_violation "B-TEST3" "$repo_path:1" "Test imports ~/utils/prisma without vi.mock — would hit a real DB."
      fi
    fi
  done
}

echo "QMS architecture check"
echo "scope: $SCOPE"
echo "views dir: $QMS_VIEWS_DIR"
echo "baseline: $BASELINE_FILE"
echo

load_targets
echo "target files: qms=${#QMS_VIEW_TARGETS[@]} api=${#API_TS_TARGETS[@]} modules=${#MODULE_TS_TARGETS[@]} repo-ts=${#REPO_TS_TARGETS[@]} backend-tests=${#BACKEND_TEST_TARGETS[@]}"
echo

check_r1
check_r3
check_b_d1
check_b_r1
check_b_r2
check_b_r3
check_b_s2
check_b_s3
check_b_sec1
check_b_map1
check_b_test1
check_b_test2
check_b_test3

echo
if (( violations > 0 )); then
  echo -e "${RED}${violations} violations across ${#violated_rules[@]} rules${NC}"
  exit 1
fi

echo "0 violations across 0 rules"
echo -e "${GREEN}QMS architecture check passed.${NC}"

# === Backend rules pending cleanup ===
# B-S1 modules/ single file <= 500 lines       — 16 violations, scheduled for phase 9+
# B-S4 Date.now() for ID generation only       — needs refined matcher (not all Date.now() are IDs)
# B-S5 no console.* in modules/                — 3 violations, low effort, schedule TBD
# B-T1 no ` as any` in modules/                — ~12 violations
# B-T2 no `as unknown as` in modules/ (utils excluded for lib bridges) — ~7 violations
# B-M1 cross-module non-index import (A != B)  — many violations, requires module index re-exports
# B-T3 non-null assertion `!`                  — scan-only initially
# B-M2 Chinese string literal in condition     — needs pre-scan
