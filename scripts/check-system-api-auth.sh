#!/usr/bin/env bash

set -euo pipefail

# One-click system API auth smoke test
# Usage:
#   BASE_URL=http://127.0.0.1:3000 \
#   ADMIN_TOKEN='xxx' \
#   NON_ADMIN_TOKEN='yyy' \
#   ADMIN_ONLY=true \
#   bash ./scripts/check-system-api-auth.sh
#
# Expected:
#   - admin:     NOT 401/403 (permission passed)
#   - non-admin: 403 (ADMIN_ONLY=true 时跳过)
#   - anonymous: 401

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
NON_ADMIN_TOKEN="${NON_ADMIN_TOKEN:-}"
ADMIN_ONLY="${ADMIN_ONLY:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo -e "${RED}❌ 缺少 ADMIN_TOKEN${NC}"
  echo "示例："
  echo "BASE_URL=http://127.0.0.1:3000 ADMIN_TOKEN=... bash ./scripts/check-system-api-auth.sh"
  echo "或（只测管理员 + 未登录）："
  echo "BASE_URL=http://127.0.0.1:3000 ADMIN_TOKEN=... ADMIN_ONLY=true bash ./scripts/check-system-api-auth.sh"
  exit 1
fi

if [[ "${ADMIN_ONLY,,}" != "true" && -z "${NON_ADMIN_TOKEN}" ]]; then
  echo -e "${RED}❌ 未设置 NON_ADMIN_TOKEN。${NC}"
  echo "请补 NON_ADMIN_TOKEN，或加 ADMIN_ONLY=true 跳过普通用户校验。"
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0

request_status() {
  local method="$1"
  local path="$2"
  local token="$3"
  local body="${4:-}"
  local url="${BASE_URL}${path}"

  if [[ -n "${token}" ]]; then
    if [[ -n "${body}" ]]; then
      curl -sS -o /dev/null -w "%{http_code}" \
        -X "${method}" "${url}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "${body}"
    else
      curl -sS -o /dev/null -w "%{http_code}" \
        -X "${method}" "${url}" \
        -H "Authorization: Bearer ${token}"
    fi
  else
    if [[ -n "${body}" ]]; then
      curl -sS -o /dev/null -w "%{http_code}" \
        -X "${method}" "${url}" \
        -H "Content-Type: application/json" \
        -d "${body}"
    else
      curl -sS -o /dev/null -w "%{http_code}" \
        -X "${method}" "${url}"
    fi
  fi
}

assert_admin_ok() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local status
  status="$(request_status "${method}" "${path}" "${ADMIN_TOKEN}" "${body}")"
  if [[ "${status}" == "401" || "${status}" == "403" ]]; then
    echo -e "${RED}❌ ADMIN ${method} ${path} -> ${status}${NC}"
    ((FAIL_COUNT += 1))
  else
    echo -e "${GREEN}✅ ADMIN ${method} ${path} -> ${status}${NC}"
    ((PASS_COUNT += 1))
  fi
}

assert_non_admin_forbidden() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local status
  status="$(request_status "${method}" "${path}" "${NON_ADMIN_TOKEN}" "${body}")"
  if [[ "${status}" == "403" ]]; then
    echo -e "${GREEN}✅ NON_ADMIN ${method} ${path} -> ${status}${NC}"
    ((PASS_COUNT += 1))
  else
    echo -e "${RED}❌ NON_ADMIN ${method} ${path} -> ${status} (期望 403)${NC}"
    ((FAIL_COUNT += 1))
  fi
}

assert_anonymous_unauthorized() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local status
  status="$(request_status "${method}" "${path}" "" "${body}")"
  if [[ "${status}" == "401" ]]; then
    echo -e "${GREEN}✅ ANON ${method} ${path} -> ${status}${NC}"
    ((PASS_COUNT += 1))
  else
    echo -e "${RED}❌ ANON ${method} ${path} -> ${status} (期望 401)${NC}"
    ((FAIL_COUNT += 1))
  fi
}

echo -e "${BLUE}=== System API 权限一键校验 ===${NC}"
echo "BASE_URL: ${BASE_URL}"
echo

# method|path|body
CASES=(
  "GET|/api/system/monitor|"
  "POST|/api/system/settings/qms%3Aauth-test|{\"value\":\"ok\",\"description\":\"auth smoke test\"}"
  "PUT|/api/system/dept/__auth_test_nonexistent|{\"name\":\"auth-test\"}"
  "DELETE|/api/system/dept/__auth_test_nonexistent|"
  "PUT|/api/system/menu/__auth_test_nonexistent|{\"name\":\"AUTH_TEST_MENU\",\"path\":\"/auth-test\"}"
  "DELETE|/api/system/menu/__auth_test_nonexistent|"
  "PUT|/api/system/role/__auth_test_nonexistent|{\"name\":\"Auth Test Role\"}"
  "DELETE|/api/system/role/__auth_test_nonexistent|"
  "PUT|/api/system/user/__auth_test_nonexistent|{\"realName\":\"Auth Test\"}"
  "DELETE|/api/system/user/__auth_test_nonexistent|"
  "POST|/api/system/user/__auth_test_nonexistent/reset-password|"
)

for case_item in "${CASES[@]}"; do
  IFS='|' read -r method path body <<<"${case_item}"
  assert_admin_ok "${method}" "${path}" "${body}"
  if [[ "${ADMIN_ONLY,,}" != "true" ]]; then
    assert_non_admin_forbidden "${method}" "${path}" "${body}"
  fi
  assert_anonymous_unauthorized "${method}" "${path}" "${body}"
  echo
done

echo -e "${BLUE}=== 汇总 ===${NC}"
echo -e "通过: ${GREEN}${PASS_COUNT}${NC}"
echo -e "失败: ${RED}${FAIL_COUNT}${NC}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  exit 1
fi

echo -e "${GREEN}🎉 所有 system API 权限校验通过${NC}"
