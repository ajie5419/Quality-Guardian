# AGENTS.md — Quality Guardian

## 会话启动必读

开始任何任务前，先读以下文件获取上下文：

1. `CONSTRAINTS.md` — 硬约束（禁止/必须）
2. `PROGRESS.md` — 当前工作状态与下一步

改动某个模块时，先读该模块的 `ARCHITECTURE.md`（如果存在）。

## 模型路由

- 主代理固定使用 `gpt-5.6-sol`，负责需求理解、规划、架构决策、任务拆分、结果审查和最终验收。
- 调查、编码、重构、调试和测试执行必须委派给 `terra_executor` 子代理，模型固定为 `gpt-5.6-terra`。
- 主代理不得在 Terra 可用时自行实施业务代码变更；只可执行必要的只读检查、结果整合与最终验证。
- 主代理必须等待所有 Terra 子代理完成，审查其变更并独立验证后才能交付。
- 如果 `gpt-5.6-terra` 在当前运行时不可用，必须停止执行并明确报告阻塞，禁止静默替换模型。
- 最终答复必须简要披露实际模型分工以及是否发生路由失败。

## 项目概览

Quality Guardian 是一套面向制造业的质量管理系统（QMS），覆盖检验策划、报检任务、检验记录、不合格品处理、供应商管理、计量器具、监督检查等核心质量业务流程。

## 技术栈

| 层        | 技术              | 版本                         |
| --------- | ----------------- | ---------------------------- |
| 运行时    | Node.js           | >=20.10.0                    |
| 包管理    | pnpm              | 10.12.4                      |
| 后端框架  | Nitro (H3)        | nitropack 2.11.13, h3 1.15.3 |
| ORM       | Prisma            | 6.2.1                        |
| 数据库    | MySQL             | 8.x                          |
| 前端框架  | Vue 3             | 3.5.17                       |
| UI 组件库 | Ant Design Vue    | 4.2.6                        |
| 构建工具  | Vite              | 6.3.5                        |
| 类型检查  | TypeScript        | 5.8.3                        |
| 测试      | Vitest            | 3.2.4                        |
| 语言      | TypeScript (全栈) | —                            |

## 项目结构

```
apps/
├── backend/          # Nitro 后端（文件路由）
│   ├── api/          # 路由入口（薄层：认证 + 解析 + 调 service）
│   ├── modules/      # 业务模块（按域自包含，所有业务逻辑在这里）
│   ├── utils/        # 通用基础设施（prisma、logger、response、auth）
│   ├── middleware/   # H3 中间件（认证、数据权限、日志）
│   ├── prisma/       # Schema + Migrations
│   ├── routes/       # catch-all 兜底路由
│   └── config/       # 运行时配置
└── web-antd/         # Vue 3 前端

packages/
└── qgs-shared/       # 前后端共享类型、枚举、领域纯函数
```

## 生产环境

| 资源 | 配置 |
| --- | --- |
| 应用服务器 | 2 核 4 GB |
| 文件存储 | 阿里云 OSS（环境变量 `OSS_PROVIDER=aliyun` + `OSS_BUCKET` + `OSS_ENDPOINT` + `OSS_ACCESS_KEY_ID` + `OSS_ACCESS_KEY_SECRET`） |
| 数据库 | 阿里云 RDS for MySQL 8.x（环境变量 `DATABASE_URL`） |

部署注意：

- OSS 环境变量缺失时，文件会落到容器本地 `uploads/` 目录，重启数据丢失
- RDS 连接串必须通过环境变量注入，禁止写入代码或提交到 git
- 服务器内存有限（4 GB），慎用全量加载到内存的查询（见 CONSTRAINTS.md 性能规范）

## 首次运行

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env   # 配置 DATABASE_URL
pnpm --dir apps/backend exec prisma migrate deploy
pnpm --dir apps/backend exec prisma generate
pnpm dev
```

## 硬约束（不可违反）

1. **包管理器**：只用 pnpm，禁止 npm/yarn
2. **数据库变更**：必须通过 Prisma migration，禁止手动改表
3. **密钥安全**：禁止读取/输出/硬编码 `.env`、私钥、token
4. **提交前门禁**：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch` 必须通过
5. **utils/ 职责**：只放通用基础设施（prisma、logger、response、auth），业务逻辑放 modules/
6. **modules/ 自包含**：每个模块目录包含自己的 service、工具函数、类型，不依赖其他模块的内部文件
7. **语言规范**：代码、注释、commit message 用英文；对话和文档用中文

## 详细文档

- [架构设计](docs/architecture.md) — 后端目标架构与模块化方案
- [API 设计规范](docs/api-conventions.md) — 添加新端点时必读
- [数据库文档](docs/database.md) — Schema 设计、Migration 规范、命名约定
- [测试标准](docs/testing.md) — 测试分层、覆盖要求、编写规范
- [发布工作流](docs/release-workflow.md) — 功能 PR、release-please、tag 与生产部署流程
- [硬约束](CONSTRAINTS.md) — 禁止/必须的明确规则
- [项目进度](PROGRESS.md) — 当前工作状态与下一步
- [执行记录](CHANGELOG.md) — 每次重构执行的结果记录

## 执行规范

完成任何阶段性任务后，必须更新 CHANGELOG.md 记录执行结果（做了什么、验证结果、commit hash、遗留问题）。
