#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN=false
ROLLBACK_TAG=""

usage() {
    cat <<USAGE
用法:
  ./publish.sh [--dry-run] [--rollback-tag <tag>]

参数:
  --dry-run            仅打印将执行的命令，不实际执行
  --rollback-tag <tag> 回滚/部署到指定版本标签（如 v1.1.17 或 1.1.17）
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback-tag)
            if [[ $# -lt 2 ]]; then
                echo -e "${RED}❌ --rollback-tag 缺少参数${NC}"
                usage
                exit 1
            fi
            ROLLBACK_TAG="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}❌ 未知参数: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

if [[ -n "$ROLLBACK_TAG" && "$ROLLBACK_TAG" != v* ]]; then
    ROLLBACK_TAG="v$ROLLBACK_TAG"
fi

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

run_cmd() {
    if $DRY_RUN; then
        echo "[DRY-RUN] $*"
    else
        eval "$*"
    fi
}

if [[ -n "$ROLLBACK_TAG" ]]; then
    TAG="$ROLLBACK_TAG"
    echo -e "${YELLOW}↩️ 回滚模式：将部署指定版本 $TAG${NC}"
else
    # --- 1. 代码检查 ---
    echo -e "${BLUE}🧪 1. 代码质量检测...${NC}"
    if $DRY_RUN; then
        echo "[DRY-RUN] pnpm run lint"
        echo "[DRY-RUN] pnpm run check:type"
    else
        FAIL=0
        pnpm run lint & LINT_PID=$!
        pnpm run check:type & TYPE_PID=$!

        wait $LINT_PID || { echo -e "${RED}❌ Lint 失败${NC}"; FAIL=1; }
        wait $TYPE_PID || { echo -e "${RED}❌ 类型检查失败${NC}"; FAIL=1; }

        if [ "$FAIL" -ne 0 ]; then
            echo -e "${RED}❌ 检测未通过，终止部署${NC}"
            exit 1
        fi
    fi

    # --- 2. 版本管理 ---
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    echo -e "${BLUE}📌 当前项目版本: $CURRENT_VERSION${NC}"

    if $DRY_RUN; then
        IS_BUMP="${AUTO_BUMP:-n}"
        echo -e "${YELLOW}ℹ️ DRY-RUN 模式：跳过真实版本修改 (AUTO_BUMP=${IS_BUMP})${NC}"
    elif [ -z "${AUTO_BUMP:-}" ]; then
        read -p "是否需要升级版本号? (y: patch / m: minor / n: 保持) [y/m/n]: " IS_BUMP
    else
        IS_BUMP="${AUTO_BUMP}"
    fi

    case "$IS_BUMP" in
        y|Y)
            run_cmd "npm version patch --no-git-tag-version"
            ;;
        m|M)
            run_cmd "npm version minor --no-git-tag-version"
            ;;
        n|N|"")
            echo -e "${YELLOW}ℹ️ 保持当前版本号${NC}"
            ;;
        *)
            echo -e "${RED}❌ 无效选项${NC}"
            exit 1
            ;;
    esac

    NEW_VERSION=$(node -p "require('./package.json').version")
    echo -e "${GREEN}✅ 版本: $NEW_VERSION${NC}"

    TAG="v$NEW_VERSION"

    # --- 3. 登录 & 构建 ---
    echo -e "${BLUE}🔐 3. 登录阿里云镜像仓库...${NC}"
    run_cmd "echo \"$REGISTRY_PASSWORD\" | docker login --username=\"$REGISTRY_USERNAME\" --password-stdin \"$REGISTRY\""

    echo -e "${BLUE}🏗️ 4. 构建镜像 (BuildKit)...${NC}"
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain

    if $DRY_RUN; then
        echo "[DRY-RUN] docker build ... -t $REGISTRY/$REPO:backend-latest -t $REGISTRY/$REPO:backend-$TAG -f Dockerfile.backend ."
        echo "[DRY-RUN] docker build ... -t $REGISTRY/$REPO:frontend-latest -t $REGISTRY/$REPO:frontend-$TAG -f Dockerfile.frontend ."
    else
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
    fi

    # --- 5. 推送镜像 ---
    echo -e "${BLUE}📤 5. 推送镜像...${NC}"
    if $DRY_RUN; then
        echo "[DRY-RUN] docker push $REGISTRY/$REPO:backend-latest"
        echo "[DRY-RUN] docker push $REGISTRY/$REPO:backend-$TAG"
        echo "[DRY-RUN] docker push $REGISTRY/$REPO:frontend-latest"
        echo "[DRY-RUN] docker push $REGISTRY/$REPO:frontend-$TAG"
    else
        docker push "$REGISTRY/$REPO:backend-latest" & B_PUSH=$!
        docker push "$REGISTRY/$REPO:backend-$TAG" & B_TAG_PUSH=$!
        docker push "$REGISTRY/$REPO:frontend-latest" & F_PUSH=$!
        docker push "$REGISTRY/$REPO:frontend-$TAG" & F_TAG_PUSH=$!
        wait $B_PUSH $B_TAG_PUSH $F_PUSH $F_TAG_PUSH
    fi
fi

# --- 6. 远程部署（固定版本Tag + 自动回滚）---
echo -e "${BLUE}🚀 6. 执行远程部署...${NC}"

DEPLOY_SCRIPT=$(cat << EOF
set -euo pipefail
cd /opt/qms

rollback() {
    echo "❌ 部署过程失败，执行回滚..."
    if [ -f docker-compose.backup.yml ]; then
        cp docker-compose.backup.yml docker-compose.yml
        docker-compose up -d
    else
        echo "⚠️ 未找到 docker-compose.backup.yml，无法自动回滚"
    fi
}
trap rollback ERR

echo "📝 备份当前运行版本（在拉取新镜像前）..."
cp docker-compose.yml docker-compose.backup.yml

if [ -f docker-compose.next.yml ]; then
    cp docker-compose.next.yml docker-compose.yml
fi

echo "🏷️ 切换到目标镜像版本: $TAG"
sed -E -i \
  "s|(^[[:space:]]*image:[[:space:]]+).*:backend-[^[:space:]]+|\\1$REGISTRY/$REPO:backend-$TAG|" \
  docker-compose.yml
sed -E -i \
  "s|(^[[:space:]]*image:[[:space:]]+).*:frontend-[^[:space:]]+|\\1$REGISTRY/$REPO:frontend-$TAG|" \
  docker-compose.yml

echo "⬇️ 拉取新镜像..."
docker-compose pull backend frontend

echo "🚀 启动基础服务 (Redis)..."
docker-compose up -d redis
# 等待 Redis 就绪
sleep 3

echo "🔄 同步数据库 Schema (migrate deploy)..."
if ! docker-compose run --rm backend sh -c "cd /app && ./apps/backend/node_modules/.bin/prisma db push --schema=./prisma/schema.prisma --skip-generate"; then
    echo "❌ 数据库同步失败 (db push)"
    exit 1
fi

echo "🌱 执行数据库播种 (db seed)..."
docker-compose run --rm backend sh -c "cd /app/prisma && ln -sfn ../apps/backend/node_modules node_modules && node seed.js"

echo "🔄 更新后端服务..."
docker-compose up -d --no-deps backend

echo "⏳ 等待后端健康检查（10秒）..."
sleep 10

echo "🔄 更新前端..."
docker-compose up -d --no-deps frontend

echo "🧹 清理旧镜像..."
docker image prune -af --filter "until=168h"

trap - ERR
echo "✅ 部署完成"
EOF
)

# 6.0 上传配置（修复 env 丢失）
echo -e "${BLUE}📤 上传最新配置...${NC}"
run_cmd "scp -i \"$ECS_SSH_KEY\" -o StrictHostKeyChecking=no \"$SCRIPT_DIR/docker-compose.yml\" \"root@$ECS_IP:/opt/qms/docker-compose.next.yml\""

# 优先上传 .env.production，如果不存在则对应报警或回退
if [ -f "$SCRIPT_DIR/.env.production" ]; then
    run_cmd "scp -i \"$ECS_SSH_KEY\" -o StrictHostKeyChecking=no \"$SCRIPT_DIR/.env.production\" \"root@$ECS_IP:/opt/qms/.env.production\""
else
    echo -e "${YELLOW}⚠️ 本地未找到 .env.production，将使用 .env (可能导致 Redis 连接失败)${NC}"
    run_cmd "scp -i \"$ECS_SSH_KEY\" -o StrictHostKeyChecking=no \"$SCRIPT_DIR/.env\" \"root@$ECS_IP:/opt/qms/.env.production\""
fi

if $DRY_RUN; then
    echo "[DRY-RUN] ssh -i \"$ECS_SSH_KEY\" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \"root@$ECS_IP\" '<DEPLOY_SCRIPT>'"
    echo -e "${YELLOW}ℹ️ DRY-RUN 模式：已跳过远程部署和健康检查${NC}"
else
    if ssh -i "$ECS_SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@$ECS_IP" "$DEPLOY_SCRIPT"; then
        echo -e "${GREEN}✅ 远程部署成功${NC}"
    else
        echo -e "${RED}❌ 部署失败${NC}"
        exit 1
    fi
fi

# --- 7. 健康检查 ---
if $DRY_RUN; then
    echo -e "${GREEN}🎉 DRY-RUN 完成！目标版本: $TAG${NC}"
    exit 0
fi

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
