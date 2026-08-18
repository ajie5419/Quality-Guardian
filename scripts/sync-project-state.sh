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

# Replace the block between the markers (inclusive) using python3
# (robust against multiline content; awk chokes on embedded newlines).
PY="$(command -v python3 || echo /usr/bin/python3)"
if [[ ! -x "$PY" ]]; then
  echo "error: python3 not found" >&2
  exit 1
fi

SYNC_BLOCK="$block" "$PY" - "$STATE_FILE" <<'PYEOF'
import os
import sys

path = sys.argv[1]
block = os.environ["SYNC_BLOCK"]
with open(path, "r", encoding="utf-8") as fh:
    text = fh.read()

start = "<!-- docs:sync-start -->"
end = "<!-- docs:sync-end -->"
i = text.find(start)
j = text.find(end)
if i == -1 or j == -1 or j < i:
    print(f"error: markers not found in {path}", file=sys.stderr)
    sys.exit(1)

j += len(end)
text = text[:i] + block + text[j:]
with open(path, "w", encoding="utf-8") as fh:
    fh.write(text)
PYEOF

echo "synced PROJECT_STATE.md: v$version, $module_count modules, $module_ts module TS files, $backend_tests backend tests"
