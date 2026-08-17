---
name: project-guide
description: Quality Guardian 项目宪法（单一事实源）。本文件是项目规范、红线、方法论的权威版本；AGENTS.md、CLAUDE.md、qg-project 技能均指向本文件，不再各自维护副本。
---

# Quality Guardian 项目档案（宪法）

> **本文件是整个项目的"大脑"**。任何 AI 或人在本项目工作前，必须先读本文件，再读 `PROJECT_STATE.md`（当前状态日报）。本文件是**规范的唯一权威来源**。发现 AGENTS.md / CLAUDE.md / 技能与本文冲突时，以本文为准，并同步修正其他文件。

## 1. 这是什么项目

面向制造业的质量管理系统（QMS），覆盖检验策划、报检任务、检验记录、不合格品处理、供应商管理、计量器具、监督检查等质量业务流程。

三端应用：桌面 Web（`apps/web-antd`）、微信小程序（`apps/weapp`）、后端 API（`apps/backend`）。

语言约定：**代码、注释、commit message 用英文；对话与文档用中文。**

## 2. 技术栈（catalog 单一来源）

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 运行时 | Node.js | >=20.10.0 |
| 包管理 | pnpm | 10.12.4（**只用 pnpm**，禁止 npm/yarn，preinstall 拦截） |
| 后端 | Nitro (H3) | nitropack 2.11.13, h3 1.15.3 |
| ORM | Prisma | 6.2.1（MySQL 8.x） |
| 前端 | Vue 3 + Ant Design Vue 4 + Vite 6 | 3.5.17 / 4.2.6 / 6.3.5 |
| 类型检查 | TypeScript | 5.8.3 |
| 测试 | Vitest | 3.2.4 |

> 版本号以 `pnpm-workspace.yaml` 的 catalog 为唯一事实；本表如与实际不符，以 catalog 为准并修正本表。

## 3. 项目结构

Monorepo（pnpm + turbo）：

```
apps/
├── backend/       # Nitro 后端：api/（薄路由）、modules/（业务逻辑）、utils/（基础设施）、prisma/、middleware/、routes/
├── web-antd/      # 桌面 Web（Vue 3）
└── weapp/         # 微信小程序
packages/
└── qgs-shared/    # 前后端共享类型/枚举/纯函数
```

## 4. 后端三层架构（严格分层，门禁强制）

```
api/        薄层 handler：认证 + 参数解析 + 调 service；≤50 行/文件；禁止 import prisma
modules/    全部业务逻辑；一个域一个目录；≤500 行/文件；自包含，只通过 index.ts 对外
utils/      通用基础设施：prisma、logger、response、jwt、redis、canonical-master-data 等
```

- 路由 handler 固定形状：`verifyAccessToken` → zod 解析 → 调 `modules/<x>/<x>.service` → `useResponseSuccess(...)` 等响应助手 → `try/catch` + `logApiError`。响应形状固定 `{ code, data, error, message }`，只准用 `utils/response.ts` 助手，禁止返回裸对象。
- 每个模块通过 `<module>.module.ts` 声明（菜单、dataScope、audit actions、idResolution），并在 `apps/backend/utils/module-loader.ts` 的 `MODULE_DECLARATIONS` 注册，否则框架级菜单/数据权限/审计看不到它。
- 跨模块数据访问只能走对方模块的 service（`index.ts`），禁止 import 其他模块内部文件（架构检查强制）。
- 认证：`middleware/3.auth.ts`（公开路径白名单 `/api/auth/login`、`/api/qms/public/`、`/api/uploads/` 等）。
- 数据权限：`middleware/4.data-scope.ts`（范围前缀 `after-sales`、`inspection`、`quality-loss`、`supplier`、`work-order`）。

## 5. 能做什么 / 应该怎么做（工作流）

### 新增一个业务模块

1. 在 `apps/backend/modules/<name>/` 建目录，创建 `<name>.module.ts` 声明 + service + index.ts。
2. 在 `apps/backend/utils/module-loader.ts` 的 `MODULE_DECLARATIONS` 注册。
3. 更新 `code_map.md`（门禁 B-MAP1 强制；新增顶层 API 路由目录、前端视图目录同理）。
4. 创建 `ARCHITECTURE.md`（可先放骨架：模块职责、关键表、对外接口）。

### 新增一个 API 端点

1. 在 `apps/backend/api/...` 建路由文件，遵循固定形状（见第 4 节）。
2. 添加端点前先读 `docs/api-conventions.md`。
3. 业务逻辑放 modules 的 service，不放路由文件。

### 改数据库（表结构）

1. 只改 `apps/backend/prisma/schema.prisma`。
2. 执行 `pnpm --dir apps/backend exec prisma migrate dev --name <英文描述>` 生成迁移。
3. 禁止手改表、手写迁移 SQL；迁移不得含业务数据写入（数据写入用独立脚本）。
4. 迁移后 `prisma generate`，改前读 `docs/database.md`。

### 写测试

- 测试文件与被测代码同目录（`foo.service.ts` + `foo.service.test.ts`），禁止集中式 `__tests__/`。
- mock `~/utils/prisma`，不碰真实 DB；测试文件允许 `as any` 做 mock。
- 写测试前读 `docs/testing.md`。

### 完成一项工作后（必须）

1. 向 `CHANGELOG.md` 追加记录（改了什么、验证结果、commit hash、遗留问题）。
2. 更新 `PROJECT_STATE.md`（版本、进度、最近变更——AI 负责）。
3. 更新 `code_map.md`（若涉及模块/路由/视图目录变化）。
4. 提交前跑门禁（见第 7 节）。

## 6. 不能做什么（红线，违反即阻塞合并）

1. 包管理器只用 pnpm。
2. 数据库变更必须走 Prisma migration，禁止手改表或手写迁移 SQL；迁移不得含业务数据写入。
3. 错误必须 `throw new BusinessError(code, message, httpStatus)`（`utils/business-error.ts`），禁止 `new Error('VALIDATION:...')` 等前缀字符串错误。
4. 并发安全：findFirst→检查状态→写入 序列的状态检查必须在 `$transaction` 内，或用 `updateMany({ where: { id, status: ... } })` 检查 count；跨事务 check-then-write 是竞态。
5. 软删除表所有查询带 `where: { isDeleted: false }`。
6. ID 只用 cuid（`@paralleldrive/cuid2` 或 Prisma `@default(cuid())`）；禁止 `Date.now()` 生成 ID。
7. 类型安全：禁止 `as any`、`!` 非空断言、`as unknown as T`（测试文件除外，`as const` 允许）。
8. 日志用 `createModuleLogger`；`console.log/warn/error` 被架构检查拦截。
9. 禁止空 catch（`catch {}`），至少 `logger.error(error, 'context')` 后再决定。
10. Raw SQL 只允许参数化（`$queryRaw`），禁止 `$queryRawUnsafe` + 模板字符串。
11. 性能（生产 2 核 4GB）：分页在 DB 层（skip/take，页上限 100），聚合用 groupBy/aggregate，禁止全表加载到内存再 JS 分页。
12. 生产文件存储阿里云 OSS（`OSS_PROVIDER=aliyun` 等环境变量）；环境变量缺失回退本地 `uploads/` 且重启丢失。RDS 连接串只经环境变量注入，禁止写入代码或提交。
13. 禁止把密钥、token、`.env` 写入代码或提交到 git。
14. **数据契约（详见 `docs/data-contract.md`）**：
    - 新增跨表/查询/统计/派生 name 字段必须登记 `master-data-fields.ts`，禁止未治理字段
    - `BusinessError.code` 必须用 `@qgs/shared` 的 `ErrorCode` 枚举，禁止自由字符串错误码
    - 主数据引用必须 `name` 快照 + `nameId` 成对，统计按 canonical ID 聚合
    - 前端必须从 `@qgs/shared` 消费类型/枚举，请求走统一封装，禁止裸 axios/fetch 与硬编码业务值

## 7. 常用命令与提交门禁（从仓库根执行）

```bash
pnpm dev                      # 全部应用
pnpm dev:antd                 # 后端 + web-antd
pnpm lint                     # 全量 lint（vsh）
pnpm run check:type           # turbo run typecheck
pnpm run check:qms-arch       # 架构门禁（changed 文件）
pnpm run check:qms-arch:all   # 架构门禁（全量）
pnpm run check:prisma-migration
pnpm run check:docs-drift     # 文档漂移检查（版本/模块清单/基线）
pnpm run docs:sync            # 自动同步 PROJECT_STATE 硬数据
pnpm test:unit                # 根目录 vitest run --dom
pnpm --dir apps/backend exec vitest run <path>   # 后端定向测试
pnpm --dir apps/backend exec tsc --noEmit        # 后端类型检查
```

**提交前必过门禁**：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch && pnpm run check:docs-drift`

## 8. 模型路由（AGENTS.md 强制，本系统默认）

- 主代理：需求理解、规划、架构决策、任务拆分、结果审查、最终验收。
- 调查/编码/重构/调试/测试执行委派 `terra_executor` 子代理。
- 主代理不得在 Terra 可用时自行实施业务代码变更；只做只读检查、结果整合与最终验证。
- 最终答复必须简要披露实际模型分工及是否发生路由失败。

## 9. 文档地图（什么场景读什么）

| 文档 | 内容 | 何时读 |
| --- | --- | --- |
| `PROJECT_STATE.md` | 当前状态日报（版本/进度/待办） | **每次开工** |
| `code_map.md` | 业务模块地图（模块/路由/视图索引） | 定位模块归属 |
| `CONSTRAINTS.md` | 硬约束全文 | 涉及红线时 |
| `docs/architecture.md` | 后端目标架构与模块化方案 | 架构决策 |
| `docs/api-conventions.md` | API 端点规范 | **添加新端点前** |
| `docs/database.md` | Schema 设计、Migration 规范 | 数据库变更前 |
| `docs/testing.md` | 测试分层、mock 模板 | 写测试前 |
| `docs/release-workflow.md` | 发布流程 | 发布/提 PR 前 |
| `docs/after-sales-quality-loss.md` | 售后/质量损失/报表三模块契约 | 改这三条链路前 |
| `docs/data-contract.md` | **数据契约规范**（字段治理/错误码/命名/前端/影响面） | **新增/改动数据字段、错误码、前端数据消费前** |
| `docs/permission-module.md` | **权限模块文档**（授权组件/权限码字典/门禁/数据范围/token/运维脚本） | 涉及权限码、authorizeWrite、数据范围、403 排查前 |
| `docs/master-data-identity-governance.md` | 主数据身份治理 | 涉及 identity/canonical ID |
| `docs/optimization-plan.md` | 2026-08 优化路线图 | 接优化任务前 |
| `docs/weapp-development.md` | 微信小程序开发 | 改 `apps/weapp/` 前 |
| 各模块 `ARCHITECTURE.md` | 模块内部架构 | 改该模块前 |

## 10. 文档一致性规则（防漂移）

1. **本文档（PROJECT_GUIDE）是规范唯一权威**。AGENTS.md / CLAUDE.md / qg-project 技能只做索引与指向，不复制规范正文；发现不一致以本文为准。
2. **硬数据必须由脚本生成**：版本、模块数、文件数、测试数等由 `pnpm run docs:sync` 从仓库实测写入 `PROJECT_STATE.md`，禁止手写快照。
3. **门禁拦截**：`pnpm run check:docs-drift` 校验 版本号 / 模块清单（`modules/*/` ↔ code_map 双向）/ 基线 是否漂移，漂移即拦截提交。
4. **状态由 AI 维护**：每个 AI 会话完成工作后，必须更新 `PROJECT_STATE.md`（进度、最近变更、待办勾选），并如实记录"上次更新时间与核对会话"。
5. **新 AI 交接流程**：开工先读本文档第 1-6 节 + `PROJECT_STATE.md`，再动手；结束前更新 `PROJECT_STATE.md` 与 `CHANGELOG.md`。

## 11. 知识库四层载体分工（维护规范）

项目知识不是"放在哪里都一样"。**载体的执行性决定 AI 会不会真的遵守**。按执行性从弱到强分为四层，新内容必须按此分工放置：

| 层 | 载体 | 执行机制 | 执行性 | 适合放什么 |
| --- | --- | --- | --- | --- |
| 1 | `docs/*.md` 等普通文档 | 被动阅读：AI 想起才读 | ⭐ 弱 | 规范**完整正文**、方案、契约（人类可读、可审查） |
| 2 | `AGENTS.md` / `CLAUDE.md`（仓库根） | **自动注入**：每个会话开始必然进入 AI 上下文 | ⭐⭐⭐ 中 | 短路由指令：先读什么、禁止什么（只写指向，不写正文） |
| 3 | Skill（`.dsh/skills/`，如 `qg-project`） | **按需加载**：任务匹配 `whenToUse` 时 AI 主动加载，加载即当轮指令 | ⭐⭐⭐⭐ 强 | 工作流、开工顺序、按需判断规则（精炼，不复制正文） |
| 4 | 门禁脚本（`check:qms-arch` / `check:docs-drift`） | **机器强制**：不靠自觉，违规直接拦截 | ⭐⭐⭐⭐⭐ 最强 | 可程序化判断的硬红线（错误码、字段登记、裸请求、漂移） |

### 放置规则

1. **正文进 docs，指令进 AGENTS/Skill，红线进门禁**——不要在一处重复维护同一条规则。
2. **注入/加载的内容必须精炼**：AGENTS.md 与 skill 只放"短指令 + 指向"，超长规范放 docs；内容越长，AI 对每条的执行注意力越稀释。
3. **新规则落地的顺序**：先成文（docs）→ 再同步进 AGENTS/Skill 索引 → 可程序化判断的最后进层门禁。
4. **四层分工的边界判断**：
   - 需要"解释为什么"的 → 第 1 层 docs
   - 需要"每个会话都知道"的 → 第 2 层 AGENTS
   - 需要"干这类活时才想起来"的 → 第 3 层 skill
   - 需要"违反就必须拦下"的 → 第 4 层门禁
5. **既有内容归属自查**：发现同一条规则在 docs + skill + 门禁三处重复，立即收敛为"docs 正文 + 索引 + 门禁"三处各司其职。
