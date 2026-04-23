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
    [--ossutil-bin ossutil]
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
"$OSSUTIL_BIN" cp -f "${release_oss_dir}/backend-${VERSION}.tar.gz" "$backend_archive"
"$OSSUTIL_BIN" cp -f "${release_oss_dir}/frontend-${VERSION}.tar.gz" "$frontend_archive"
"$OSSUTIL_BIN" cp -f "${release_oss_dir}/checksums-${VERSION}.txt" "$checksum_file"

(
  cd "$release_local_dir"
  checksum_verify "checksums-${VERSION}.txt"
)

echo "[remote] load docker images"
gunzip -c "$backend_archive" | docker load
gunzip -c "$frontend_archive" | docker load

backend_ref="${BACKEND_IMAGE}:${VERSION}"
frontend_ref="${FRONTEND_IMAGE}:${VERSION}"
if [[ -n "$IMAGE_REPO" ]]; then
  backend_ref="${IMAGE_REPO}:backend-${VERSION}"
  frontend_ref="${IMAGE_REPO}:frontend-${VERSION}"
fi

docker image inspect "$backend_ref" >/dev/null
docker image inspect "$frontend_ref" >/dev/null

backup_file="$compose_file.bak"
cp "$compose_file" "$backup_file"

rollback() {
  echo "[remote] deploy failed, rolling back"
  if [[ -f "$backup_file" ]]; then
    cp "$backup_file" "$compose_file"
    docker compose -f "$compose_file" up -d backend frontend redis || true
  fi
}
trap rollback ERR

update_compose_images() {
  local src="$1"
  local dst="$2"
  local backend="$3"
  local frontend="$4"

  awk -v backend="$backend" -v frontend="$frontend" '
    BEGIN { in_backend=0; in_frontend=0 }
    /^  backend:/ { in_backend=1; in_frontend=0; print; next }
    /^  frontend:/ { in_frontend=1; in_backend=0; print; next }
    /^  [^ ]/ { in_backend=0; in_frontend=0; print; next }
    {
      if (in_backend && $1 == "image:") {
        print "    image: " backend;
        next;
      }
      if (in_frontend && $1 == "image:") {
        print "    image: " frontend;
        next;
      }
      print;
    }
  ' "$src" > "$dst"
}

tmp_compose="$compose_file.tmp"
update_compose_images "$compose_file" "$tmp_compose" "$backend_ref" "$frontend_ref"
mv "$tmp_compose" "$compose_file"

echo "[remote] restart services"
docker compose -f "$compose_file" up -d redis backend frontend

for i in {1..30}; do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[remote] healthcheck passed"
    echo "$VERSION" > "$APP_DIR/.deployed-version"
    rm -f "$backup_file"
    trap - ERR
    exit 0
  fi
  sleep 2
done

echo "[remote] healthcheck failed: $HEALTH_URL"
exit 1
