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

# 安装 OpenSSL (Prisma 运行必需)
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. 复制构建产物
COPY --from=builder /app/apps/backend/.output /app/.output
COPY --from=builder /app/apps/backend/prisma /app/prisma
COPY --from=builder /app/apps/backend/package.json /app/package.json

# 2. 关键修复：直接安装生产环境所需的 Prisma 二进制包，彻底解决 monorepo 软链接失效问题
# 这样 npx prisma db seed 运行时就能在容器本地找到完整环境
RUN npm install @prisma/client@6.2.1 prisma@6.2.1 --omit=dev

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# 自动化序列：同步结构 -> 填充菜单数据 -> 启动服务
CMD ["sh", "-c", "npx prisma@6.2.1 db push --accept-data-loss --skip-generate --schema=prisma/schema.prisma && npx prisma@6.2.1 db seed && node .output/server/index.mjs"]
