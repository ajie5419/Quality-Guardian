# @qgs/backend

Quality Guardian QMS 后端服务，基于 Nitro (H3) + Prisma + MySQL。

详细文档见项目根目录的 [AGENTS.md](../../AGENTS.md)。

## 开发

```bash
pnpm dev          # 启动开发服务器（随前端一起）
pnpm build        # 构建生产产物
```

## 数据库

```bash
pnpm --dir apps/backend exec prisma migrate deploy   # 应用迁移
pnpm --dir apps/backend exec prisma generate         # 生成 client
```

## 验证门禁

```bash
pnpm lint
pnpm run check:type
pnpm run check:qms-arch
```
