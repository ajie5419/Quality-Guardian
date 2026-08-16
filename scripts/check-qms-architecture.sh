#!/usr/bin/env bash
# Quality Guardian Architecture Check v3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${QMS_ARCH_ROOT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
QMS_VIEWS_DIR="$ROOT_DIR/apps/web-antd/src/views/qms"
BACKEND_DIR="$ROOT_DIR/apps/backend"
SOURCE_RULE_CHECKER="$SCRIPT_DIR/check-qms-source-rules.mjs"

# Locate node: PATH first, then common install roots (macOS / Linux).
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.local/share/pnpm/node"; do
    if [[ -x "$candidate" ]]; then NODE_BIN="$candidate"; break; fi
  done
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found" >&2
  exit 1
fi
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
declare -a BACKEND_SOURCE_TARGETS=()
declare -a REPO_TS_TARGETS=()
declare -a REPO_IDENTITY_TARGETS=()
declare -a BACKEND_TEST_TARGETS=()

usage() {
  cat <<'USAGE'
Usage: check-qms-architecture.sh [--changed|--all]

Rules:
  R1: no direct requestClient usage under apps/web-antd/src/views/qms
  R2: no bare axios/fetch usage under apps/web-antd/src/views/qms
  R3: index.vue must not exceed the line threshold
  B-D1: backend legacy architecture directories must not exist
  B-R1: api/ files must not import prisma directly
  B-R2: api/ files must stay thin
  B-R3: api/ files must not bypass request body typing
  B-S1: modules/ source files must not exceed 500 lines
  B-S2: modules/ files must not cast Prisma delegates to any
  B-S3: modules/ files must not use execSync
  B-S4: backend IDs must not be generated with Date.now()
  B-S5: modules/ source files must not use console.*
  B-T1: backend source must not assert values as any
  B-T2: backend source must not use double assertions through unknown
  B-T3: backend source must not use non-null assertions
  B-M1: cross-module imports must use the target module index
  B-M2: conditions must not branch on Chinese string literals
  B-E1: empty catch blocks are forbidden
  B-E2: catch blocks must record errors with an approved logger
  B-EC: BusinessError codes must be members of the shared ErrorCode dictionary
  B-GF: newly added cross-table name columns must be registered as governed fields
  B-ID1: selector value keys must use canonical IDs, not names
  B-ID2: supplier-related change events must pair identity names with IDs
  B-ID3: controlled supplier writes must pair supplierName with supplierId
  B-ID4: supplier scoring queries and mappings must use canonical IDs
  B-ID5: legacy name-to-ID resolution is restricted to reviewed import adapters
  B-ID6: inspection request statistics must aggregate identities by canonical IDs
  B-ID7: TEAM writes must use the dedicated identity service; legacy bootstrap is forbidden
  B-ID8: controlled master-data statistics must group by canonical IDs
  B-ID9: controlled master-data Map keys must use canonical IDs
  B-SEC1: raw SQL must not combine $queryRawUnsafe with template strings
  B-MAP1: new module/route/view directories must update code_map.md (changed mode only)
  B-TEST1: backend tests must not live in centralized __tests__/tests/test directories
  B-TEST2: backend test files must have a sibling source file (orphan tests forbidden)
  B-TEST3: tests importing ~/utils/prisma must also vi.mock it
  B-AUTH1: write endpoints (post/put/delete/patch) must declare authorization (authorizeWrite/requireSystemAdmin) unless public
  B-AUTH2: frontend permission codes must be declared (shared enum or module menu authCode)

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
  collect_targets "$TMP_DIR/backend-source-targets.txt" '^apps/backend/(api|middleware|modules|utils)/.*\.ts$'
  collect_targets "$TMP_DIR/repo-ts-targets.txt" '.*\.ts$'
  collect_targets "$TMP_DIR/repo-identity-targets.txt" '^(apps|packages)/.*\.(js|jsx|ts|tsx|vue)$'
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
    if [[ -n "$file" && -f "$file" && "$file" != *.test.ts && "$file" != *.spec.ts && "$file" != */__tests__/* ]]; then
      BACKEND_SOURCE_TARGETS+=("$file")
    fi
  done <"$TMP_DIR/backend-source-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && REPO_TS_TARGETS+=("$file")
  done <"$TMP_DIR/repo-ts-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && REPO_IDENTITY_TARGETS+=("$file")
  done <"$TMP_DIR/repo-identity-targets.txt"

  while IFS= read -r file; do
    [[ -n "$file" && -f "$file" ]] && BACKEND_TEST_TARGETS+=("$file")
  done <"$TMP_DIR/backend-test-targets.txt"
}

baseline_r3_limit() {
  local repo_path="$1"
  [[ -f "$BASELINE_FILE" ]] || return 1
  awk -F'|' -v path="$repo_path" '$1 == "R3" && $2 == path { print $3; found = 1 } END { if (!found) exit 1 }' "$BASELINE_FILE"
}

baseline_line_limit() {
  local rule="$1"
  local repo_path="$2"
  [[ -f "$BASELINE_FILE" ]] || return 1
  awk -F'|' -v rule="$rule" -v path="$repo_path" '$1 == rule && $2 == path { print $3; found = 1 } END { if (!found) exit 1 }' "$BASELINE_FILE"
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
  local line=''
  local match=''
  local repo_path=''

  while IFS= read -r match; do
    [[ -n "$match" ]] || continue
    file="${match%%:*}"
    match="${match#*:}"
    line="${match%%:*}"
    repo_path="$(to_repo_path "$file")"
    report_violation "$rule" "$repo_path:$line" "$message"
  done < <(grep -nHE "$pattern" "$@" || true)
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

# R2: qms views must not use bare axios/fetch — go through #/api wrappers
# (useRequest / request.ts) so auth, error handling and response shape stay
# centralized. Historical bare usage is grandfathered via baseline (R2 lines).
check_r2() {
  (( ${#QMS_VIEW_TARGETS[@]} == 0 )) && return 0
  local file=''
  local repo_path=''
  local line_no=''
  local match_line=''
  local seen=''

  # Collect raw hits; each is "file:line:content".
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    file="${hit%%:*}"
    rest="${hit#*:}"
    line_no="${rest%%:*}"
    repo_path="$(to_repo_path "$file")"

    # baseline R2|path|line — grandfather specific historical lines.
    if awk -F'|' -v p="$repo_path" -v l="$line_no" '$1=="R2" && $2==p && $3==l {found=1} END{exit !found}' "$BASELINE_FILE"; then
      echo -e "${YELLOW}Baseline R2:${NC} $repo_path:$line_no (grandfathered)"
      baseline_hits=$((baseline_hits + 1))
      continue
    fi
    report_violation "R2" "$repo_path:$line_no" "Bare axios/fetch in qms views; use the #/api wrapper instead."
  done < <(grep -nHE "(from[[:space:]]+['\"]axios['\"])|(axios\.(get|post|put|delete|patch))|\bfetch\(" "${QMS_VIEW_TARGETS[@]}" || true)
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

check_b_auth1() {
  # Write endpoints must call authorizeWrite (or requireSystemAdmin).
  # Public, auth, upload, telegram and webhook routes are exempt.
  local file=''
  local repo_path=''
  local base_name=''

  (( ${#API_TS_TARGETS[@]} == 0 )) && return 0
  for file in "${API_TS_TARGETS[@]}"; do
    base_name="$(basename "$file")"
    case "$base_name" in
      *.post.ts|*.put.ts|*.delete.ts|*.patch.ts) ;;
      *) continue ;;
    esac
    repo_path="$(to_repo_path "$file")"
    case "$repo_path" in
      apps/backend/api/qms/public/*|apps/backend/api/auth/*|apps/backend/api/uploads/*|apps/backend/api/telegram/*|apps/backend/api/webhook/*|apps/backend/api/upload.ts|apps/backend/api/qms/upload.post.ts|apps/backend/api/system/log/client.post.ts|apps/backend/api/user/preferences/*)
        continue
        ;;
    esac
    if ! grep -qE 'authorizeWrite|requireSystemAdmin|assert[A-Z][A-Za-z]*Permission|ensurePermission' "$file"; then
      baseline_limit=""
      if baseline_limit="$(baseline_line_limit "B-AUTH1" "$repo_path")" && (( baseline_limit >= 1 )); then
        echo -e "${YELLOW}Baseline B-AUTH1:${NC} $repo_path (write endpoint without auth declaration)"
        baseline_hits=$((baseline_hits + 1))
      else
        report_violation "B-AUTH1" "$repo_path:1" "Write endpoint must declare authorization (authorizeWrite/requireSystemAdmin) or be public."
      fi
    fi
  done
}
check_b_auth2() {
  # Frontend permission codes must be declared; runs only in --all mode
  # (repo-wide scan) because it needs the full source tree.
  [[ "$SCOPE" != "all" ]] && return 0
  local out=''
  out="$("$NODE_BIN" "$ROOT_DIR/scripts/check-permission-code-declarations.mjs" 2>&1)"
  local code=$?
  if (( code != 0 )); then
    report_violation "B-AUTH2" "scripts/check-permission-code-declarations.mjs:1" "$(echo "$out" | head -1)"
  fi
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

check_b_s1() {
  local file=''
  local repo_path=''
  local lines=''
  local baseline_limit=''

  (( ${#MODULE_TS_TARGETS[@]} == 0 )) && return 0
  for file in "${MODULE_TS_TARGETS[@]}"; do
    [[ "$file" == *.test.ts || "$file" == *.spec.ts || "$file" == */__tests__/* ]] && continue
    repo_path="$(to_repo_path "$file")"
    lines="$(wc -l <"$file" | tr -d ' ')"
    (( lines <= 500 )) && continue

    baseline_limit=''
    if baseline_limit="$(baseline_line_limit "B-S1" "$repo_path")" && (( lines <= baseline_limit )); then
      echo -e "${YELLOW}Baseline B-S1:${NC} $repo_path ($lines lines, baseline <= $baseline_limit)"
      baseline_hits=$((baseline_hits + 1))
    elif [[ -n "$baseline_limit" ]]; then
      report_violation "B-S1" "$repo_path:$lines" "Module source exceeds baseline $baseline_limit lines."
    else
      report_violation "B-S1" "$repo_path:$lines" "Module source exceeds 500 lines."
    fi
  done
}

check_b_s3() {
  (( ${#MODULE_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-S3" "Use async process execution instead of execSync." 'execSync' "${MODULE_TS_TARGETS[@]}"
}

check_b_s5() {
  local file=''
  local -a source_files=()

  (( ${#MODULE_TS_TARGETS[@]} == 0 )) && return 0
  for file in "${MODULE_TS_TARGETS[@]}"; do
    [[ "$file" == *.test.ts || "$file" == *.spec.ts || "$file" == */__tests__/* ]] && continue
    source_files+=("$file")
  done
  (( ${#source_files[@]} == 0 )) && return 0
  grep_rule "B-S5" "Use createModuleLogger instead of console.* in modules." 'console\.(log|warn|error)' "${source_files[@]}"
}

check_backend_source_rules() {
  local output_file="$TMP_DIR/source-rule-output.txt"
  local files_file="$TMP_DIR/backend-source-files.txt"
  local identity_files_file="$TMP_DIR/identity-source-files.txt"
  local kind=''
  local rule=''
  local location=''
  local message=''

  (( ${#BACKEND_SOURCE_TARGETS[@]} == 0 && ${#REPO_IDENTITY_TARGETS[@]} == 0 )) && return 0
  : >"$files_file"
  : >"$identity_files_file"
  if (( ${#BACKEND_SOURCE_TARGETS[@]} > 0 )); then
    printf '%s\n' "${BACKEND_SOURCE_TARGETS[@]}" >"$files_file"
  fi
  if (( ${#REPO_IDENTITY_TARGETS[@]} > 0 )); then
    printf '%s\n' "${REPO_IDENTITY_TARGETS[@]}" >"$identity_files_file"
  fi
  if ! "$NODE_BIN" "$SOURCE_RULE_CHECKER" \
    --root "$ROOT_DIR" \
    --baseline "$BASELINE_FILE" \
    --files-from "$files_file" \
    --identity-files-from "$identity_files_file" >"$output_file"; then
    echo -e "${RED}Backend source rule checker failed.${NC}"
    exit 2
  fi

  while IFS=$'\t' read -r kind rule location message; do
    [[ -n "$kind" ]] || continue
    if [[ "$kind" == "BASELINE" ]]; then
      echo -e "${YELLOW}Baseline $rule:${NC} $location ($message)"
      baseline_hits=$((baseline_hits + 1))
    elif [[ "$kind" == "VIOLATION" ]]; then
      report_violation "$rule" "$location" "$message"
    fi
  done <"$output_file"
}

check_b_sec1() {
  (( ${#REPO_TS_TARGETS[@]} == 0 )) && return 0
  grep_rule "B-SEC1" "Do not combine queryRawUnsafe with template strings." '\$queryRawUnsafe.*`' "${REPO_TS_TARGETS[@]}"
}

check_b_id7() {
  local file=''
  local seen='|'
  for file in \
    "$BACKEND_DIR"/scripts/*team*bootstrap*.ts \
    "$BACKEND_DIR"/scripts/*bootstrap*team*.ts; do
    [[ -f "$file" ]] || continue
    [[ "$seen" == *"|$file|"* ]] && continue
    seen="${seen}${file}|"
    report_violation "B-ID7" "$(to_repo_path "$file"):1" "Legacy TEAM bootstrap must not be restored; use TEAM identity reconciliation."
  done
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

# B-GF: newly added cross-table name columns must be registered in
# master-data-fields.ts (the governed-fields registry). Only NEW columns are
# checked (incremental), so legacy ungoverned columns are not flagged.
# Ambiguous generic columns (name/category/type) and identity tables are
# excluded; run the python helper and report its findings.
check_b_gf() {
  local helper="$SCRIPT_DIR/check-governed-fields.py"
  [[ -f "$helper" ]] || return 0

  local py_bin="$(command -v python3 || echo /usr/bin/python3)"
  [[ -x "$py_bin" ]] || return 0

  # Only meaningful in --changed mode (need a base ref to diff schema columns).
  [[ "$SCOPE" == "all" ]] && return 0

  local base_ref=''
  base_ref="$(resolve_base_ref || true)"
  if [[ -z "$base_ref" ]]; then
    return 0
  fi

  # Diff the schema between base ref and working tree; feed the added column
  # lines to the helper, which cross-checks against the governance registry.
  local added_schema=''
  added_schema="$(git -C "$ROOT_DIR" diff "$base_ref" -- apps/backend/prisma/schema.prisma | grep -E '^\+' | grep -v '^+++' || true)"

  [[ -n "$added_schema" ]] || return 0

  local output=''
  output="$(printf '%s\n' "$added_schema" | "$py_bin" "$helper" --root "$ROOT_DIR" 2>/dev/null || true)"
  if [[ -n "$output" ]]; then
    while IFS='|' read -r rule location message; do
      [[ -n "$rule" && -n "$location" ]] || continue
      report_violation "$rule" "$location" "$message"
    done <<<"$output"
  fi
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
echo "target files: qms=${#QMS_VIEW_TARGETS[@]} api=${#API_TS_TARGETS[@]} modules=${#MODULE_TS_TARGETS[@]} backend-source=${#BACKEND_SOURCE_TARGETS[@]} repo-ts=${#REPO_TS_TARGETS[@]} identity=${#REPO_IDENTITY_TARGETS[@]} backend-tests=${#BACKEND_TEST_TARGETS[@]}"
echo

check_r1
check_r2
check_r3
check_b_d1
check_b_r1
check_b_r2
check_b_r3
check_b_s1
check_b_s2
check_b_s3
check_b_s5
check_backend_source_rules
check_b_sec1
check_b_id7
check_b_map1
check_b_gf
check_b_test1
check_b_test2
check_b_test3
check_b_auth1
check_b_auth2

echo
if (( violations > 0 )); then
  echo -e "${RED}${violations} violations across ${#violated_rules[@]} rules${NC}"
  exit 1
fi

echo "0 violations across 0 rules"
echo -e "${GREEN}QMS architecture check passed.${NC}"
