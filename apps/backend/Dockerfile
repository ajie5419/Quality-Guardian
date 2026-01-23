FROM node:22-slim AS builder

# 安装构建时需要的库
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm i -g corepack && corepack enable

WORKDIR /app

COPY . .

# 1. 设置镜像源并安装完整依赖
RUN pnpm config set registry https://registry.npmmirror.com
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install

# 2. 生成 Prisma Client
RUN pnpm --filter @qgs/backend exec prisma generate --schema=prisma/schema.prisma

# 3. 构建后端产物
RUN pnpm run build --filter=@qgs/backend

# 4. 关键：提取自包含的后端环境（解决软链接问题）
# 这会将 @qgs/backend 及其依赖平铺到 /app/standalone 目录
RUN pnpm --filter @qgs/backend deploy standalone

# 生产阶段
FROM node:22-slim AS production

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. 从提取好的 standalone 目录复制完整依赖和代码
COPY --from=builder /app/standalone /app
# 2. 复制 Nitro 构建后的生产产物（覆盖源码中的 output）
COPY --from=builder /app/apps/backend/.output /app/.output

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# 自动化序列：
# 使用容器本地的 prisma 二进制文件，确保版本 6.2.1 且无需联网
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --accept-data-loss --skip-generate --schema=prisma/schema.prisma && ./node_modules/.bin/prisma db seed && node .output/server/index.mjs"]
