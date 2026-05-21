#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
QMS_USERNAME="${QMS_USERNAME:-${USERNAME:-vben}}"
QMS_PASSWORD="${QMS_PASSWORD:-${PASSWORD:-123456}}"
RESULT_DIR="${RESULT_DIR:-./tmp/upload-bench}"
RUN_SECONDS="${RUN_SECONDS:-20}"
WARMUP_SECONDS="${WARMUP_SECONDS:-5}"
BACKEND_PID="${BACKEND_PID:-}"

SIZES_MB=(10 30 50)
CONCURRENCY=(10 30 50)

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd node
need_cmd mktemp

mkdir -p "$RESULT_DIR"

HEALTH_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/status?status=204" || true)"
if [ "$HEALTH_CODE" != "204" ]; then
  echo "Backend not reachable at $BASE (health=$HEALTH_CODE)" >&2
  exit 1
fi

echo "INFO base=$BASE user=$QMS_USERNAME run=${RUN_SECONDS}s warmup=${WARMUP_SECONDS}s"

LOGIN_JSON="$(curl -sS -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$QMS_USERNAME\",\"password\":\"$QMS_PASSWORD\"}")"
TOKEN="$(printf '%s' "$LOGIN_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s||'{}');process.stdout.write(String(o?.data?.accessToken||''));})")"
if [ -z "$TOKEN" ]; then
  echo "Login failed; no token" >&2
  exit 1
fi
AUTH_VALUE="Bearer $TOKEN"

echo "INFO backend_pid=${BACKEND_PID:-unknown}"

PAYLOAD_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$PAYLOAD_DIR"
}
trap cleanup EXIT

for size in "${SIZES_MB[@]}"; do
  file="$PAYLOAD_DIR/payload-${size}mb.bin"
  dd if=/dev/zero of="$file" bs=1m count="$size" status=none
  echo "INFO prepared $file"
done

run_case() {
  local size_mb="$1"
  local c="$2"
  local duration="$3"
  local tag="$4"
  local payload="$PAYLOAD_DIR/payload-${size}mb.bin"
  local out_json="$RESULT_DIR/${tag}.json"

  node - <<'NODE' "$BASE" "$AUTH_VALUE" "$payload" "$c" "$duration" "$out_json" "$BACKEND_PID"
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');

const [base, authValue, filePath, concRaw, durationRaw, outJson, pidRaw] = process.argv.slice(2);
const conc = Number(concRaw);
const durationMs = Number(durationRaw) * 1000;
const pid = pidRaw ? Number(pidRaw) : 0;

const boundary = '----codexBench' + Math.random().toString(16).slice(2);
const fieldHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bench.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`);
const fieldFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
const fileBuffer = fs.readFileSync(filePath);
const body = Buffer.concat([fieldHeader, fileBuffer, fieldFooter]);

const headers = {
  'Content-Type': `multipart/form-data; boundary=${boundary}`,
  'Content-Length': String(body.length),
  'Authorization': authValue,
};

let running = true;
let sent = 0;
let ok = 0;
let fail = 0;
const latencies = [];
const start = Date.now();
let peakRssKb = 0;

function sampleRssKb() {
  if (!pid) return 0;
  const rs = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
  if (rs.status !== 0) return 0;
  const v = Number(String(rs.stdout || '').trim() || '0');
  return Number.isFinite(v) ? v : 0;
}

async function oneReq() {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/upload`, {
      method: 'POST',
      headers,
      body,
    });
    const txt = await res.text();
    let code = -1;
    try {
      code = JSON.parse(txt || '{}')?.code;
    } catch {}
    if (res.status === 200 && code === 0) ok++;
    else fail++;
  } catch {
    fail++;
  } finally {
    latencies.push(Date.now() - t0);
    sent++;
    const rss = sampleRssKb();
    if (rss > peakRssKb) peakRssKb = rss;
  }
}

async function worker() {
  while (running) {
    await oneReq();
  }
}

(async () => {
  const workers = Array.from({length: conc}, () => worker());
  await new Promise((r) => setTimeout(r, durationMs));
  running = false;
  await Promise.all(workers);

  const elapsed = Date.now() - start;
  latencies.sort((a,b)=>a-b);
  const pick = (p) => latencies.length ? latencies[Math.min(latencies.length-1, Math.floor(latencies.length*p))] : 0;

  const result = {
    elapsedMs: elapsed,
    requests: sent,
    success: ok,
    failed: fail,
    rps: sent * 1000 / elapsed,
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    p99Ms: pick(0.99),
    avgMs: latencies.length ? latencies.reduce((a,b)=>a+b,0)/latencies.length : 0,
    peakRssKb,
    payloadBytes: body.length,
    concurrency: conc,
  };

  fs.writeFileSync(outJson, JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result));
})();
NODE
}

for size in "${SIZES_MB[@]}"; do
  for c in "${CONCURRENCY[@]}"; do
    tag="warmup_${size}mb_c${c}"
    echo "INFO warmup $tag"
    run_case "$size" "$c" "$WARMUP_SECONDS" "$tag" >/dev/null
  done
done

summary_file="$RESULT_DIR/summary.tsv"
echo -e "case\tsize_mb\tconcurrency\treq\tsuccess\tfail\trps\tp50_ms\tp95_ms\tp99_ms\tavg_ms\tpeak_rss_kb" > "$summary_file"

for size in "${SIZES_MB[@]}"; do
  for c in "${CONCURRENCY[@]}"; do
    tag="run_${size}mb_c${c}"
    echo "INFO run $tag"
    result_json="$(run_case "$size" "$c" "$RUN_SECONDS" "$tag")"
    req="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.requests));})")"
    success="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.success));})")"
    failc="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.failed));})")"
    rps="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.rps.toFixed(2)));})")"
    p50="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.p50Ms));})")"
    p95="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.p95Ms));})")"
    p99="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.p99Ms));})")"
    avg="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.avgMs.toFixed(2)));})")"
    peak="$(printf '%s' "$result_json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);process.stdout.write(String(o.peakRssKb||0));})")"

    echo -e "$tag\t$size\t$c\t$req\t$success\t$failc\t$rps\t$p50\t$p95\t$p99\t$avg\t$peak" >> "$summary_file"
  done
done

echo "INFO benchmark done. summary=$summary_file"
cat "$summary_file"
