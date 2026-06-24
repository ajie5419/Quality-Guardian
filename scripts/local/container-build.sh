#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=container-common.sh
source "$SCRIPT_DIR/container-common.sh"

require_container_cli
ensure_container_system

cd "$ROOT_DIR"

echo "Building backend image: $BACKEND_IMAGE"
container build \
  -m "${CONTAINER_BUILD_MEMORY:-4G}" \
  -c "${CONTAINER_BUILD_CPUS:-4}" \
  -f infra/docker/Dockerfile.backend \
  -t "$BACKEND_IMAGE" \
  .

echo "Building frontend image: $FRONTEND_IMAGE"
container build \
  -m "${CONTAINER_BUILD_MEMORY:-4G}" \
  -c "${CONTAINER_BUILD_CPUS:-4}" \
  -f infra/docker/Dockerfile.frontend \
  --build-arg "VITE_APP_VERSION=container-local" \
  -t "$FRONTEND_IMAGE" \
  .

echo "Build finished."
