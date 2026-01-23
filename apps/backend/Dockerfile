FROM node:22-slim AS builder

# 安装构建时需要的库（OpenSSL 对 Prisma 引擎必不可少）
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm i -g corepack && corepack enable

WORKDIR /app

COPY . .

# 1. 安装依赖
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# 2. 在构建阶段生成 Prisma Client
# 使用 --filter @qgs/backend 确保 pnpm 在正确的模块上下文中查找并执行 prisma 二进制文件
RUN pnpm --filter @qgs/backend exec prisma generate --schema=prisma/schema.prisma

# 3. 构建后端产物
RUN pnpm run build --filter=@qgs/backend

# 生产阶段
FROM node:22-slim AS production

# 生产环境运行也需要 OpenSSL
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从 builder 阶段复制构建产物和已经生成的 node_modules
COPY --from=builder /app/apps/backend/.output /app/.output
COPY --from=builder /app/apps/backend/prisma /app/prisma
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/backend/package.json /app/package.json

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# 启动前自动同步数据库结构，强制使用本地安装的 prisma 避免自动下载最新不兼容版本
CMD ["sh", "-c", "/app/node_modules/.bin/prisma db push --accept-data-loss --schema=prisma/schema.prisma && node .output/server/index.mjs"]
