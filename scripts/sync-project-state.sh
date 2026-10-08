#!/usr/bin/env bash
# Quality Guardian Project State Sync
#
# Reads hard facts from the repository and writes them into the
# "docs:sync-start ... docs:sync-end" block of PROJECT_STATE.md.
# Hard data (version / module count / file counts) MUST come from this
# script, never hand-written, so the state file cannot drift.
#
# Usage: bash scripts/sync-project-state.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$ROOT_DIR/PROJECT_STATE.md"
BACKEND_DIR="$ROOT_DIR/apps/backend"

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

# --- gather facts ---------------------------------------------------------
version="$("$NODE_BIN" -e "console.log(require('$ROOT_DIR/package.json').version)")"
module_count="$(find "$BACKEND_DIR/modules" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
module_ts="$(find "$BACKEND_DIR/modules" -name '*.ts' | wc -l | tr -d ' ')"
backend_tests="$(find "$BACKEND_DIR" -name '*.test.ts' | wc -l | tr -d ' ')"
stamp="$(date '+%Y-%m-%d %H:%M')"

block="<!-- docs:sync-start -->

- 最后同步时间: $stamp
- 版本: $version
- 后端模块数: $module_count
- 模块 TS 文件数: $module_ts
- 后端测试文件数: $backend_tests

<!-- docs:sync-end -->"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "error: $STATE_FILE not found" >&2
  exit 1
fi

# Reject ambiguous boundaries before writing; preserve human text and its
# line endings outside the unique generated block.
SYNC_BLOCK="$block" "$NODE_BIN" --input-type=module - "$STATE_FILE" <<'NODEEOF'
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const text = readFileSync(file, 'utf8');
const start = '<!-- docs:sync-start -->';
const end = '<!-- docs:sync-end -->';
const i = text.indexOf(start);
const j = text.indexOf(end);
if (i < 0 || j < i || text.indexOf(start, i + start.length) >= 0
    || text.indexOf(end, j + end.length) >= 0) {
  console.error(`error: ${file} 必须有唯一且顺序正确的 docs:sync 标记；未修改文件。请保留人工说明并核对标记边界。`);
  process.exit(1);
}
writeFileSync(file, text.slice(0, i) + process.env.SYNC_BLOCK + text.slice(j + end.length), 'utf8');
NODEEOF

echo "synced PROJECT_STATE.md: v$version, $module_count modules, $module_ts module TS files, $backend_tests backend tests"
