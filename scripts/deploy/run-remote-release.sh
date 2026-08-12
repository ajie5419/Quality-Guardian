#!/usr/bin/env bash

# Runs on the production host after the requested images are available locally.
set -Eeuo pipefail

COMPOSE_FILE=""
BACKEND_IMAGE=""
FRONTEND_IMAGE=""
HEALTH_URL="http://127.0.0.1:3000/api/status"
VERSION=""

MIGRATION_CONTAINER="qms-release-migration"
MAINTENANCE_CONTAINER="qms-release-maintenance"
MIGRATION_TIMEOUT_SECONDS="${MIGRATION_TIMEOUT_SECONDS:-300}"
MAINTENANCE_TIMEOUT_SECONDS="${MAINTENANCE_TIMEOUT_SECONDS:-600}"
HEALTHCHECK_TIMEOUT_SECONDS="${HEALTHCHECK_TIMEOUT_SECONDS:-90}"

usage() {
  cat <<'USAGE'
Usage: run-remote-release.sh \
  --compose-file <path> \
  --backend-image <image> \
  --frontend-image <image> \
  --version <version> \
  [--health-url <url>]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    --backend-image) BACKEND_IMAGE="$2"; shift 2 ;;
    --frontend-image) FRONTEND_IMAGE="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --health-url) HEALTH_URL="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

: "${COMPOSE_FILE:?missing --compose-file}"
: "${BACKEND_IMAGE:?missing --backend-image}"
: "${FRONTEND_IMAGE:?missing --frontend-image}"
: "${VERSION:?missing --version}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if ! command -v timeout >/dev/null 2>&1; then
  echo "GNU timeout is required for bounded release stages" >&2
  exit 1
fi

if ! timeout --signal=TERM --kill-after=1s 1s true >/dev/null 2>&1; then
  echo "GNU timeout with --signal and --kill-after is required" >&2
  exit 1
fi

lock_file="/tmp/qms-release-deploy.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "another release is running: $lock_file" >&2
  exit 1
fi

backup_file="${COMPOSE_FILE}.bak"
backup_created=0
release_succeeded=0
migration_started=0
maintenance_started=0

stage_start() {
  echo "[release] stage=$1 state=start"
}

stage_complete() {
  echo "[release] stage=$1 state=complete"
}

stage_failed() {
  echo "[release] stage=$1 state=failed" >&2
}

run_with_timeout() {
  local seconds="$1"
  shift
  timeout --signal=TERM --kill-after=30s "${seconds}s" "$@"
}

run_stage() {
  local stage="$1"
  local seconds="$2"
  shift 2
  stage_start "$stage"
  if run_with_timeout "$seconds" "$@"; then
    stage_complete "$stage"
    return 0
  fi
  stage_failed "$stage"
  return 1
}

remove_release_containers() {
  if [[ "$migration_started" -eq 1 ]]; then
    run_with_timeout 30 docker rm -f "$MIGRATION_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [[ "$maintenance_started" -eq 1 ]]; then
    run_with_timeout 30 docker rm -f "$MAINTENANCE_CONTAINER" >/dev/null 2>&1 || true
  fi
}

rollback() {
  if [[ "$backup_created" -ne 1 ]]; then
    return
  fi

  echo "[release] restoring previous compose configuration"
  cp "$backup_file" "$COMPOSE_FILE" || true
  run_with_timeout 180 docker compose -f "$COMPOSE_FILE" up -d redis backend frontend || true
}

finish() {
  local status="$?"
  set +e
  remove_release_containers

  if [[ "$release_succeeded" -eq 1 ]]; then
    rm -f "$backup_file"
  else
    rollback
  fi

  exit "$status"
}
trap finish EXIT

preflight_release_containers() {
  local container existing legacy_containers legacy_container
  for container in "$MIGRATION_CONTAINER" "$MAINTENANCE_CONTAINER"; do
    if ! existing="$(run_with_timeout 30 docker container ls -a --filter "name=^/${container}$" --format '{{.Names}}')"; then
      echo "refusing release: unable to inspect one-off container state: $container" >&2
      return 1
    fi
    if [[ -n "$existing" ]]; then
      echo "refusing release: pre-existing one-off container: $container" >&2
      return 1
    fi
  done

  # Compose used this generated prefix before release one-offs received fixed names.
  # Docker's name filter is not the final authority because its matching semantics
  # can include substrings; the shell expression below requires the exact prefix.
  if ! legacy_containers="$(run_with_timeout 30 docker container ls -a --filter 'name=^/qms-backend-run-' --format '{{.Names}}')"; then
    echo "refusing release: unable to inspect legacy backend one-off containers" >&2
    return 1
  fi
  while IFS= read -r legacy_container; do
    if [[ "$legacy_container" =~ ^qms-backend-run-[[:alnum:]][[:alnum:]_.-]*$ ]]; then
      echo "refusing release: pre-existing legacy backend one-off container: $legacy_container" >&2
      return 1
    fi
  done <<< "$legacy_containers"
}

update_compose_images() {
  local source="$1"
  local destination="$2"
  awk -v backend="$BACKEND_IMAGE" -v frontend="$FRONTEND_IMAGE" '
    BEGIN { in_backend=0; in_frontend=0 }
    /^  backend:/ { in_backend=1; in_frontend=0; print; next }
    /^  frontend:/ { in_frontend=1; in_backend=0; print; next }
    /^  [^ ]/ { in_backend=0; in_frontend=0; print; next }
    {
      if (in_backend && $1 == "image:") { print "    image: " backend; next }
      if (in_frontend && $1 == "image:") { print "    image: " frontend; next }
      print
    }
  ' "$source" > "$destination"
}

run_one_off() {
  local stage="$1"
  local seconds="$2"
  local container="$3"
  local command="$4"

  case "$container" in
    "$MIGRATION_CONTAINER") migration_started=1 ;;
    "$MAINTENANCE_CONTAINER") maintenance_started=1 ;;
    *) echo "unexpected release container: $container" >&2; return 1 ;;
  esac

  stage_start "$stage"
  if run_with_timeout "$seconds" docker compose -f "$COMPOSE_FILE" run --name "$container" --no-deps backend sh -lc "$command"; then
    stage_complete "$stage"
    remove_release_containers
    return 0
  fi

  stage_failed "$stage"
  remove_release_containers
  return 1
}

baseline_existing_prisma_schema() {
  local baseline_command
  baseline_command="set -e; cd /app/apps/backend; prisma=/app/apps/backend/node_modules/.bin/prisma; schema=/app/apps/backend/prisma/schema.prisma; \$prisma db pull --print --schema \"\$schema\" > /tmp/qms-introspection.prisma; require_model() { grep -q \"^model \$1 {\" /tmp/qms-introspection.prisma || { echo \"required production table is missing: \$1\"; exit 1; }; }; mark_applied() { migration=\$1; log=/tmp/qms-resolve-\${migration}.log; if \$prisma migrate resolve --schema \"\$schema\" --applied \"\$migration\" >\"\$log\" 2>&1; then cat \"\$log\"; return 0; fi; if grep -Eiq 'already (applied|recorded|resolved)|has already been applied' \"\$log\"; then cat \"\$log\"; return 0; fi; cat \"\$log\"; return 1; }; require_model after_sales; require_model quality_records; require_model quality_losses; require_model qms_inspection_requests; require_model supplier_score_snapshots; grep -q '^  selfCheckDocuments ' /tmp/qms-introspection.prisma || { echo 'production schema is older than qgs-v0.10.2; refusing automatic baseline'; exit 1; }; baseline_through=20260617000100_add_inspection_self_check_documents; for migration in \$(ls -1 prisma/migrations | sort); do [ \"\$migration\" = migration_lock.toml ] && continue; [ -d \"prisma/migrations/\$migration\" ] || continue; mark_applied \"\$migration\"; [ \"\$migration\" = \"\$baseline_through\" ] && exit 0; done; echo \"baseline migration not found: \$baseline_through\"; exit 1"
  run_one_off "prisma-baseline" 300 "$MIGRATION_CONTAINER" "$baseline_command"
}

deploy_prisma_migrations() {
  local migration_log
  migration_log="/tmp/qms-migrate-deploy-${VERSION}.log"
  if run_one_off "prisma-migrate" "$MIGRATION_TIMEOUT_SECONDS" "$MIGRATION_CONTAINER" "cd /app/apps/backend && sh scripts/run-prisma-migrations.sh" > >(tee "$migration_log") 2>&1; then
    return 0
  fi

  if ! grep -q 'P3005' "$migration_log"; then
    return 1
  fi

  echo "[release] Prisma migrate deploy reported P3005; running guarded baseline"
  baseline_existing_prisma_schema
  run_one_off "prisma-migrate-retry" "$MIGRATION_TIMEOUT_SECONDS" "$MIGRATION_CONTAINER" "cd /app/apps/backend && sh scripts/run-prisma-migrations.sh"
}

healthcheck() {
  local deadline=$((SECONDS + HEALTHCHECK_TIMEOUT_SECONDS))
  stage_start "healthcheck"
  while (( SECONDS < deadline )); do
    if run_with_timeout 5 curl -fsS "$HEALTH_URL" >/dev/null; then
      stage_complete "healthcheck"
      return 0
    fi
    sleep 2
  done
  stage_failed "healthcheck"
  return 1
}

stage_start "preflight-release-containers"
if preflight_release_containers; then
  stage_complete "preflight-release-containers"
else
  stage_failed "preflight-release-containers"
  exit 1
fi
run_stage "docker-disk-usage-before" 30 docker system df || true

cp "$COMPOSE_FILE" "$backup_file"
backup_created=1
tmp_compose="${COMPOSE_FILE}.qms-new"
update_compose_images "$COMPOSE_FILE" "$tmp_compose"
mv "$tmp_compose" "$COMPOSE_FILE"

run_stage "pull-images" 300 docker compose -f "$COMPOSE_FILE" pull backend frontend
run_stage "start-redis" 120 docker compose -f "$COMPOSE_FILE" up -d redis
run_stage "stop-backend" 120 docker compose -f "$COMPOSE_FILE" stop backend
deploy_prisma_migrations
run_one_off "release-maintenance" "$MAINTENANCE_TIMEOUT_SECONDS" "$MAINTENANCE_CONTAINER" "cd /app/apps/backend && sh scripts/run-release-maintenance.sh"
run_stage "start-services" 180 docker compose -f "$COMPOSE_FILE" up -d redis backend frontend
healthcheck

printf '%s\n' "$VERSION" > "$(dirname "$COMPOSE_FILE")/.deployed-version"
release_succeeded=1
