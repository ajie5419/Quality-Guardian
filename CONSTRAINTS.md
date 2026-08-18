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
2. **必须**对所有用户输入做校验（zod schema）
3. **必须**对数据库查询加 `isDeleted: false` 过滤（软删除）
4. **必须**在 catch 块中调用 `logApiError` 记录错误
5. **必须**新增业务逻辑时附带单元测试
6. **必须**使用 cuid 作为主键生成策略（禁止 Date.now()）
7. **必须**分页接口限制 pageSize 上限（max 100）
8. **必须**原始 SQL 使用参数化查询，防止注入
9. **必须**在生产发布流程中把 migration 和本版本 manifest 声明、且 release ledger 尚未完成的启动前置幂等数据任务连续执行；依赖快照/物化指标的新功能不得要求人工进入生产容器补跑脚本
10. **禁止**把历史 remediation、sidecar 初始化或重建、投影重建、窗口或评分对账加入同步 release maintenance；这些任务必须走独立、可审计的运维流程
11. **必须**为 release maintenance 使用稳定的 `taskKey`、递增 `revision` 和 SHA-256 checksum；已完成 revision 的定义不得原地修改，checksum 漂移必须阻断发布

## Git Hooks 与质量门禁

1. **pre-commit** — 只处理暂存文件；Prettier、ESLint 和 Stylelint 自动修复后必须通过 Lefthook `stage_fixed` 重新暂存，禁止提交修复前的旧索引内容
2. **pre-push** — 并行执行 `pnpm run check:type` 与 `pnpm run check:qms-arch`，阻止类型错误和新增架构违规进入远端
3. **post-merge** — 仅当 `package.json`、`pnpm-lock.yaml` 或 `pnpm-workspace.yaml` 变化时执行 `pnpm install --frozen-lockfile`
4. **CI** — 执行全量 lint、typecheck、`check:qms-arch:all`、测试、migration 检查和密钥扫描；本地 hook 不能替代 CI

## 完成定义

功能完成 = 端到端验证通过，不是"代码写完了"。

验证层级（严格顺序，上层未通过禁止进入下层）：

1. **单元测试通过** — `pnpm --dir apps/backend exec vitest run`
2. **集成测试通过** — 相关模块联合验证
3. **端到端流程验证通过** — 完整业务路径走通

## 路由层规范

1. **路由文件不超过 50 行** — 超过说明业务逻辑该提到 modules/
2. **路由文件禁止直接 import prisma** — 通过 modules/ 下的 service 访问数据
3. **readBody 必须过 zod schema 校验** — 禁止 `as Record<string, unknown>` 或 `as any`

## Service 层规范

1. **单个 service 文件不超过 500 行** — 超过必须按职责拆分
2. **单个方法不超过 50 行** — 超过必须提取子函数
3. **禁止跨模块直接查表** — 需要其他模块的数据时调对方 service
4. **禁止 `(prisma.xxx as any)` 类型绕过** — 表必须在 schema 中声明
5. **禁止 `execSync`** — 所有外部命令必须异步执行
6. **禁止 `Date.now()` 生成 ID** — 统一使用 cuid
7. **禁止全量加载到内存再分页** — 分页在 DB 层（skip + take），聚合用 groupBy/aggregate
8. **禁止当前页内存排序伪装远程排序** — 列表开启远程排序时，`sortBy/sortOrder` 必须映射到数据库字段或已落库的指标快照字段，并在 DB 层完成 `orderBy + skip + take`
9. **禁止在 service 中嵌入文件解析逻辑** — Excel/CSV 解析提取到 utils/excel-parser.ts
10. **禁止前端拼接供应商画像历史项目** — 供应商/外协画像的历史使用项目必须通过后端 service 从报检任务聚合，不能读取当前页列表、当前页检验记录或其他已分页结果后在前端合成
11. **禁止混用报检自检记录和检验附件字段** — 报检入口 `qms_inspection_requests.attachments` 只能落到 `inspections.selfCheckDocuments`；关闭附件 `qms_inspection_requests.closeAttachments` 只能落到 `inspections.documents`，前端不得临时合并两个来源
12. **禁止把生产维护脚本只留在仓库源码中** — 发布必需的 backfill/maintenance 入口必须随 Docker image 发布，并由 deploy workflow 调用

## 类型安全规范

1. **禁止 `as any`** — 全项目范围（api/ + modules/ + utils/），测试文件除外
2. **禁止非空断言 `!`** — 用条件判断或 early return 代替，测试文件除外
3. **禁止 `as unknown as T` 双重断言** — 说明类型设计有问题，需修正类型定义
4. **允许 `as const`** — 安全的类型收窄
5. **允许测试文件中的 `as any`** — mock 场景需要
6. **后端非测试 TypeScript 必须通过类型感知 ESLint** — 禁止悬空 Promise、把 Promise 当布尔值或 void 回调、对非 Promise 使用 `await`、抛出非 `Error` 值、遗漏联合类型或枚举的 `switch` 分支，以及使用未标注为 `unknown` 的 Promise catch 参数
7. **测试文件必须包含有效断言且不得禁用测试** — 禁止无断言测试、重复 hook、无效 describe 回调和无效 expect 调用

## 模块边界规范

1. **每个模块只操作自己拥有的表** — 表归属见 prisma/schema.prisma
2. **跨模块数据访问必须通过 service 接口** — A 需要 B 的数据 → 调 B.service
3. **共享逻辑放 utils/ 或提取为新模块** — 禁止复制粘贴
4. **横切关注点（审计、数据权限、ID 解析）由框架层统一处理** — service 不手动调用

## 字段与数据规范

1. **禁止**硬编码业务数据值（工序名、供应商名、字典项等）
2. **禁止**多处重复定义字段名/列名，`prisma/schema.prisma` 为唯一真源
3. **禁止**用字符串字面量做业务分支判断，必须用枚举常量
4. **禁止** `$queryRawUnsafe` 与模板字符串组合（SQL 注入风险）
5. **必须**新增主数据类型时提供管理接口（CRUD）
6. **必须**引用主数据时存 ID（外键），不能只存 name
7. **必须**使用 `createModuleLogger` 记录日志，禁止 console.log/warn/error

## 数据契约规范（2026-08-16 追加，权威文档：`docs/data-contract.md`）

### 字段治理登记

1. **禁止**新增未治理的跨表 name 字段 — 任何跨 2 张以上业务表复用、用于查询/统计分组/报表维度、或来自主数据/字典/派生的 name 字段，必须登记进 `apps/backend/utils/master-data-fields.ts`（含 source + canonical + targets + 读写策略）
2. **必须**写路径接 `governed-write`（`buildGovernedXxxWriteFields`）或等价守卫，禁止绕过治理直接写 name 字段
3. **必须**统计/报表按 canonical ID 聚合，禁止按名称归并（对应架构门禁 B-ID1/B-ID4/B-ID8/B-ID9）
4. **禁止**新增同概念的第三套字段名 — 已有治理键（如 `respDept` vs `responsibleDepartment`）需在治理登记中显式映射，新字段必须复用既有命名模式

### 错误码字典

5. **必须** `BusinessError(code, message, httpStatus)` 的 `code` 使用 `ErrorCode` 枚举成员（定义于 `@qgs/shared`），**禁止**自由字符串错误码
6. **禁止**在业务代码中发明新错误码字符串 — 新错误码必须加入 `ErrorCode` 字典
7. **必须**前端按错误码分级提示（VALIDATION→表单级、FORBIDDEN/UNAUTHORIZED→权限、CONFLICT→刷新重试、其他→通用 error）

### 字段命名

8. **必须**请求/响应字段 camelCase；主数据引用 `name` 快照 + `nameId` canonical 引用成对存在
9. **必须**布尔字段 `is`/`has` 前缀，时间字段 `At` 后缀

### 前端数据消费（web-antd + weapp）

10. **必须**类型/枚举/错误码从 `@qgs/shared` 导入，禁止在 `views/` 重复定义
11. **必须**请求走统一封装（Web `useRequest` 系列、小程序 `api/request.ts`），**禁止**裸 `axios`/`fetch`
12. **必须**表单项字段与后端 DTO 一致，**禁止**前端自造字段名
13. **禁止**在 `views/` 硬编码业务值（部门/供应商 ID、工序名、字典 key）
14. **禁止**前端根据名称猜测 ID 或拼接已分页结果再过滤

### 字段影响面

15. **必须**改动受控字段前核对影响面 checklist（schema → 治理登记 → governed-write → service/统计 → shared DTO → 前端 → code_map → 历史回填），详见 `docs/data-contract.md` 第 6 节

## 架构守护（自动化检测）

本地提交前运行 `pnpm run check:qms-arch` 检查当前分支和工作树变更；CI 运行 `pnpm run check:qms-arch:all` 扫描全部已跟踪文件。两种模式执行相同规则，检测范围不同。

简单文本规则由 shell 批量扫描；类型断言、ID 生成、跨模块导入、中文条件分支和 `catch` 日志规则使用 TypeScript AST 检测，禁止用注释、换行或语法变体绕过。

**目录结构：**

- 不得存在 services/、core/module-registry/、core/master-data/ 目录
- utils/ 只允许白名单内的基础设施文件

**路由层：**

- api/ 文件不得 import prisma
- api/ 文件不超过 50 行
- api/ 文件不得出现 `as Record<string, unknown>` 或 `as any`

**Service 层：**

- modules/ 单文件不超过 500 行
- 不得出现 `(prisma.xxx as any)`
- 不得出现 `execSync`
- 不得出现 `Date.now()` 用于 ID 生成
- 不得出现 console.log、console.warn、console.error

**类型安全：**

- 不得出现 `as any`（排除 `__tests__/` 和 `*.test.ts`）
- 不得出现非空断言 `!`（排除 `__tests__/` 和 `*.test.ts`）
- 不得出现 `as unknown as T` 双重断言

**模块边界：**

- modules/A/ 不得 import modules/B/ 的非 index.ts 文件
- 不得出现中文字符串字面量做条件判断

**安全：**

- 不得出现 `$queryRawUnsafe` + 模板字符串组合

**错误处理：**

- 不得出现空 `catch`（规则 B-E1）
- 每个 `catch` 必须调用 `logApiError`、`logDatabaseError` 或 logger 的 `error` / `fatal` 方法记录原始错误（规则 B-E2）

**历史债务基线：**

- `scripts/qms-architecture-baseline.txt` 只用于冻结已确认的历史债务，不是永久豁免
- AST 规则按 `rule|path|stable-fingerprint|count` 记录；行数规则按 `rule|path|max-lines` 记录
- 允许债务数量和文件行数下降；新增指纹、数量增长或超过行数上限必须阻断
- 修复历史债务时必须同步删除或收紧对应 baseline，禁止扩大 baseline 规避门禁

**代码地图：**

- 新增 `apps/backend/modules/<x>/`、`apps/backend/api/<x>/`、`apps/backend/api/qms/<x>/`、`apps/web-antd/src/views/<x>/` 或 `apps/web-antd/src/views/qms/<x>/` 顶层目录时，同次变更必须同步更新 `code_map.md`（规则 B-MAP1）。仅在 `--changed` 模式生效。

**测试位置与隔离：**

- 后端测试文件不得放入集中目录（`__tests__/`、`tests/`、`test/`），必须与被测代码同目录（规则 B-TEST1）。
- `foo.<suffix>.test.ts` 必须能在同目录找到 `foo.<suffix>.ts`；现存的合法跨文件聚合测试已写入 baseline 豁免，新增孤儿测试一律阻断（规则 B-TEST2）。需要测多个文件的聚合行为时，要么把被测代码合到一个 facade 文件，要么走 baseline 申报。
- 测试文件 `import` 了 `~/utils/prisma`，必须在同文件 `vi.mock('~/utils/prisma', …)`，避免 mock 漏配置时打到真实数据库（规则 B-TEST3）。

违反任一条即阻断提交。

## 执行流程规范（防止灾难性偏离）

执行多步骤任务（如重构方案的某个阶段）时必须遵守：

### 强制 commit 节奏

1. **每个 step 完成必须立即 commit** — 不 commit 不算"完成"
2. **不允许累积 step** — 不能"做完 step 1-3 一起 commit"，必须每步独立
3. **commit 失败必须立即修复或回滚** — 不允许带着失败的 commit 继续做下一步

### 自检命令（每个 step 完成后必跑）

```bash
# 1. 验证有新 commit
git log --oneline -3

# 2. 验证未提交文件数合理（应该 ≤ 20）
git status --short | wc -l

# 3. 验证模块文件数没有异常膨胀
find apps/backend/modules -name "*.ts" -not -path "*/node_modules/*" | wc -l

# 4. typecheck 通过
pnpm -C apps/backend exec tsc --noEmit

# 5. 测试通过
pnpm -C apps/backend exec vitest run
```

### 异常停止条件（出现立即停下，不要继续）

- 未提交文件数 > 30
- 模块文件数比上一阶段开始时多 50% 以上
- typecheck 报错超过 5 个
- 测试通过数下降超过 10 个

### 验证规则

- 报告"完成 step N"时，必须包含上述自检命令的输出
- 不允许只说"已完成"，必须给出新 commit 的 hash
- 不允许只说"测试通过"，必须给出通过的测试数

### 错误恢复

- 如果改坏了文件，**不要继续机械替换"修复"**
- 立即停下，报告"工作树损坏"
- 选项：
  1. 回滚到最近的 good commit（如果该 step 没 commit）
  2. 逐文件手修（如果已 commit 过半，回滚代价大）

## 新增模块规范

新增一个业务模块时，必须完成以下步骤：

### 目录结构（最小骨架）

```
modules/new-module/
├── index.ts                    # 对外导出（只导出 service 和类型）
├── new-module.service.ts       # 业务逻辑
├── new-module.module.ts        # 模块声明（menus、dataScope、audit、idResolution）
└── new-module.service.test.ts  # 单元测试
```

### 必须完成的注册

1. 在 `utils/module-loader.ts` 的 `MODULE_DECLARATIONS` 数组中注册
2. 在 `prisma/schema.prisma` 中新增表时，加注释标注归属模块：`// @module new-module`
3. 在 `api/` 下创建对应路由目录

### index.ts 导出规则

- 只导出 service 对象和公共类型
- 不导出内部工具函数、常量、prisma 实例
- 其他模块只能 `import from '~/modules/new-module'`（即 index.ts）

### 测试要求

- 测试文件放在模块目录内（`xxx.service.test.ts`）
- 不允许放在集中的 `__tests__/` 目录
- 不允许存在 `modules/__tests__/` 目录

## 错误处理与并发安全（2026-06-04 审计追加）

来源：`docs/AUDIT-2026-06-04.md`。

1. **错误码契约**：所有业务错误必须抛 `BusinessError(code: string, message: string, httpStatus: number)`。**禁止** `throw new Error('中文消息')`、`throw new Error('VALIDATION:...')` 等带前缀的字符串错误（旧风格），新代码不再允许。`response.ts` 必须将 `BusinessError.code` 透传到响应顶层，以便前端按 code 分级提示（warning / error / notification）。
2. **并发写守卫**：凡是先 `findFirst` 检查状态、再执行写操作的流程，**状态检查必须在 `$transaction` 内完成**，或改用 `updateMany({ where: { id, status: ... } })` + 检查 `count` 做原子守卫。禁止"事务外检查、事务内写入"——这是经典竞态。
3. **写路由所有权断言**：涉及用户/部门私有数据的 `delete` / `put` 路由，必须在 service 入口处校验 `createdBy` 或 `orgId` 与当前用户一致，或通过 `data-scope` 中间件覆盖。新增 delete/put 路由前必须确认归属模块在 `middleware/4.data-scope.ts` 的覆盖列表里，否则手动加校验。
4. **禁止静默 catch**：`} catch {}` 或 `} catch (e) {}` 形式一律禁止。最低要求是 `logger.error(error, 'context')` 后再决定是否重新抛出。RBAC、data-scope、JWT 等核心安全路径上的 catch 必须记日志，便于排查权限问题。

## 微信小程序约束（`apps/weapp/`）

### API 层

1. **禁止**在小程序中直接调用 `/api/qms/public/` 接口 — 公开接口暴露在外网有安全风险，小程序端应走鉴权接口
2. **禁止**硬编码 API 地址 — 必须通过 `VITE_API_BASE_URL` 环境变量（`.env` / `.env.production`）
3. **禁止**在小程序端存储用户密码 — 绑定完成后只保存 token
4. **必须**所有需鉴权接口通过 `api/request.ts` 统一发送（自动注入 token、处理 401 刷新）
5. **必须**上传文件使用 `uploadFile()` 函数（自动带 Authorization header）

### 认证

1. **禁止**绕过微信登录流程直接使用用户名密码登录
2. **必须**切换账号时先调 `/api/auth/wx-unbind` 解绑再清除本地 token
3. **必须**token 刷新失败时清除所有本地存储并跳转登录页
4. **禁止**将 `WX_APPID`、`WX_APP_SECRET`、`WX_SESSION_SECRET` 提交到代码仓库

### 角色与权限

1. **必须**通过 `userInfo.roles` 判断用户角色，不得硬编码 userId 做权限判断
2. **必须**派工员判断包含所有管理类角色：`super`/`admin`/`dispatch`/`manager`/`schedule`
3. **禁止**检验员看到派单入口，禁止派工员看到检验录入入口

### 代码规范

1. **禁止** `as any`、`console.log`、非空断言 `!` — 与后端规则一致
2. **必须**使用 rpx 单位做响应式布局
3. **必须**使用 `uni.scss` 中定义的样式变量（$primary-color 等）
4. **禁止**在页面中直接使用 `uni.getStorageSync('accessToken')` — 通过 `useUserStore` 管理状态
5. **typecheck 豁免**：weapp 的 vue-tsc 检查配置为跳过（uni-app-types 全局类型冲突），但 eslint 和 prettier 必须通过

### 环境变量

后端 `.env` 中小程序相关必需变量：

- `WX_APPID` — 微信小程序 AppID
- `WX_APP_SECRET` — 微信小程序 AppSecret
- `WX_SESSION_SECRET` — 绑定会话签名密钥（随机 32 字节 hex）
- `HOST=0.0.0.0` — 开发环境后端需监听所有接口

### 开发模式

1. **开发环境 mock**：`NODE_ENV=development` 时微信 code 无效自动返回 mock openid，仅限开发调试
2. **禁止**生产环境存在 mock 逻辑 — mock 分支由 `NODE_ENV` 严格守护
3. **必须**修改 `.env` 后重启 `pnpm dev:antd`（VITE 环境变量只在启动时读取）
