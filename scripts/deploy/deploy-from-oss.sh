#!/usr/bin/env bash
set -euo pipefail

VERSION=""
OSS_RELEASE_PREFIX=""
BACKEND_IMAGE=""
FRONTEND_IMAGE=""
IMAGE_REPO=""
APP_DIR="/opt/qms"
RELEASE_DIR="/opt/qms/releases"
HEALTH_URL="http://127.0.0.1:3000/api/status"
OSSUTIL_BIN="ossutil"
EXECUTOR_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-remote-release.sh"

usage() {
  cat <<USAGE
Usage:
  bash deploy-from-oss.sh \
    --version <version> \
    --oss-release-prefix <oss://bucket/path/releases> \
    --backend-image <repo/name> \
    --frontend-image <repo/name> \
    [--image-repo <single-repo/name>] \
    [--app-dir /opt/qms] \
    [--release-dir /opt/qms/releases] \
    [--health-url http://127.0.0.1:3000/api/status] \
    [--ossutil-bin ossutil] \
    [--executor-path /tmp/run-remote-release.sh]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --oss-release-prefix)
      OSS_RELEASE_PREFIX="$2"
      shift 2
      ;;
    --backend-image)
      BACKEND_IMAGE="$2"
      shift 2
      ;;
    --frontend-image)
      FRONTEND_IMAGE="$2"
      shift 2
      ;;
    --image-repo)
      IMAGE_REPO="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --release-dir)
      RELEASE_DIR="$2"
      shift 2
      ;;
    --health-url)
      HEALTH_URL="$2"
      shift 2
      ;;
    --ossutil-bin)
      OSSUTIL_BIN="$2"
      shift 2
      ;;
    --executor-path)
      EXECUTOR_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

: "${VERSION:?missing --version}"
: "${OSS_RELEASE_PREFIX:?missing --oss-release-prefix}"
if [[ -z "$IMAGE_REPO" ]]; then
  : "${BACKEND_IMAGE:?missing --backend-image}"
  : "${FRONTEND_IMAGE:?missing --frontend-image}"
fi

lock_file="/tmp/qg-deploy.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another deploy is running. lock=$lock_file"
  exit 1
fi

if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
  compose_file="$APP_DIR/docker-compose.yml"
elif [[ -f "$APP_DIR/infra/docker/docker-compose.yml" ]]; then
  compose_file="$APP_DIR/infra/docker/docker-compose.yml"
else
  echo "docker-compose.yml not found under $APP_DIR"
  exit 1
fi

if [[ ! -x "$EXECUTOR_PATH" ]]; then
  echo "bounded release executor is missing or not executable: $EXECUTOR_PATH" >&2
  exit 1
fi

if ! command -v timeout >/dev/null 2>&1; then
  echo "GNU timeout is required for bounded artifact loading" >&2
  exit 1
fi

if ! timeout --signal=TERM --kill-after=1s 1s true >/dev/null 2>&1; then
  echo "GNU timeout with --signal and --kill-after is required" >&2
  exit 1
fi

run_with_timeout() {
  local seconds="$1"
  shift
  timeout --signal=TERM --kill-after=30s "${seconds}s" "$@"
}

release_local_dir="$RELEASE_DIR/$VERSION"
mkdir -p "$release_local_dir"
release_oss_dir="${OSS_RELEASE_PREFIX%/}/${VERSION}"

backend_archive="$release_local_dir/backend-${VERSION}.tar.gz"
frontend_archive="$release_local_dir/frontend-${VERSION}.tar.gz"
checksum_file="$release_local_dir/checksums-${VERSION}.txt"

checksum_verify() {
  local file="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$file"
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$file"
    return
  fi
  echo "No checksum verify command found (need shasum or sha256sum)" >&2
  exit 1
}

echo "[remote] download artifacts from $release_oss_dir"
run_with_timeout 300 "$OSSUTIL_BIN" cp -f "${release_oss_dir}/backend-${VERSION}.tar.gz" "$backend_archive"
run_with_timeout 300 "$OSSUTIL_BIN" cp -f "${release_oss_dir}/frontend-${VERSION}.tar.gz" "$frontend_archive"
run_with_timeout 120 "$OSSUTIL_BIN" cp -f "${release_oss_dir}/checksums-${VERSION}.txt" "$checksum_file"

(
  cd "$release_local_dir"
  checksum_verify "checksums-${VERSION}.txt"
)

echo "[remote] load docker images"
run_with_timeout 300 docker load --input "$backend_archive"
run_with_timeout 300 docker load --input "$frontend_archive"

backend_ref="${BACKEND_IMAGE}:${VERSION}"
frontend_ref="${FRONTEND_IMAGE}:${VERSION}"
if [[ -n "$IMAGE_REPO" ]]; then
  backend_ref="${IMAGE_REPO}:backend-${VERSION}"
  frontend_ref="${IMAGE_REPO}:frontend-${VERSION}"
fi

run_with_timeout 30 docker image inspect "$backend_ref" >/dev/null
run_with_timeout 30 docker image inspect "$frontend_ref" >/dev/null

backup_file="$compose_file.bak"
"$EXECUTOR_PATH" \
  --compose-file "$compose_file" \
  --backend-image "$backend_ref" \
  --frontend-image "$frontend_ref" \
  --version "$VERSION" \
  --health-url "$HEALTH_URL"
