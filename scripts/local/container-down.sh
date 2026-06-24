#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=container-common.sh
source "$SCRIPT_DIR/container-common.sh"

require_container_cli

remove_container_if_exists "$FRONTEND_CONTAINER"
remove_container_if_exists "$BACKEND_CONTAINER"
remove_container_if_exists "$REDIS_CONTAINER"
remove_container_if_exists "$MYSQL_CONTAINER"

echo "Local apple/container stack stopped."
