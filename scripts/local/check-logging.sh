#!/usr/bin/env bash
set -euo pipefail

# Usage:
# BASE="http://127.0.0.1:5320" QMS_USERNAME="vben" QMS_PASSWORD="123456" ./scripts/local/check-logging.sh
#
# Optional env:
# REQUIRE_AUDIT=1    Enable supplier create/delete audit verification (default: 1)
# REQUIRE_CLIENT_LOG=1 Enable /system/log/client endpoint verification (default: 1)

BASE="${BASE:-http://localhost:3000}"
QMS_USERNAME="${QMS_USERNAME:-${USERNAME:-vben}}"
QMS_PASSWORD="${QMS_PASSWORD:-${PASSWORD:-123456}}"
REQUIRE_AUDIT="${REQUIRE_AUDIT:-1}"
REQUIRE_CLIENT_LOG="${REQUIRE_CLIENT_LOG:-1}"

pass() { echo "PASS - $1"; }
info() { echo "INFO - $1"; }
fail() { echo "FAIL - $1"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

need_cmd curl
need_cmd python3

ensure_base_reachable() {
  local configured="$1"
  local status

  status="$(curl -sS -o /dev/null -w "%{http_code}" "$configured/api/status?status=204" || true)"
  if [ "$status" = "204" ]; then
    BASE="$configured"
    return 0
  fi

  local candidates=(
    "http://localhost:3000"
    "http://127.0.0.1:3000"
    "http://[::1]:3000"
    "http://localhost:5320"
    "http://127.0.0.1:5320"
    "http://[::1]:5320"
  )

  for candidate in "${candidates[@]}"; do
    status="$(curl -sS -o /dev/null -w "%{http_code}" "$candidate/api/status?status=204" || true)"
    if [ "$status" = "204" ]; then
      BASE="$candidate"
      return 0
    fi
  done

  return 1
}

json_get() {
  local json="$1"
  local expr="$2"
  python3 - "$json" "$expr" <<'PY'
import json
import sys

raw = sys.argv[1] if len(sys.argv) > 1 else "{}"
expr = sys.argv[2] if len(sys.argv) > 2 else ""
try:
    obj = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)

cur = obj
for part in expr.split("."):
    if not part:
        continue
    if isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break

if cur is None:
    print("")
elif isinstance(cur, (dict, list)):
    print(json.dumps(cur, ensure_ascii=False))
else:
    print(str(cur))
PY
}

curl_json_with_status() {
  local method="$1"
  local url="$2"
  local payload="${3:-}"
  local auth_header="${4:-}"

  if [ -n "$payload" ]; then
    if [ -n "$auth_header" ]; then
      curl -sS -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -H "$auth_header" \
        -d "$payload" \
        -w $'\n__HTTP_STATUS__:%{http_code}'
    else
      curl -sS -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        -w $'\n__HTTP_STATUS__:%{http_code}'
    fi
  else
    if [ -n "$auth_header" ]; then
      curl -sS -X "$method" "$url" \
        -H "$auth_header" \
        -w $'\n__HTTP_STATUS__:%{http_code}'
    else
      curl -sS -X "$method" "$url" \
        -w $'\n__HTTP_STATUS__:%{http_code}'
    fi
  fi
}

extract_http_status() {
  local resp="$1"
  printf '%s' "$resp" | awk -F':' '
    /^__HTTP_STATUS__:/ {
      code = $2
    }
    END {
      gsub(/[[:space:]\r]/, "", code)
      print code
    }
  '
}

extract_http_body() {
  local resp="$1"
  printf '%s' "$resp" | sed '/^__HTTP_STATUS__:/d'
}

if ! ensure_base_reachable "$BASE"; then
  fail "No reachable backend found. Checked BASE=$BASE and common local addresses."
fi

info "BASE=$BASE USERNAME=$QMS_USERNAME"

# 1) Health check
HEALTH_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/status?status=204")" || fail "Health request failed"
[ "$HEALTH_CODE" = "204" ] || fail "Health status is not 204 (current: $HEALTH_CODE)"
pass "Backend health endpoint returns 204"

# 2) Failed login should be written into login_logs
PROBE_USERNAME="log_probe_$(date +%s)"
FAILED_LOGIN_RESP="$(curl_json_with_status "POST" "$BASE/api/auth/login" "{\"username\":\"$PROBE_USERNAME\",\"password\":\"wrong\"}" "")" || fail "Failed login probe request failed"
FAILED_LOGIN_STATUS="$(extract_http_status "$FAILED_LOGIN_RESP")"
[ "$FAILED_LOGIN_STATUS" = "403" ] || fail "Expected failed login status 403 (current: $FAILED_LOGIN_STATUS)"
pass "Failed login probe returned 403 as expected"

# 3) Successful login for authenticated checks
LOGIN_RESP="$(curl_json_with_status "POST" "$BASE/api/auth/login" "{\"username\":\"$QMS_USERNAME\",\"password\":\"$QMS_PASSWORD\"}" "")" || fail "Login request failed"
LOGIN_BODY="$(extract_http_body "$LOGIN_RESP")"
LOGIN_STATUS="$(extract_http_status "$LOGIN_RESP")"
[ "$LOGIN_STATUS" = "200" ] || fail "Login status is not 200 (current: $LOGIN_STATUS)"
TOKEN="$(json_get "$LOGIN_BODY" "data.accessToken")"
[ -n "$TOKEN" ] || fail "Login succeeded but accessToken is empty"
AUTH_HEADER="Authorization: Bearer $TOKEN"
pass "Login succeeded and token acquired"

# 4) Verify login log query includes failed probe username
LOGIN_LOG_RESP="$(curl_json_with_status "GET" "$BASE/api/system/login-log?page=1&pageSize=100&username=$PROBE_USERNAME" "" "$AUTH_HEADER")" || fail "Login log query failed"
LOGIN_LOG_BODY="$(extract_http_body "$LOGIN_LOG_RESP")"
LOGIN_LOG_STATUS="$(extract_http_status "$LOGIN_LOG_RESP")"
[ "$LOGIN_LOG_STATUS" = "200" ] || fail "Login log query status is not 200 (current: $LOGIN_LOG_STATUS)"
LOGIN_LOG_CODE="$(json_get "$LOGIN_LOG_BODY" "code")"
[ "$LOGIN_LOG_CODE" = "0" ] || fail "Login log query code is not 0 (current: $LOGIN_LOG_CODE)"
MATCHED_LOGIN_COUNT="$(
  python3 - "$LOGIN_LOG_BODY" "$PROBE_USERNAME" <<'PY'
import json
import sys

raw = sys.argv[1] if len(sys.argv) > 1 else "{}"
probe = sys.argv[2] if len(sys.argv) > 2 else ""
try:
    obj = json.loads(raw)
except Exception:
    print(0)
    raise SystemExit(0)

items = (((obj.get("data") or {}).get("items")) or [])
count = 0
for item in items:
    if str(item.get("username") or "") == probe:
        count += 1
print(count)
PY
)"
[ "$MATCHED_LOGIN_COUNT" -ge 1 ] || fail "Failed login probe user not found in /system/login-log"
pass "Login logs include failed login probe entry"

if [ "$REQUIRE_CLIENT_LOG" = "1" ]; then
  CLIENT_LOG_PAYLOAD="{\"type\":\"manual\",\"message\":\"codex-client-log-probe-$(date +%s)\",\"source\":\"check-logging.sh\"}"
  CLIENT_LOG_RESP="$(curl_json_with_status "POST" "$BASE/api/system/log/client" "$CLIENT_LOG_PAYLOAD" "$AUTH_HEADER")" || fail "Client log endpoint request failed"
  CLIENT_LOG_BODY="$(extract_http_body "$CLIENT_LOG_RESP")"
  CLIENT_LOG_STATUS="$(extract_http_status "$CLIENT_LOG_RESP")"
  [ "$CLIENT_LOG_STATUS" = "200" ] || fail "Client log endpoint status is not 200 (current: $CLIENT_LOG_STATUS)"
  CLIENT_LOG_CODE="$(json_get "$CLIENT_LOG_BODY" "code")"
  [ "$CLIENT_LOG_CODE" = "0" ] || fail "Client log endpoint code is not 0 (current: $CLIENT_LOG_CODE)"
  pass "Client log endpoint accepts payload"
else
  info "Skip client-log endpoint check (REQUIRE_CLIENT_LOG=$REQUIRE_CLIENT_LOG)"
fi

if [ "$REQUIRE_AUDIT" = "1" ]; then
  # 5) Audit log verification: create and delete a temporary supplier
  SUPPLIER_NAME="log-audit-probe-$(date +%s)"
  CREATE_PAYLOAD="{\"name\":\"$SUPPLIER_NAME\"}"
  CREATE_RESP="$(curl_json_with_status "POST" "$BASE/api/qms/supplier" "$CREATE_PAYLOAD" "$AUTH_HEADER")" || fail "Create supplier request failed"
  CREATE_BODY="$(extract_http_body "$CREATE_RESP")"
  CREATE_STATUS="$(extract_http_status "$CREATE_RESP")"
  [ "$CREATE_STATUS" = "200" ] || fail "Create supplier status is not 200 (current: $CREATE_STATUS)"
  CREATE_CODE="$(json_get "$CREATE_BODY" "code")"
  [ "$CREATE_CODE" = "0" ] || fail "Create supplier code is not 0 (current: $CREATE_CODE)"
  SUPPLIER_ID="$(json_get "$CREATE_BODY" "data.id")"
  [ -n "$SUPPLIER_ID" ] || fail "Create supplier succeeded but id is empty"
  pass "Audit probe supplier created: $SUPPLIER_ID"

  DELETE_RESP="$(curl_json_with_status "DELETE" "$BASE/api/qms/supplier/$SUPPLIER_ID" "" "$AUTH_HEADER")" || fail "Delete supplier request failed"
  DELETE_BODY="$(extract_http_body "$DELETE_RESP")"
  DELETE_STATUS="$(extract_http_status "$DELETE_RESP")"
  [ "$DELETE_STATUS" = "200" ] || fail "Delete supplier status is not 200 (current: $DELETE_STATUS)"
  DELETE_CODE="$(json_get "$DELETE_BODY" "code")"
  [ "$DELETE_CODE" = "0" ] || fail "Delete supplier code is not 0 (current: $DELETE_CODE)"
  pass "Audit probe supplier deleted"

  AUDIT_RESP="$(curl_json_with_status "GET" "$BASE/api/system/audit-log?page=1&pageSize=100&targetType=supplier" "" "$AUTH_HEADER")" || fail "Audit log query failed"
  AUDIT_BODY="$(extract_http_body "$AUDIT_RESP")"
  AUDIT_STATUS="$(extract_http_status "$AUDIT_RESP")"
  [ "$AUDIT_STATUS" = "200" ] || fail "Audit log query status is not 200 (current: $AUDIT_STATUS)"
  AUDIT_CODE="$(json_get "$AUDIT_BODY" "code")"
  [ "$AUDIT_CODE" = "0" ] || fail "Audit log query code is not 0 (current: $AUDIT_CODE)"
  MATCHED_AUDIT_COUNT="$(
    python3 - "$AUDIT_BODY" "$SUPPLIER_ID" "$SUPPLIER_NAME" <<'PY'
import json
import sys

raw = sys.argv[1] if len(sys.argv) > 1 else "{}"
supplier_id = sys.argv[2] if len(sys.argv) > 2 else ""
supplier_name = sys.argv[3] if len(sys.argv) > 3 else ""
try:
    obj = json.loads(raw)
except Exception:
    print(0)
    raise SystemExit(0)

items = (((obj.get("data") or {}).get("items")) or [])
count = 0
for item in items:
    target_id = str(item.get("targetId") or "")
    details = str(item.get("details") or "")
    if target_id == supplier_id or supplier_name in details:
        count += 1
print(count)
PY
)"
  [ "$MATCHED_AUDIT_COUNT" -ge 1 ] || fail "Audit logs do not contain probe supplier operation"
  pass "Audit logs include supplier probe operations"
else
  info "Skip audit log check (REQUIRE_AUDIT=$REQUIRE_AUDIT)"
fi

pass "Logging checks completed"
