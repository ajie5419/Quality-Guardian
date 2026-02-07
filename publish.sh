#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- 配置加载 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.deploy" ]; then
    source "$SCRIPT_DIR/.env.deploy"
else
    echo -e "${RED}❌ 错误：缺少 .env.deploy 配置文件${NC}"
    exit 1
fi

: "${REGISTRY:?未设置 REGISTRY}"
: "${REPO:?未设置 REPO}"
: "${ECS_IP:?未设置 ECS_IP}"
: "${ECS_SSH_KEY:?未设置 ECS_SSH_KEY}"

# --- 1. 版本管理 ---
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📌 当前项目版本: $CURRENT_VERSION${NC}"

if [ -z "${AUTO_BUMP:-}" ]; then
    read -p "是否需要升级版本号? (y: patch / m: minor / n: 保持) [y/m/n]: " IS_BUMP
else
    IS_BUMP="${AUTO_BUMP}"
fi

case "$IS_BUMP" in
    y|Y) npm version patch --no-git-tag-version ;;
    m|M) npm version minor --no-git-tag-version ;;
    n|N|"") echo -e "${YELLOW}ℹ️ 保持当前版本号${NC}" ;;
    *) echo -e "${RED}❌ 无效选项${NC}"; exit 1 ;;
esac

NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✅ 版本: $NEW_VERSION${NC}"

TAG="v$NEW_VERSION"

# --- 2. 代码检查 ---
echo -e "${BLUE}🧪 2. 代码质量检测...${NC}"
FAIL=0
pnpm run lint & LINT_PID=$!
pnpm run check:type & TYPE_PID=$!

wait $LINT_PID || { echo -e "${RED}❌ Lint 失败${NC}"; FAIL=1; }
wait $TYPE_PID || { echo -e "${RED}❌ 类型检查失败${NC}"; FAIL=1; }

if [ "$FAIL" -ne 0 ]; then
    echo -e "${RED}❌ 检测未通过，终止部署${NC}"
    exit 1
fi

# --- 3. 登录 & 构建 ---
echo -e "${BLUE}🔐 3. 登录阿里云镜像仓库...${NC}"
echo "$REGISTRY_PASSWORD" | docker login --username="$REGISTRY_USERNAME" --password-stdin "$REGISTRY"

echo -e "${BLUE}🏗️ 4. 构建镜像 (BuildKit)...${NC}"
export DOCKER_BUILDKIT=1
export BUILDKIT_PROGRESS=plain

# 并行构建
docker build --platform linux/amd64 \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --cache-from "$REGISTRY/$REPO:backend-latest" \
    -t "$REGISTRY/$REPO:backend-latest" \
    -t "$REGISTRY/$REPO:backend-$TAG" \
    -f Dockerfile.backend . &

BACKEND_PID=$!

docker build --platform linux/amd64 \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --cache-from "$REGISTRY/$REPO:frontend-latest" \
    -t "$REGISTRY/$REPO:frontend-latest" \
    -t "$REGISTRY/$REPO:frontend-$TAG" \
    -f Dockerfile.frontend . &

FRONTEND_PID=$!

wait $BACKEND_PID || { echo -e "${RED}❌ 后端构建失败${NC}"; exit 1; }
wait $FRONTEND_PID || { echo -e "${RED}❌ 前端构建失败${NC}"; exit 1; }

# --- 5. 推送镜像 ---
echo -e "${BLUE}📤 5. 推送镜像...${NC}"
docker push "$REGISTRY/$REPO:backend-latest" & B_PUSH=$!
docker push "$REGISTRY/$REPO:backend-$TAG" & B_TAG_PUSH=$!
docker push "$REGISTRY/$REPO:frontend-latest" & F_PUSH=$!
docker push "$REGISTRY/$REPO:frontend-$TAG" & F_TAG_PUSH=$!
wait $B_PUSH $B_TAG_PUSH $F_PUSH $F_TAG_PUSH

# --- 6. 远程部署（修复版）---
echo -e "${BLUE}🚀 6. 执行远程部署...${NC}"

DEPLOY_SCRIPT=$(cat << EOF
set -e
cd /opt/qms

echo "📝 备份当前运行版本（在拉取新镜像前）..."
# 🌟 关键修复：先备份当前配置，再拉取镜像
cp docker-compose.yml docker-compose.backup.yml

echo "⬇️ 拉取新镜像..."
docker-compose pull

echo "🚀 启动基础服务 (Redis)..."
docker-compose up -d redis
# 等待 Redis 就绪
sleep 3

echo "🔄 同步数据库 Schema (db push)..."
# 自动同步数据库结构
if ! docker-compose run --rm backend sh -c "cd /app && ./apps/backend/node_modules/.bin/prisma db push --schema=./prisma/schema.prisma --skip-generate"; then
    echo "❌ 数据库同步失败，执行回滚..."
    docker-compose -f docker-compose.backup.yml up -d
    exit 1
fi

echo "🌱 执行数据库播种 (db seed)..."
# 🌟 最终修复方案：
# 1. 进入脚本所在目录 /app/prisma
# 2. 建立指向后端完整 node_modules 的软链接
# 3. 直接运行 seed.js。这样 Node 会在当前目录找依赖，且 pnpm 的相对路径软链接能保持生效。
docker-compose run --rm backend sh -c "cd /app/prisma && ln -sfn ../apps/backend/node_modules node_modules && node seed.js"

echo "🔄 更新后端服务..."
# 🌟 关键修复：单台 ECS 不要用 scale=2，直接用 recreate
docker-compose up -d --no-deps backend

echo "⏳ 等待后端健康检查（10秒）..."
sleep 10

echo "🔄 更新前端..."
docker-compose up -d --no-deps frontend

echo "🧹 清理旧镜像..."
docker image prune -af --filter "until=168h"

echo "✅ 部署完成"
EOF
)

# 6.0 上传配置（修复 env 丢失）
echo -e "${BLUE}📤 上传最新配置...${NC}"
scp -i "$ECS_SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/docker-compose.yml" "root@$ECS_IP:/opt/qms/docker-compose.yml"

# 优先上传 .env.production，如果不存在则对应报警或回退
if [ -f "$SCRIPT_DIR/.env.production" ]; then
    scp -i "$ECS_SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/.env.production" "root@$ECS_IP:/opt/qms/.env.production"
else
    echo -e "${YELLOW}⚠️ 本地未找到 .env.production，将使用 .env (可能导致 Redis 连接失败)${NC}"
    scp -i "$ECS_SSH_KEY" -o StrictHostKeyChecking=no "$SCRIPT_DIR/.env" "root@$ECS_IP:/opt/qms/.env.production"
fi

if ssh -i "$ECS_SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@$ECS_IP" "$DEPLOY_SCRIPT"; then
    echo -e "${GREEN}✅ 远程部署成功${NC}"
else
    echo -e "${RED}❌ 部署失败${NC}"
    exit 1
fi

# --- 7. 健康检查 ---
echo -e "${BLUE}🏥 7. 健康检查...${NC}"
HEALTH_URL="http://$ECS_IP/api/status"
MAX_RETRIES=6
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 健康检查通过！${NC}"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo -e "${YELLOW}⏳ 等待服务就绪... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
        sleep 5
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ 健康检查失败，请检查: ssh root@$ECS_IP 'docker-compose logs backend'${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 部署完成！版本: $TAG${NC}"