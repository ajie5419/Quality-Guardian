# CONSTRAINTS.md — 硬约束

本文件记录不可违反的技术约束。违反任一条即阻断合并。

## 禁止

1. **禁止**使用 npm 或 yarn，只用 pnpm
2. **禁止**手动修改数据库表结构，必须通过 Prisma migration
3. **禁止**在代码中硬编码密钥、token、数据库连接串
4. **禁止**在 `utils/` 中放业务逻辑，业务逻辑属于 `modules/`
5. **禁止**模块之间 import 对方的内部文件（只能通过 `index.ts` 导出）
6. **禁止**在路由文件中直接写业务逻辑，必须调用 service
7. **禁止**跳过认证（每个非 public 端点必须 `verifyAccessToken`）
8. **禁止**返回非标准响应格式（必须用 `useResponseSuccess` 系列）
9. **禁止**在 migration 文件中写业务数据操作
10. **禁止**提交未通过 `pnpm lint && pnpm run check:type` 的代码

## 必须

1. **必须**在提交前通过：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch`
2. **必须**对所有用户输入做校验（`getMissingRequiredFields` 或 zod）
3. **必须**对数据库查询加 `isDeleted: false` 过滤（软删除）
4. **必须**在 catch 块中调用 `logApiError` 记录错误
5. **必须**新增业务逻辑时附带单元测试
6. **必须**使用 cuid 作为主键生成策略
7. **必须**分页接口限制 pageSize 上限（max 100）
8. **必须**原始 SQL 使用参数化查询，防止注入

## 完成定义

功能完成 = 端到端验证通过，不是"代码写完了"。

验证层级（严格顺序，上层未通过禁止进入下层）：

1. **单元测试通过** — `pnpm --dir apps/backend exec vitest run`
2. **集成测试通过** — 相关模块联合验证
3. **端到端流程验证通过** — 完整业务路径走通

## 路由层规范

1. **路由文件不超过 50 行** — 超过说明业务逻辑该提到 modules/ 的 service 里
2. **路由文件禁止直接 import prisma** — 通过 modules/ 下的 service 访问数据
3. **readBody 必须过 zod schema 校验** — 不允许 `as Record<string, unknown>` 或 `as any`

## 字段与数据规范

1. **禁止**在代码中硬编码业务数据值（工序名、供应商名、字典项等），必须从数据库或配置读取
2. **禁止**在多处重复定义字段名/列名，表结构以 `prisma/schema.prisma` 为唯一真源
3. **禁止**用字符串字面量做业务分支判断（如 `if (status === '已完成')`），必须用枚举常量
4. **必须**新增主数据类型时提供对应的管理接口（CRUD），不允许只在代码里写死列表
5. **必须**引用主数据时存 ID（外键），不能只存 name 文本

## 架构守护（自动化）

`pnpm run check:qms-arch` 在提交前自动执行，检查以下规则：

- api/ 文件不得 import prisma
- api/ 文件不超过 50 行
- utils/ 只允许白名单内的基础设施文件
- 不得存在 services/、core/module-registry/、core/master-data/ 目录
- modules/ 之间不得 import 对方内部文件（只能通过 index.ts）
- 不得出现中文字符串字面量做条件判断（检测 `=== '..中文..'` 模式）

违反任一条即阻断提交。
