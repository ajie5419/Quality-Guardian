#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/infra/docker"
TEST_ENV_FILE="$ROOT_DIR/.env.test.local"

# 本地 Docker 测试启动脚本
# 使用 .env.test.local 配置启动服务

echo "🚀 正在使用测试配置启动 Docker..."

# 1. 确保 .env.test.local 存在
if [ ! -f "$TEST_ENV_FILE" ]; then
    echo "❌ 未找到 .env.test.local 文件，请先创建！"
    exit 1
fi

# 2. 启动服务 (使用 override 文件)
# 注意：docker-compose.local.yml 必须在 docker-compose.yml 之后
docker compose \
  --env-file "$TEST_ENV_FILE" \
  -f "$COMPOSE_DIR/docker-compose.yml" \
  -f "$COMPOSE_DIR/docker-compose.local.yml" \
  up -d --build

echo "✅ 服务已启动 (测试模式)"
echo "⚠️  注意：如果您的数据库就在这台电脑上(宿主机)，Docker 内可能无法通过 'localhost' 访问。"
echo "    如果是 Mac，请在 .env.test.local 中将 host 改为 host.docker.internal"
echo "访问地址: http://localhost:80"
echo "后端地址: http://localhost:3000"
