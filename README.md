# Quality Guardian

面向制造业的质量管理系统（QMS），覆盖检验策划、报检任务、检验记录、不合格品处理、供应商管理、计量器具、监督检查等核心质量业务流程。

## 技术栈

- **前端**：Vue 3 + Ant Design Vue + Vite
- **后端**：Nitro (H3) + Prisma + MySQL
- **语言**：TypeScript 全栈

## 快速开始

```bash
git clone https://github.com/ajie5419/Quality-Guardian.git
cd Quality-Guardian
pnpm install
cp apps/backend/.env.example apps/backend/.env  # 配置 DATABASE_URL
pnpm --dir apps/backend exec prisma migrate deploy
pnpm --dir apps/backend exec prisma generate
pnpm dev
```

## 项目结构

```
apps/
├── backend/     # Nitro 后端
└── web-antd/    # Vue 3 前端

packages/
└── qgs-shared/  # 前后端共享类型
```

## 文档

- [AGENTS.md](./AGENTS.md) — 项目概览、技术栈、生产环境
- [CONSTRAINTS.md](./CONSTRAINTS.md) — 开发硬约束
- [docs/](./docs/) — 架构设计、API 规范、数据库文档、测试标准

## License

[MIT](./LICENSE)
