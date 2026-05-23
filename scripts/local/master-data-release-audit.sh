#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_ENV="${TARGET_ENV:-local}"
TIMESTAMP="${TIMESTAMP:-$(date -u +"%Y-%m-%dT%H-%M-%SZ")}"
OUT_ROOT="${OUT_ROOT:-$ROOT_DIR/tmp/master-data-governance/releases}"
RUN_DIR="$OUT_ROOT/${TARGET_ENV}-${TIMESTAMP}"
LOG_DIR="$RUN_DIR/logs"
EVIDENCE_DIR="$RUN_DIR/evidence"
DRY_RUN="${DRY_RUN:-false}"
SKIP_RELEASE_GATE="${SKIP_RELEASE_GATE:-false}"
SKIP_OBJECTIVE_AUDIT="${SKIP_OBJECTIVE_AUDIT:-false}"

log() {
  printf '[master-data-release-audit] %s\n' "$*"
}

run_cmd() {
  local name="$1"
  shift
  local log_path="$LOG_DIR/${name}.log"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY_RUN: $*"
    return 0
  fi
  log "run: $*"
  "$@" 2>&1 | tee "$log_path"
}

copy_latest_json() {
  local src_dir="$1"
  local src_pattern="$2"
  local dest_name="$3"

  if [[ ! -d "$src_dir" ]]; then
    return 0
  fi

  local latest_file
  latest_file="$(ls -1t "$src_dir"/$src_pattern 2>/dev/null | head -n 1 || true)"
  if [[ -z "$latest_file" ]]; then
    return 0
  fi
  cp "$latest_file" "$EVIDENCE_DIR/$dest_name"
  log "copied: $latest_file -> $EVIDENCE_DIR/$dest_name"
}

if [[ "$DRY_RUN" != "true" && -z "${DATABASE_URL:-}" ]]; then
  log "ERROR: DATABASE_URL is required when DRY_RUN=false"
  exit 1
fi

mkdir -p "$LOG_DIR" "$EVIDENCE_DIR"

{
  echo "targetEnv=$TARGET_ENV"
  echo "timestamp=$TIMESTAMP"
  echo "rootDir=$ROOT_DIR"
  echo "runDir=$RUN_DIR"
  echo "dryRun=$DRY_RUN"
  echo "skipReleaseGate=$SKIP_RELEASE_GATE"
  echo "skipObjectiveAudit=$SKIP_OBJECTIVE_AUDIT"
  echo "gitCommit=$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "gitBranch=$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
} >"$RUN_DIR/metadata.txt"

if [[ "$SKIP_RELEASE_GATE" != "true" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    run_cmd release-gate env DATABASE_URL="<required-when-dry-run-false>" pnpm --dir "$ROOT_DIR" run check:master-data-release-gate
  else
    run_cmd release-gate env DATABASE_URL="$DATABASE_URL" pnpm --dir "$ROOT_DIR" run check:master-data-release-gate
  fi
fi

if [[ "$SKIP_OBJECTIVE_AUDIT" != "true" ]]; then
  run_cmd objective-audit pnpm --dir "$ROOT_DIR" run check:master-data-objective-audit
fi

copy_latest_json "$ROOT_DIR/tmp/master-data-governance/backlog" "backlog-report-*.json" "backlog-report.latest.json"
copy_latest_json "$ROOT_DIR/tmp/master-data-governance/consistency" "consistency-report-*.json" "consistency-report.latest.json"
copy_latest_json "$ROOT_DIR/tmp/master-data-governance/reports" "governance-report-*.json" "governance-report.latest.json"
copy_latest_json "$ROOT_DIR/tmp/master-data-governance/read-coverage" "read-coverage-*.json" "read-coverage.latest.json"
copy_latest_json "$ROOT_DIR/tmp/master-data-governance/write-coverage" "write-coverage-*.json" "write-coverage.latest.json"
copy_latest_json "$ROOT_DIR/tmp/master-data-governance/objective-audit" "objective-audit-*.json" "objective-audit.latest.json"

log "done: $RUN_DIR"
