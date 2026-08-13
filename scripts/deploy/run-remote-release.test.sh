#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER="$ROOT_DIR/scripts/deploy/run-remote-release.sh"
WORKFLOW="$ROOT_DIR/.github/workflows/deploy.yml"
OSS_ENTRYPOINT="$ROOT_DIR/scripts/deploy/one-click-oss.sh"
TEST_DIRECTORIES=()

cleanup() {
  local directory
  for directory in "${TEST_DIRECTORIES[@]}"; do
    rm -rf "$directory"
  done
}
trap cleanup EXIT

assert_contains() {
  local needle="$1"
  local file="$2"
  grep -Fq -- "$needle" "$file" || { echo "missing '$needle' in $file" >&2; exit 1; }
}

assert_not_contains() {
  local needle="$1"
  local file="$2"
  if grep -Fq -- "$needle" "$file"; then
    echo "unexpected '$needle' in $file" >&2
    exit 1
  fi
}

assert_before() {
  local earlier="$1"
  local later="$2"
  local file="$3"
  local earlier_line later_line
  earlier_line="$(grep -Fn -- "$earlier" "$file" | head -n 1 | cut -d: -f1)"
  later_line="$(grep -Fn -- "$later" "$file" | head -n 1 | cut -d: -f1)"
  [[ -n "$earlier_line" && -n "$later_line" && "$earlier_line" -lt "$later_line" ]] || {
    echo "expected '$earlier' before '$later' in $file" >&2
    exit 1
  }
}

assert_occurrences() {
  local needle="$1"
  local expected="$2"
  local file="$3"
  local actual
  actual="$(grep -Fc -- "$needle" "$file" || true)"
  [[ "$actual" == "$expected" ]] || {
    echo "expected $expected occurrences of '$needle' in $file, got $actual" >&2
    exit 1
  }
}

assert_outer_timeout_budget() {
  assert_contains 'command_timeout: 60m' "$WORKFLOW"
  assert_contains '120m' "$OSS_ENTRYPOINT"
  assert_contains 'timeout --signal=TERM --kill-after=30s' "$RUNNER"
}

assert_oss_runner_paths() {
  assert_contains 'REMOTE_DEPLOY_RUNNER="/tmp/qg-deploy-from-oss.sh"' "$OSS_ENTRYPOINT"
  assert_contains 'REMOTE_RELEASE_EXECUTOR="/tmp/qg-run-remote-release.sh"' "$OSS_ENTRYPOINT"
  assert_contains '"$REMOTE_USER@$REMOTE_HOST:$REMOTE_DEPLOY_RUNNER"' "$OSS_ENTRYPOINT"
  assert_contains '"$REMOTE_USER@$REMOTE_HOST:$REMOTE_RELEASE_EXECUTOR"' "$OSS_ENTRYPOINT"
  assert_contains '"bash $REMOTE_DEPLOY_RUNNER' "$OSS_ENTRYPOINT"
  assert_contains "--executor-path \$REMOTE_RELEASE_EXECUTOR" "$OSS_ENTRYPOINT"
}

make_fake_commands() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  cat > "$bin_dir/docker" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
log="${FAKE_LOG:?}"
containers="${FAKE_CONTAINERS:?}"
printf '%s\n' "$*" >> "$log"
if [[ "$1" == container && "$2" == ls ]]; then
  if [[ "${FAKE_SCENARIO:-}" == preflight-error ]]; then exit 1; fi
  filter="$(sed -n 's/.*name=\([^ ]*\).*/\1/p' <<< "$*")"
  if [[ "$filter" == '^/qms-backend-run-' ]]; then
    if [[ "${FAKE_SCENARIO:-}" == legacy-preflight-error ]]; then exit 1; fi
    for path in "$containers"/qms-backend-run-*; do
      [[ -e "$path" ]] && basename "$path"
    done
  else
    name="$(sed -n 's/.*name=\^\/\([^$]*\)\$.*/\1/p' <<< "$*")"
    if [[ -e "$containers/$name" ]]; then printf '%s\n' "$name"; fi
  fi
  exit 0
fi
if [[ "$1" == rm ]]; then
  rm -f "$containers/${@: -1}"
  exit 0
fi
if [[ "$1" == system ]]; then exit 0; fi
if [[ "$1" == compose ]]; then
  arguments="$*"
  if [[ " $arguments " == *" run "* ]]; then
    name="$(sed -n 's/.*--name \([^ ]*\).*/\1/p' <<< "$arguments")"
    touch "$containers/$name"
    if [[ "$arguments" == *run-prisma-migrations* && "${FAKE_SCENARIO:-}" == migration-failure ]]; then exit 1; fi
    if [[ "$arguments" == *run-release-maintenance* && "${FAKE_SCENARIO:-}" == maintenance-failure ]]; then exit 1; fi
  fi
  if [[ "$arguments" == *'up -d redis backend frontend'* && "${FAKE_SCENARIO:-}" == start-services-failure ]]; then
    attempts_file="$containers/start-services-attempts"
    attempts=0
    [[ -f "$attempts_file" ]] && attempts="$(cat "$attempts_file")"
    attempts=$((attempts + 1))
    printf '%s\n' "$attempts" > "$attempts_file"
    [[ "$attempts" == 1 ]] && exit 1
  fi
fi
SCRIPT
  cat > "$bin_dir/timeout" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
while [[ "$1" == --* ]]; do shift; done
shift
if [[ "$*" == *run-release-maintenance* && "${FAKE_SCENARIO:-}" == maintenance-timeout ]]; then
  "$@" || true
  exit 124
fi
if [[ "$*" == *'docker container ls'* && "${FAKE_SCENARIO:-}" == preflight-timeout ]]; then
  exit 124
fi
if [[ "$*" == *'name=^/qms-backend-run-'* && "${FAKE_SCENARIO:-}" == legacy-preflight-timeout ]]; then
  exit 124
fi
"$@"
SCRIPT
cat > "$bin_dir/curl" <<'SCRIPT'
#!/usr/bin/env bash
printf 'curl scenario=%s\n' "${FAKE_SCENARIO:-}" >> "${FAKE_LOG:?}"
[[ "${FAKE_SCENARIO:-}" != health-failure ]]
SCRIPT
  cat > "$bin_dir/sleep" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
  cat > "$bin_dir/flock" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
  chmod +x "$bin_dir/docker" "$bin_dir/timeout" "$bin_dir/curl" "$bin_dir/sleep" "$bin_dir/flock"
}

run_case() {
  local scenario="$1"
  local expected_status="$2"
  local existing_directory="${3:-}"
  local directory
  directory="${existing_directory:-$(mktemp -d)}"
  if [[ -z "$existing_directory" ]]; then
    TEST_DIRECTORIES+=("$directory")
    mkdir -p "$directory/bin" "$directory/containers"
    make_fake_commands "$directory/bin"
    cat > "$directory/docker-compose.yml" <<'YAML'
services:
  backend:
    image: old-backend
  frontend:
    image: old-frontend
  redis:
    image: redis
YAML
  fi
  if [[ "$scenario" == residual ]]; then touch "$directory/containers/qms-release-maintenance"; fi
  if [[ "$scenario" == legacy-residual ]]; then touch "$directory/containers/qms-backend-run-abcd1234"; fi

  set +e
  PATH="$directory/bin:$PATH" FAKE_LOG="$directory/docker.log" FAKE_CONTAINERS="$directory/containers" FAKE_SCENARIO="$scenario" \
    HEALTHCHECK_TIMEOUT_SECONDS=1 \
    bash "$RUNNER" --compose-file "$directory/docker-compose.yml" --backend-image backend:new --frontend-image frontend:new --version test >"$directory/output.log" 2>&1
  local status=$?
  set -e
  [[ "$status" == "$expected_status" ]] || { cat "$directory/output.log"; exit 1; }

  CASE_DIRECTORY="$directory"
}

run_case success 0
assert_contains 'stage=release-maintenance state=complete' "$CASE_DIRECTORY/output.log"
assert_contains 'image: backend:new' "$CASE_DIRECTORY/docker-compose.yml"
[[ ! -e "$CASE_DIRECTORY/containers/qms-release-migration" ]]
[[ ! -e "$CASE_DIRECTORY/containers/qms-release-maintenance" ]]
assert_before 'run --name qms-release-migration' 'run --name qms-release-maintenance' "$CASE_DIRECTORY/docker.log"
assert_before 'run --name qms-release-maintenance' 'up -d redis backend frontend' "$CASE_DIRECTORY/docker.log"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"

run_case migration-failure 1
assert_contains 'stage=prisma-migrate state=failed' "$CASE_DIRECTORY/output.log"
assert_contains 'image: old-backend' "$CASE_DIRECTORY/docker-compose.yml"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"
assert_not_contains 'up -d redis backend frontend' "$CASE_DIRECTORY/docker.log"

run_case maintenance-failure 1
assert_contains 'stage=release-maintenance state=failed' "$CASE_DIRECTORY/output.log"
assert_contains 'image: old-backend' "$CASE_DIRECTORY/docker-compose.yml"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"
assert_not_contains 'up -d redis backend frontend' "$CASE_DIRECTORY/docker.log"

run_case maintenance-timeout 1
assert_contains 'stage=release-maintenance state=failed' "$CASE_DIRECTORY/output.log"
[[ ! -e "$CASE_DIRECTORY/containers/qms-release-maintenance" ]]
assert_contains 'image: old-backend' "$CASE_DIRECTORY/docker-compose.yml"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"
assert_not_contains 'up -d redis backend frontend' "$CASE_DIRECTORY/docker.log"

run_case start-services-failure 1
assert_contains 'stage=start-services state=failed' "$CASE_DIRECTORY/output.log"
assert_contains 'image: old-backend' "$CASE_DIRECTORY/docker-compose.yml"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"
assert_occurrences 'up -d redis backend frontend' 2 "$CASE_DIRECTORY/docker.log"

run_case health-failure 1
assert_contains 'stage=healthcheck state=failed' "$CASE_DIRECTORY/output.log"
assert_contains 'image: old-frontend' "$CASE_DIRECTORY/docker-compose.yml"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"
assert_occurrences 'up -d redis backend frontend' 2 "$CASE_DIRECTORY/docker.log"

run_case residual 1
assert_contains 'pre-existing one-off container: qms-release-maintenance' "$CASE_DIRECTORY/output.log"
[[ -e "$CASE_DIRECTORY/containers/qms-release-maintenance" ]]
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"

run_case legacy-residual 1
assert_contains 'pre-existing legacy backend one-off container: qms-backend-run-abcd1234' "$CASE_DIRECTORY/output.log"
[[ -e "$CASE_DIRECTORY/containers/qms-backend-run-abcd1234" ]]
assert_contains 'image: old-backend' "$CASE_DIRECTORY/docker-compose.yml"
assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"

for scenario in preflight-error preflight-timeout legacy-preflight-error legacy-preflight-timeout; do
  run_case "$scenario" 1
  if [[ "$scenario" == legacy-* ]]; then
    assert_contains 'unable to inspect legacy backend one-off containers' "$CASE_DIRECTORY/output.log"
  else
    assert_contains 'unable to inspect one-off container state' "$CASE_DIRECTORY/output.log"
  fi
  assert_contains 'image: old-backend' "$CASE_DIRECTORY/docker-compose.yml"
  [[ ! -f "$CASE_DIRECTORY/docker.log" ]] || assert_not_contains 'stop backend' "$CASE_DIRECTORY/docker.log"
done

# A timeout must leave no release container behind, so the next invocation can proceed.
run_case maintenance-timeout 1
timeout_directory="$CASE_DIRECTORY"
run_case success 0 "$timeout_directory"
assert_contains 'stage=healthcheck state=complete' "$CASE_DIRECTORY/output.log"
assert_outer_timeout_budget
assert_oss_runner_paths

echo "run-remote-release shell behavior tests passed"
