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

# 生产阶段
FROM node:22-slim AS production

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. 关键修复：安装生产环境所需的运行时依赖
# 除了 Prisma，还需要安装 bcrypt 供种子脚本加密密码使用
# 设置 PRISMA_ENGINES_MIRROR 解决 binaries.prisma.sh 下载问题
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
RUN npm config set registry https://registry.npmmirror.com && \
    npm install prisma@6.2.1 @prisma/client@6.2.1 bcrypt@6.0.0 --omit=dev

# 2. 复制构建产物、Prisma 定义和 package.json
COPY --from=builder /app/apps/backend/.output /app/.output
COPY --from=builder /app/apps/backend/prisma /app/prisma
COPY --from=builder /app/apps/backend/package.json /app/package.json

# 3. 核心修复：在生产环境 node_modules 中生成 Prisma Client
# 这一步不可或缺，否则会报 "@prisma/client did not initialize yet"
RUN npx prisma generate --schema=prisma/schema.prisma

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# 自动化序列：
# 1. db push: 同步表结构
# 2. db seed: 自动填充菜单数据，彻底解决 404 问题
# 3. node start: 运行服务
CMD ["sh", "-c", "npx prisma@6.2.1 db push --accept-data-loss --skip-generate --schema=prisma/schema.prisma && npx prisma@6.2.1 db seed && node .output/server/index.mjs"]
