#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_ENV_FILE="$SCRIPT_DIR/.env.oss-deploy"
ENV_FILE="$DEFAULT_ENV_FILE"
SKIP_CHECKS="false"
VERSION=""

usage() {
  cat <<USAGE
Usage:
  bash scripts/deploy/one-click-oss.sh [--env <env-file>] [--version <version>] [--skip-checks]

Options:
  --env <env-file>      Deploy env file path (default: scripts/deploy/.env.oss-deploy)
  --version <version>   Fixed release version (default: <timestamp>-<gitsha>)
  --skip-checks         Skip lint/type checks
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_FILE="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS="true"
      shift
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

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Deploy env file not found: $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${OSS_RELEASE_PREFIX:?missing OSS_RELEASE_PREFIX, e.g. oss://bucket/path/releases}"
: "${REMOTE_HOST:?missing REMOTE_HOST}"
: "${REMOTE_USER:?missing REMOTE_USER}"
: "${REMOTE_SSH_KEY:?missing REMOTE_SSH_KEY}"

OSSUTIL_BIN="${OSSUTIL_BIN:-ossutil}"
IMAGE_REPO="${IMAGE_REPO:-}"
BACKEND_IMAGE_REPO="${BACKEND_IMAGE_REPO:-qg/backend}"
FRONTEND_IMAGE_REPO="${FRONTEND_IMAGE_REPO:-qg/frontend}"
SERVER_APP_DIR="${SERVER_APP_DIR:-/opt/qms}"
SERVER_RELEASE_DIR="${SERVER_RELEASE_DIR:-/opt/qms/releases}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/api/status}"

REMOTE_SSH_KEY="${REMOTE_SSH_KEY/#\~/$HOME}"
if [[ ! -f "$REMOTE_SSH_KEY" ]]; then
  echo "SSH key not found: $REMOTE_SSH_KEY"
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo 'nogit')"
  VERSION="$(date +%Y%m%d%H%M%S)-${GIT_SHA}"
fi

ARTIFACT_DIR="$ROOT_DIR/dist/deploy/$VERSION"
mkdir -p "$ARTIFACT_DIR"

backend_tag="${BACKEND_IMAGE_REPO}:${VERSION}"
frontend_tag="${FRONTEND_IMAGE_REPO}:${VERSION}"
if [[ -n "$IMAGE_REPO" ]]; then
  backend_tag="${IMAGE_REPO}:backend-${VERSION}"
  frontend_tag="${IMAGE_REPO}:frontend-${VERSION}"
fi
backend_tar="$ARTIFACT_DIR/backend-${VERSION}.tar.gz"
frontend_tar="$ARTIFACT_DIR/frontend-${VERSION}.tar.gz"
checksum_file="$ARTIFACT_DIR/checksums-${VERSION}.txt"

checksum_cmd() {
  if command -v shasum >/dev/null 2>&1; then
    echo "shasum -a 256"
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    echo "sha256sum"
    return
  fi
  echo "No checksum command found (need shasum or sha256sum)" >&2
  exit 1
}

if [[ "$SKIP_CHECKS" != "true" ]]; then
  echo "[1/8] Running code checks..."
  pnpm -C "$ROOT_DIR" lint
  pnpm --filter @qgs/backend typecheck
  pnpm --filter @qgs/web-antd typecheck
fi

echo "[2/8] Building backend image: $backend_tag"
docker build \
  --platform linux/amd64 \
  -t "$backend_tag" \
  -f "$ROOT_DIR/infra/docker/Dockerfile.backend" \
  "$ROOT_DIR"

echo "[3/8] Building frontend image: $frontend_tag"
docker build \
  --platform linux/amd64 \
  -t "$frontend_tag" \
  -f "$ROOT_DIR/infra/docker/Dockerfile.frontend" \
  "$ROOT_DIR"

echo "[4/8] Exporting images to tar.gz"
docker save "$backend_tag" | gzip > "$backend_tar"
docker save "$frontend_tag" | gzip > "$frontend_tar"

(
  cd "$ARTIFACT_DIR"
  CHECKSUM_TOOL="$(checksum_cmd)"
  $CHECKSUM_TOOL "backend-${VERSION}.tar.gz" "frontend-${VERSION}.tar.gz" > "checksums-${VERSION}.txt"
)

echo "[5/8] Uploading artifacts to OSS"
release_oss_dir="${OSS_RELEASE_PREFIX%/}/${VERSION}"
"$OSSUTIL_BIN" cp -f "$backend_tar" "${release_oss_dir}/"
"$OSSUTIL_BIN" cp -f "$frontend_tar" "${release_oss_dir}/"
"$OSSUTIL_BIN" cp -f "$checksum_file" "${release_oss_dir}/"

echo "[6/8] Uploading remote deploy runner"
scp -i "$REMOTE_SSH_KEY" -o StrictHostKeyChecking=no \
  "$SCRIPT_DIR/deploy-from-oss.sh" \
  "$REMOTE_USER@$REMOTE_HOST:/tmp/qg-deploy-from-oss.sh"

echo "[7/8] Triggering remote deployment"
ssh -i "$REMOTE_SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" \
  "bash /tmp/qg-deploy-from-oss.sh \
    --version '$VERSION' \
    --oss-release-prefix '$OSS_RELEASE_PREFIX' \
    --backend-image '$BACKEND_IMAGE_REPO' \
    --frontend-image '$FRONTEND_IMAGE_REPO' \
    --image-repo '$IMAGE_REPO' \
    --app-dir '$SERVER_APP_DIR' \
    --release-dir '$SERVER_RELEASE_DIR' \
    --health-url '$HEALTHCHECK_URL' \
    --ossutil-bin '$OSSUTIL_BIN'"

echo "[8/8] Done"
echo "Release version: $VERSION"
echo "OSS path: ${release_oss_dir}/"
