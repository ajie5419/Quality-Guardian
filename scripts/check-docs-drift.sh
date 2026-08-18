#!/usr/bin/env bash
# Quality Guardian Documentation Drift Check
#
# Guards the knowledge base against drift so AI (or humans) never trust a
# stale document. Current checks:
#
#   D1: PROJECT_STATE.md hard-data block must equal live repository facts
#      (run `pnpm run docs:sync` to refresh).
#   D2: every apps/backend/modules/<name>/ directory must appear in
#      code_map.md AND have an ARCHITECTURE.md (or an explicit skip reason).
#   D3: code_map.md must not reference module directories that no longer exist.
#
# Usage: bash scripts/check-docs-drift.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$ROOT_DIR/PROJECT_STATE.md"
CODE_MAP="$ROOT_DIR/code_map.md"
BACKEND_DIR="$ROOT_DIR/apps/backend"
violations=0

# Locate node: PATH first, then common install roots.
NODE_BIN="$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.local/share/pnpm/node"; do
    if [[ -x "$candidate" ]]; then NODE_BIN="$candidate"; break; fi
  done
fi

red() { printf '\033[0;31m%s\033[0m\n' "$1"; }
green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
report() { red "  ✗ $1"; violations=$((violations + 1)); }

echo "checking documentation drift..."

# --- D1: state file hard data vs live facts -------------------------------
if [[ -f "$STATE_FILE" && -n "$NODE_BIN" ]]; then
  live_version="$("$NODE_BIN" -e "console.log(require('$ROOT_DIR/package.json').version)")"
  live_modules="$(find "$BACKEND_DIR/modules" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  live_module_ts="$(find "$BACKEND_DIR/modules" -name '*.ts' | wc -l | tr -d ' ')"

  stated_version="$(sed -n 's/^- 版本: //p' "$STATE_FILE" | head -1)"
  stated_modules="$(sed -n 's/^- 后端模块数: //p' "$STATE_FILE" | head -1)"
  stated_module_ts="$(sed -n 's/^- 模块 TS 文件数: //p' "$STATE_FILE" | head -1)"

  [[ "$stated_version" == "$live_version" ]] || report "D1 version drift: PROJECT_STATE says '$stated_version', package.json says '$live_version' (run pnpm run docs:sync)"
  [[ "$stated_modules" == "$live_modules" ]] || report "D1 module-count drift: PROJECT_STATE says '$stated_modules', actual '$live_modules' (run pnpm run docs:sync)"
  [[ "$stated_module_ts" == "$live_module_ts" ]] || report "D1 module-TS-file drift: PROJECT_STATE says '$stated_module_ts', actual '$live_module_ts' (run pnpm run docs:sync)"
else
  report "D1 PROJECT_STATE.md missing"
fi

# --- D2/D3: module dirs <-> code_map "backend business modules" section -----
# Only the "后端业务模块" section of code_map.md is authoritative for backend
# module names; API routes / frontend views / weapp pages are separate sections
# and must not be confused with module directories.
if [[ -f "$CODE_MAP" ]]; then
  # Extract module names from the "## 后端业务模块" section only.
  code_map_modules="$(
    awk '/^## 后端业务模块/{in_sec=1; next} /^## /{if (in_sec) exit} in_sec && /- \*\*[a-z0-9-]+\//{print}' "$CODE_MAP" \
      | sed -E 's/.*\*\*([a-z0-9-]+)\/.*/\1/' | sort -u
  )"

  # D2: every module dir must appear in code_map backend-modules section.
  while IFS= read -r dir; do
    [[ -n "$dir" ]] || continue
    name="$(basename "$dir")"
    if ! grep -qx "$name" <<<"$code_map_modules"; then
      report "D2 module '${name}' missing from code_map.md backend-modules section"
    fi
  done < <(find "$BACKEND_DIR/modules" -mindepth 1 -maxdepth 1 -type d | sort)

  # D3: code_map backend-modules section must not reference vanished dirs.
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if [[ ! -d "$BACKEND_DIR/modules/$name" ]]; then
      report "D3 code_map.md references module '${name}' that no longer exists"
    fi
  done <<<"$code_map_modules"
else
  report "D2 code_map.md missing"
fi

# --- D4: missing ARCHITECTURE.md (soft, informational only) ----------------
missing_arch=()
if [[ -d "$BACKEND_DIR/modules" ]]; then
  while IFS= read -r dir; do
    [[ -n "$dir" ]] || continue
    name="$(basename "$dir")"
    if [[ ! -f "$dir/ARCHITECTURE.md" ]]; then
      missing_arch+=("$name")
    fi
  done < <(find "$BACKEND_DIR/modules" -mindepth 1 -maxdepth 1 -type d | sort)
fi
if (( ${#missing_arch[@]} > 0 )); then
  printf '  ⚠ %d module(s) lack ARCHITECTURE.md (informational, not blocking): %s\n' \
    "${#missing_arch[@]}" "$(IFS=,; echo "${missing_arch[*]}")"
fi

echo ""
if (( violations > 0 )); then
  red "docs drift check FAILED: $violations violation(s)"
  exit 1
fi
green "docs drift check PASSED"
