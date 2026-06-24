#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${CONTAINER_ENV_FILE:-$ROOT_DIR/.env.container.local}"
ENV_EXAMPLE_FILE="$ROOT_DIR/.env.container.example"
UPLOADS_DIR="${CONTAINER_UPLOADS_DIR:-$ROOT_DIR/uploads/container-local}"

BACKEND_IMAGE="${CONTAINER_BACKEND_IMAGE:-qms-backend:container-local}"
FRONTEND_IMAGE="${CONTAINER_FRONTEND_IMAGE:-qms-frontend:container-local}"
MYSQL_IMAGE="${CONTAINER_MYSQL_IMAGE:-mysql:8.0}"
REDIS_IMAGE="${CONTAINER_REDIS_IMAGE:-redis:alpine}"

BACKEND_CONTAINER="${CONTAINER_BACKEND_NAME:-qms-container-backend}"
FRONTEND_CONTAINER="${CONTAINER_FRONTEND_NAME:-qms-container-frontend}"
MYSQL_CONTAINER="${CONTAINER_MYSQL_NAME:-qms-container-mysql}"
REDIS_CONTAINER="${CONTAINER_REDIS_NAME:-qms-container-redis}"

BACKEND_PORT="${CONTAINER_BACKEND_PORT:-3000}"
FRONTEND_PORT="${CONTAINER_FRONTEND_PORT:-8080}"
MYSQL_PORT="${CONTAINER_MYSQL_PORT:-3307}"
REDIS_PORT="${CONTAINER_REDIS_PORT:-6380}"

MYSQL_DATABASE="${CONTAINER_MYSQL_DATABASE:-quality_guard_container}"
MYSQL_USER="${CONTAINER_MYSQL_USER:-qms}"
MYSQL_PASSWORD="${CONTAINER_MYSQL_PASSWORD:-qms123456}"
MYSQL_ROOT_PASSWORD="${CONTAINER_MYSQL_ROOT_PASSWORD:-password}"

CONTAINER_DNS_NAME="${CONTAINER_DNS_NAME:-host.container.internal}"
CONTAINER_DNS_ADDRESS="${CONTAINER_DNS_ADDRESS:-203.0.113.113}"

require_container_cli() {
  if ! command -v container >/dev/null 2>&1; then
    echo "apple/container CLI not found. Install it from https://github.com/apple/container/releases"
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    echo "Created $ENV_FILE from $ENV_EXAMPLE_FILE"
    echo "Review DATABASE_URL before starting the local container stack."
    exit 1
  fi
}

ensure_container_system() {
  container system start >/dev/null
}

ensure_host_dns() {
  if container system dns list 2>/dev/null | grep -q "$CONTAINER_DNS_NAME"; then
    return
  fi

  echo "Creating host DNS entry for $CONTAINER_DNS_NAME"
  if ! container system dns create "$CONTAINER_DNS_NAME" --localhost "$CONTAINER_DNS_ADDRESS"; then
    echo "Failed to create container DNS entry. Try:"
    echo "  sudo container system dns create $CONTAINER_DNS_NAME --localhost $CONTAINER_DNS_ADDRESS"
    exit 1
  fi
}

remove_container_if_exists() {
  local name="$1"
  if container ls --all 2>/dev/null | grep -q "$name"; then
    container rm -f "$name" >/dev/null 2>&1 || true
  fi
}

container_exists() {
  local name="$1"
  container ls --all 2>/dev/null | grep -q "$name"
}

container_running() {
  local name="$1"
  container ls 2>/dev/null | grep -q "$name"
}

ensure_uploads_dir() {
  mkdir -p "$UPLOADS_DIR"
}

ensure_mysql() {
  if container_running "$MYSQL_CONTAINER"; then
    return
  fi

  if container_exists "$MYSQL_CONTAINER"; then
    echo "Starting MySQL container: $MYSQL_CONTAINER"
    container start "$MYSQL_CONTAINER" >/dev/null
  else
    echo "Creating MySQL container: $MYSQL_CONTAINER"
    container run -d \
      --name "$MYSQL_CONTAINER" \
      -e "MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD" \
      -e "MYSQL_DATABASE=$MYSQL_DATABASE" \
      -e "MYSQL_USER=$MYSQL_USER" \
      -e "MYSQL_PASSWORD=$MYSQL_PASSWORD" \
      -p "127.0.0.1:${MYSQL_PORT}:3306" \
      -v "qms-container-mysql-data:/var/lib/mysql" \
      "$MYSQL_IMAGE"
  fi

  echo "Waiting for MySQL..."
  for _ in {1..90}; do
    if container exec "$MYSQL_CONTAINER" mysqladmin ping -h 127.0.0.1 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --silent >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "MySQL did not become ready in time. Recent logs:"
  container logs "$MYSQL_CONTAINER" || true
  exit 1
}

ensure_redis() {
  if container_running "$REDIS_CONTAINER"; then
    return
  fi

  if container_exists "$REDIS_CONTAINER"; then
    echo "Starting Redis container: $REDIS_CONTAINER"
    container start "$REDIS_CONTAINER" >/dev/null
  else
    echo "Creating Redis container: $REDIS_CONTAINER"
    container run -d \
      --name "$REDIS_CONTAINER" \
      -p "127.0.0.1:${REDIS_PORT}:6379" \
      "$REDIS_IMAGE"
  fi

  echo "Waiting for Redis..."
  for _ in {1..30}; do
    if container exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
      return
    fi
    sleep 1
  done

  echo "Redis did not become ready in time. Recent logs:"
  container logs "$REDIS_CONTAINER" || true
  exit 1
}

ensure_host_port_free() {
  local port="$1"
  local purpose="$2"

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  local listeners
  listeners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$listeners" ]]; then
    return
  fi

  echo "Port $port is already in use, but it is required for $purpose."
  echo "$listeners"
  echo "Stop the old process first, then run this command again."
  exit 1
}
