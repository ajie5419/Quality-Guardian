#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=container-common.sh
source "$SCRIPT_DIR/container-common.sh"

require_container_cli

target="${1:-all}"

case "$target" in
  backend)
    container logs "$BACKEND_CONTAINER"
    ;;
  frontend)
    container logs "$FRONTEND_CONTAINER"
    ;;
  mysql)
    container logs "$MYSQL_CONTAINER"
    ;;
  redis)
    container logs "$REDIS_CONTAINER"
    ;;
  all)
    echo "== MySQL logs =="
    container logs "$MYSQL_CONTAINER" || true
    echo
    echo "== Redis logs =="
    container logs "$REDIS_CONTAINER" || true
    echo
    echo "== Backend logs =="
    container logs "$BACKEND_CONTAINER" || true
    echo
    echo "== Frontend logs =="
    container logs "$FRONTEND_CONTAINER" || true
    ;;
  *)
    echo "Usage: $0 [backend|frontend|mysql|redis|all]"
    exit 1
    ;;
esac
