#!/bin/bash

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 RBAC 本地一键验证开始...${NC}"

echo -e "${BLUE}1/5 生成 Prisma Client...${NC}"
pnpm -F @qgs/backend exec prisma generate --schema=./prisma/schema.prisma

echo -e "${BLUE}2/5 同步数据库结构...${NC}"
pnpm -F @qgs/backend run db:push

echo -e "${BLUE}3/5 回填旧权限到 RBAC V2...${NC}"
pnpm -F @qgs/backend run db:rbac-backfill

echo -e "${BLUE}4/5 执行 RBAC 一致性检查...${NC}"
pnpm -F @qgs/backend run db:rbac:check

echo -e "${GREEN}✅ 数据准备完成${NC}"
echo -e "${BLUE}5/5 启动本地开发环境（前端+后端）...${NC}"
pnpm dev:antd

echo -e "${RED}如果看到这行，说明 dev 已退出。${NC}"
