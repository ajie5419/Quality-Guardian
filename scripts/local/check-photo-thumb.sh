#!/usr/bin/env bash
set -euo pipefail

# 用法:
# BASE="http://8.141.123.254" QMS_USERNAME="vben" QMS_PASSWORD="123456" ./scripts/local/check-photo-thumb.sh
# 兼容旧参数: USERNAME/PASSWORD（但不推荐，USERNAME 在 shell 中可能是保留变量）

BASE="${BASE:-http://127.0.0.1:3000}"
QMS_USERNAME="${QMS_USERNAME:-${USERNAME:-vben}}"
QMS_PASSWORD="${QMS_PASSWORD:-${PASSWORD:-123456}}"
YEAR="${YEAR:-2026}"

pass() { echo "✅ PASS - $1"; }
fail() { echo "❌ FAIL - $1"; exit 1; }
info() { echo "ℹ️  $1"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

need_cmd curl
need_cmd python3

info "BASE=$BASE, USERNAME=$QMS_USERNAME, YEAR=$YEAR"

LOGIN_JSON=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$QMS_USERNAME\",\"password\":\"$QMS_PASSWORD\"}") || fail "登录请求失败"

TOKEN=$(
  python3 - "$LOGIN_JSON" <<'PY'
import json, sys
try:
    data = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    payload = data.get("data") or {}
    print(payload.get("accessToken") or payload.get("token") or payload.get("access_token") or "")
except Exception:
    print("")
PY
)

[ -n "$TOKEN" ] || fail "登录失败，未获取 accessToken"
pass "登录成功，token 已获取"

AUTH_HEADER="Authorization: Bearer $TOKEN"

ISSUES_JSON=$(curl -sS "$BASE/api/qms/inspection/issues?page=1&pageSize=20&year=$YEAR" -H "$AUTH_HEADER") || fail "请求 inspection/issues 失败"
AFTER_JSON=$(curl -sS "$BASE/api/qms/after-sales?page=1&pageSize=20&year=$YEAR" -H "$AUTH_HEADER") || fail "请求 after-sales 失败"

pick_urls() {
  python3 - "$1" <<'PY'
import sys, json

def to_thumb(url: str):
    if not url:
        return ''
    if '?' in url:
        path, q = url.split('?', 1)
        q = '?' + q
    else:
        path, q = url, ''
    dot = path.rfind('.')
    if dot > 0:
        return path[:dot] + '_thumb.webp' + q
    return path + '_thumb.webp' + q

raw = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
if not raw:
    print('\n')
    raise SystemExit(0)

try:
    obj = json.loads(raw)
except Exception:
    print('\n')
    raise SystemExit(0)

data = obj.get('data')
if isinstance(data, dict):
    items = data.get('items') or []
elif isinstance(data, list):
    items = data
else:
    items = []
orig = ''
thumb = ''
for it in items:
    photos = it.get('photos')
    if isinstance(photos, list) and photos:
        p = photos[0]
        if isinstance(p, str):
            orig = p.strip()
            thumb = to_thumb(orig)
            break
        if isinstance(p, dict):
            u = (p.get('url') or '').strip() if isinstance(p.get('url'), str) else ''
            t = ''
            if isinstance(p.get('thumbUrl'), str):
                t = p.get('thumbUrl').strip()
            elif isinstance(p.get('thumbnailUrl'), str):
                t = p.get('thumbnailUrl').strip()
            orig = u
            thumb = t or to_thumb(u)
            if orig:
                break
print(orig)
print(thumb)
PY
}

ISSUES_URLS=$(pick_urls "$ISSUES_JSON")
ISSUES_ORIG=$(printf '%s' "$ISSUES_URLS" | sed -n '1p')
ISSUES_THUMB=$(printf '%s' "$ISSUES_URLS" | sed -n '2p')

AFTER_URLS=$(pick_urls "$AFTER_JSON")
AFTER_ORIG=$(printf '%s' "$AFTER_URLS" | sed -n '1p')
AFTER_THUMB=$(printf '%s' "$AFTER_URLS" | sed -n '2p')

ORIG_URL="${ISSUES_ORIG:-$AFTER_ORIG}"
THUMB_URL="${ISSUES_THUMB:-$AFTER_THUMB}"

[ -n "$ORIG_URL" ] || fail "未在接口结果中找到图片地址（先确认列表里有照片数据）"
[ -n "$THUMB_URL" ] || fail "未生成缩略图地址"
pass "已从接口解析到原图与缩略图地址"

abs_url() {
  local u="$1"
  if [[ "$u" =~ ^https?:// ]]; then
    echo "$u"
  else
    echo "$BASE$u"
  fi
}

ORIG_ABS=$(abs_url "$ORIG_URL")
THUMB_ABS=$(abs_url "$THUMB_URL")

info "原图: $ORIG_ABS"
info "缩略图: $THUMB_ABS"

THUMB_HEADER=$(curl -sSI "$THUMB_ABS") || fail "缩略图 HEAD 请求失败"
THUMB_CODE=$(printf '%s' "$THUMB_HEADER" | awk 'NR==1{print $2}')
THUMB_IS_WEBP=0
if printf '%s' "$THUMB_HEADER" | grep -qi '^Content-Type: *image/webp'; then
  THUMB_IS_WEBP=1
fi

if { [ "$THUMB_CODE" != "200" ] || [ "$THUMB_IS_WEBP" -ne 1 ]; } && [[ "$THUMB_ABS" == *"/uploads/"* ]]; then
  ALT_THUMB_ABS=$(printf '%s' "$THUMB_ABS" | sed 's#/uploads/#/api/uploads/#')
  info "缩略图静态路径不可用，切换 API 路径重试: $ALT_THUMB_ABS"
  ALT_HEADER=$(curl -sSI "$ALT_THUMB_ABS") || fail "缩略图 API 路径 HEAD 请求失败"
  ALT_CODE=$(printf '%s' "$ALT_HEADER" | awk 'NR==1{print $2}')
  if [ "$ALT_CODE" = "200" ] && printf '%s' "$ALT_HEADER" | grep -qi '^Content-Type: *image/webp'; then
    THUMB_ABS="$ALT_THUMB_ABS"
    THUMB_HEADER="$ALT_HEADER"
    THUMB_CODE="$ALT_CODE"
  fi
fi

[ "$THUMB_CODE" = "200" ] || fail "thumb status is not 200 (current: $THUMB_CODE)"
printf '%s' "$THUMB_HEADER" | grep -qi '^Content-Type: *image/webp' || fail "thumb content-type is not image/webp"
printf '%s' "$THUMB_HEADER" | grep -qi '^Cache-Control: .*max-age=' || fail "thumb cache-control max-age missing"
pass "thumb headers are correct (200 + webp + cache)"

ORIG_HEADER=$(curl -sSI "$ORIG_ABS") || fail "原图 HEAD 请求失败"
ORIG_SIZE=$(printf '%s' "$ORIG_HEADER" | awk -F': ' 'BEGIN{IGNORECASE=1} /^Content-Length:/ {gsub("\r", "", $2); print $2; exit}')
THUMB_SIZE=$(printf '%s' "$THUMB_HEADER" | awk -F': ' 'BEGIN{IGNORECASE=1} /^Content-Length:/ {gsub("\r", "", $2); print $2; exit}')

if [[ -n "${ORIG_SIZE:-}" && -n "${THUMB_SIZE:-}" ]]; then
  if [ "$THUMB_SIZE" -lt "$ORIG_SIZE" ]; then
    pass "缩略图体积更小（orig=${ORIG_SIZE}, thumb=${THUMB_SIZE}）"
  else
    info "注意：缩略图体积未明显小于原图（orig=${ORIG_SIZE}, thumb=${THUMB_SIZE}）"
  fi
else
  info "跳过体积对比（某一侧无 Content-Length）"
fi

pass "图片缩略图优化验收通过"
