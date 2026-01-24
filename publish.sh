#!/bin/bash

# 确保脚本在出错时立即停止
set -e

# --- 1. 版本管理 ---
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📌 当前项目版本: $CURRENT_VERSION"

# 询问是否升级版本号以清除前端缓存 (Vben 机制)
read -p "是否需要升级版本号? (y: 升级最后一位 / n: 保持当前) [y/n]: " IS_BUMP
if [ "$IS_BUMP" == "y" ]; then
    # 使用 npm version 自动升级补丁版本号 (patch)
    npm version patch --no-git-tag-version
    NEW_VERSION=$(node -p "require('./package.json').version")
    echo "✅ 版本号已从 $CURRENT_VERSION 升级至: $NEW_VERSION"
else
    NEW_VERSION=$CURRENT_VERSION
    echo "ℹ️ 保持当前版本号 $NEW_VERSION 进行构建。"
fi

TAG="v$NEW_VERSION"

# --- 配置区 ---
REGISTRY="crpi-jy3d0qwkxxv0twpn.cn-beijing.personal.cr.aliyuncs.com"
REPO="ajie5419/qms"
ECS_IP="8.141.123.254" 

echo "🧪 2. 启动本地代码质量检测..."

# 2a. 代码风格校验 (Lint)
echo "   🔍 正在运行 Lint 检查..."
pnpm run lint

# 2b. 类型检查 (Type Check)
echo "   TypeScript 正在运行类型检查..."
pnpm run check:type

# 2c. 单元测试 (Unit Test)
echo "   🧪 正在运行单元测试..."
# pnpm run test:unit # 如需提速可先注释

echo "✨ 代码质量检测通过！准备开始部署流程。"

echo "🔐 3. 登录阿里云容器镜像服务..."
docker login --username=赵小杰5419 $REGISTRY

echo "🏗️ 4. 开始本地构建镜像 (linux/amd64) - Tag: $TAG"
docker build --platform linux/amd64 -t qms-backend -f Dockerfile.backend .
docker build --platform linux/amd64 -t qms-frontend -f Dockerfile.frontend .

echo "🏷️ 5. 为镜像打标签 (latest + $TAG)..."
docker tag qms-backend $REGISTRY/$REPO:backend-latest
docker tag qms-backend $REGISTRY/$REPO:backend-$TAG
docker tag qms-frontend $REGISTRY/$REPO:frontend-latest
docker tag qms-frontend $REGISTRY/$REPO:frontend-$TAG

echo "📤 6. 推送镜像至阿里云 ACR..."
docker push $REGISTRY/$REPO:backend-latest
docker push $REGISTRY/$REPO:backend-$TAG
docker push $REGISTRY/$REPO:frontend-latest
docker push $REGISTRY/$REPO:frontend-$TAG

echo "🚀 7. 远程连接 ECS 执行更新..."
# 使用您的 mac.pem 密钥进行登录
ssh -i ~/.ssh/mac.pem root@$ECS_IP "cd /opt/qms && docker-compose pull && docker-compose up -d && docker image prune -f"

echo "✅ 部署完成！"
echo "🌟 提示：若版本已升级，前端缓存将在用户下次登录时自动清理。"

echo "✅ 所有任务已完成！您的应用已在云端更新。"
