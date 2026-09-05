# 权限模块文档（Permission Module）

> 权威文档：2026-08-17 成文，覆盖统一授权框架（Phase 1-2）、门禁、数据范围、缓存、token 治理与运维脚本。关联：docs/authorization-framework-requirement.md（需求单）、docs/permission-consistency-report.md（一致性盘点）、docs/audit-action-plan.md（行动清单）。

---

## 1. 总览：权限体系三层模型

认证层（你是谁）：middleware/3.auth.ts —— token 校验 + 账号状态校验授权层（你能不能做）：写操作 authorizeWrite / requireSystemAdmin；导出类读接口同 authorize 校验；所有权 assertRecordOwnership 数据权限层（能看哪些数据）：DATA_SCOPE_V2 + data_permission_policies 策略 + DataScopeService.buildScopedWhere（读路径）

| 层 | 职责 | 强制方式 |
| --- | --- | --- |
| 认证 | 是否登录、账号是否有效 | 全局中间件（所有非公开路径） |
| 授权 | 是否有该操作的权限码 | 每个写/导出端点显式调用（B-AUTH1 门禁强制） |
| 数据权限 | 能看/改哪些范围的数据 | 策略表 + 查询注入（默认关闭，开启需业务确认） |

## 2. 权限码字典（Permission Codes）

### 2.1 定义位置（单一来源）

- **@qgs/shared 枚举**（packages/qgs-shared/src/）：
  - PERMISSION_CODES（system/constants.ts）：LossAnalysis / AfterSales / WorkOrder / Planning(BOM/DFMEA/ITP/InspectionForm/ProjectDocs) / Supplier
  - write-permission-codes.ts（domain-modules/qms/）：METROLOGY / KNOWLEDGE / WELDER / REPORTS / TASK_DISPATCH / VEHICLE_COMMISSIONING_WRITE / AI_GENERATION / DASHBOARD / SUPERVISION / INSPECTION_REQUEST / INSPECTION_RECORD / INSPECTION_MATERIAL
  - inspection-issue-contract.ts：INSPECTION_ISSUE_PERMISSION_CODES
- **数据库**：rbac_permissions（码清单）+ rbac_role_permissions（角色↔码）+ menus.authCode（菜单按钮声明）

### 2.2 新增权限码的完整流程（新码一出生就登记）

1. 在 @qgs/shared 对应枚举加成员（值格式 QMS:模块:操作，如 QMS:Metrology:Export）
2. 在模块声明文件（modules/<x>/<x>.module.ts）补菜单/按钮 authCode（让界面可分配）
3. 重建 shared 包：pnpm --dir packages/qgs-shared run build
4. 同步权限表：pnpm --dir apps/backend exec tsx scripts/backfill-permission-consistency.ts（菜单码+枚举码双源合并，幂等）
5. 在角色管理界面按业务分配/收回

> 门禁强制：B-AUTH2 校验前端引用的码必须有声明；B-EC 校验业务错误码必须来自 ErrorCode 枚举。

## 3. 授权校验组件

### 3.1 authorizeWrite（写/导出操作权限）

api 层写端点示例：

```ts
import { authorizeWrite } from '~/modules/rbac';
import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.DELETE);
  // ...业务逻辑
});
```

- 校验顺序：登录态 → 用户权限码（RbacRoleService.getUserPermissionCodes，含 60s 缓存）→ 无码抛 BusinessError(FORBIDDEN, 403)
- super 角色豁免：自动合并全部菜单码（RBAC_SUPER_MERGE_ALL_CODES）
- 返回值：UserSession（可省一次 getCurrentUser）

### 3.2 requireSystemAdmin（系统管理操作）

- 适用：系统管理类端点（用户/角色/菜单/部门/字典/设置/文件/主数据维护）
- 用法：薄转发包装或内联插入（见 api/system/\* 先例）

### 3.3 assertRecordOwnership（个人数据所有权）

```ts
import { assertRecordOwnership } from '~/modules/rbac';
assertRecordOwnership({
  label: '记录',
  ownerId: record.createdBy,
  userId: user.id,
});
```

- 适用场景：个人数据（如不合格品项：只能改自己创建的）
- 不适用：协作/档案类数据（售后、知识库、工单、检验记录）——这些用数据范围控制，避免误伤

### 3.4 错误响应

- 无权限：HTTP 403 + { code: -1, error: { code: 'FORBIDDEN' }, message: '无权限执行此操作，请联系管理员' }
- 未登录/账号失效：HTTP 401 + UNAUTHORIZED

## 4. 门禁（机器强制，防裸奔）

| 规则 | 位置 | 作用 |
| --- | --- | --- |
| B-AUTH1 | scripts/check-qms-architecture.sh | 写端点（post/put/delete/patch）必须含 authorizeWrite/requireSystemAdmin/assert\*Permission/ensurePermission，或属于豁免清单 |
| B-AUTH2 | scripts/check-permission-code-declarations.mjs | 前端引用的权限码必须有声明（shared 枚举或模块菜单 authCode）；后端 authorizeWrite 引用的枚举必须存在 |
| B-EC | scripts/check-qms-source-rules.mjs | BusinessError 错误码必须是 ErrorCode 枚举成员 |

> 豁免清单（刻意公开，无需权限）：/api/qms/public/**（匿名报检）、/api/uploads/**、/api/qms/upload（登录态上传）、/api/system/log/client（客户端日志）、/api/user/preferences/**（用户自服务）、/api/auth/**、/api/telegram/**、/api/webhook/**。

## 5. 数据范围（部门/本人隔离）

### 5.1 现状

- 开关：DATA_SCOPE_V2 环境变量（默认 false，未开启 = 全员可见全库）
- 状态：**2026-08-17 业务决策：暂不实施**（代码已就绪；重新评估时按 5.2 开启手册执行）
- 已接入读路径的模块：after-sales、quality-loss、supplier、work-order、inspection（records 列表 2026-08-17 接入）
- 写路径范围校验：quality-loss（assertDeleteAccess 范式）

### 5.2 开启手册（业务决策前置）

1. 核查策略：pnpm --dir apps/backend exec tsx scripts/audit-data-scope-policies.ts（输出角色×模块矩阵）
2. 配置策略：在角色管理界面对每个角色×模块设置 ALL（全部）/ DEPT（部门）/ SELF（本人）；data_permission_policies 表 @@unique([roleId, module])
3. 开启开关：部署环境设 DATA_SCOPE_V2=true
4. 回归观察：各角色账号登录验证可见范围；未配置策略的角色回退为部门或本人范围，务必先配 super=ALL

### 5.3 策略回退规则

| 策略缺失时            | 回退                         |
| --------------------- | ---------------------------- |
| 用户有部门            | DEPT（本部门）               |
| 用户无部门            | SELF（本人）                 |
| 用户是 super 且未配置 | 同样回退（必须显式配置 ALL） |

## 6. 缓存与失效

- 权限码缓存：getUserPermissionCodes 60s 内存 TTL（clearPermissionCodesCache 导出）；角色权限变更（persistRolePermissions / softDeleteRole）即时失效
- 账号状态缓存：认证中间件 60s 内存 TTL；禁用账号 1 分钟内失去访问
- 多实例部署：权限/账号变更最多 60s 生效延迟（可接受权衡）

## 7. token 与账号状态

- access token：4h 有效期（JWT_ACCESS_SECRET 签发），前端 401 自动刷新
- refresh token：30d（JWT_REFRESH_SECRET），refresh 时校验账号 ACTIVE
- 账号禁用/删除：users.status != ACTIVE → 中间件 1 分钟内拒绝全部 API

## 8. 运维脚本

| 脚本 | 用途 | 幂等 |
| --- | --- | --- |
| backfill-inspection-record-permissions.ts | 检验记录权限码回填（历史兼容） | ✅ |
| backfill-phase2e-permissions.ts | 报表/派发/车辆/AI/看板权限码回填 | ✅ |
| backfill-supervision-permissions.ts | 监造权限码回填 | ✅ |
| backfill-permission-consistency.ts | 菜单码+枚举码全量同步权限表（部署必跑） | ✅ |
| cleanup-menu-placeholder-codes.ts | 清理 MENU\_\* 占位码（软删） | ✅ |
| audit-data-scope-policies.ts | 数据范围策略矩阵核查 | 只读 |

**部署顺序**：consistency → 各模块回填（幂等可重复）→ cleanup →（如需隔离）策略配置 + DATA_SCOPE_V2。

## 9. 开发指南：新增写端点

1. 在 api 层创建路由（薄层，≤50 行，不 import prisma）
2. 必须调用 authorizeWrite(event, PERMISSION_CODES.X.Y)（或 requireSystemAdmin）——B-AUTH1 门禁强制，否则 CI 拦截
3. 权限码若不存在：先按 2.2 流程登记
4. 业务逻辑放 modules service（≤500 行）
5. 单元测试：mock ~/utils/prisma，用 vi.mock('~/modules/rbac') 或真实调用 authorizeWrite

## 10. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 接口 403 无权限 | 角色无该码 | 角色管理界面分配；或回填脚本 |
| 管理员也 403 | 码不在菜单声明（validateRolePermissionCodes 拦截分配）；或角色权限缓存 60s | 补菜单按钮声明 + 同步；等待/清缓存 |
| 前端按钮不显示 | 前端码未声明（B-AUTH2 应拦截新增） | 按 2.2 流程补声明 |
| 账号禁用后仍可访问 | 60s 缓存窗口 | 等待；或清 accountStatusCache |
| 开启隔离后看不见数据 | 角色策略缺失/回退 | 核查 audit-data-scope-policies.ts 并配置策略 |

## 11. 已知边界（诚实清单）

- 一般列表/统计读接口仍仅登录校验（未逐接口授权；数据可见性由数据范围控制）
- inspection 的 issues/requests **自身读路径**尚未接入数据范围（records 已接入，同类改造进行中）；供应商侧入口已收口：`getInspectionHistory` / `getHistoryProjects` / `getQualityIssues` 三处 supplier→inspection 关系读均继承 supplier DataScope + inspection/request 侧 scope（2026-08-20 补收口）
- **2026-08-20 SEC-ANALYTICS-SCOPE-001 已收口**：Dashboard / Report / Workspace 聚合（Stats / Chart / Trend / Pareto / TopN / KPI / Drill-down）统一走 `AnalyticsAccessContext` + 各来源模块 scoped builder（见 §13）
- **2026-08-20 SEC-INSPECTION-REQUEST-ANALYTICS-001 已收口**：`GET /qms/inspection/requests/stats`（inspection-request-stats）纳入 `AnalyticsAccessContext` + `buildScopedInspectionRequestWhere`，DEPT/SELF/ALL/空候选 fail-closed 与 request 主业务一致（见 §13）；JS 聚合保留，仅记 PERF LEGACY（PERF-QMS-001），不再视为权限 LEGACY
- ~~写路径数据范围校验仅 quality-loss 实现~~ → **2026-08-19 SEC-DATASCOPE-001 已收口**：inspection / after-sales / quality-loss / supplier / work-order / task-dispatch 的写/删/批删/统计/导出/下钻/状态更新统一走 `createScopedRepository`（scoped-repository.ts），事务内 where 合并 + count≠1 → 404，scope 解析异常 fail-closed → 403；after-sales `getStats` 趋势原始 SQL 已补 scope（跨部门统计泄露修复）。
- 未迁移 LEGACY（R-SCOPE 已基线化或未纳入六模块范围）：
  - 分类与迁移计划见下方 §12.4（LEGACY 分类表）；所有已允许条目必须能追溯到文件 / 规则 / 原因 / 迁移专项。
- Ai/Reports/ITP 部分权限码无对应菜单按钮（界面不可分配，走脚本回填；**2026-08-17 业务决策：等生产部署回填**）

## 12. DataScope Architecture Guard（R-SCOPE v2）

SEC-DATASCOPE-002 把 SEC-DATASCOPE-001 的权限收口固化为长期架构基线，防止新增代码重新绕过 DataScope。规则引擎：`scripts/check-qms-source-rules.mjs`（挂载 `pnpm run check:qms-arch` / `check:qms-arch:all`）。

### 12.1 Protected Modules（模块级）

`PROTECTED_SCOPE_MODULES`：`inspection` / `after-sales` / `supplier` / `work-order` / `task-dispatch` / `quality-loss`（quality-loss 在 v2 纳入）。

`report` 评估结论：**不纳入**六模块保护组，独立观察。原因：report 域已有 4 条 R-SCOPE baseline LEGACY（`reports` / `pass_rate_projection_refresh_jobs` / `identity_reconciliation_runs` 裸写），且含大量聚合原始 SQL，收口语义与六模块不同，属 `OUT_OF_SCOPE`，由专门的 Dashboard/Report 权限专项处理。report 自身表不在模型级保护列表。

**2026-08-20 SEC-ANALYTICS-SCOPE-001 更新**：`dashboard` / `report` 模块目录作为 **Analytics 聚合保护组**（`ANALYTICS_SCOPE_MODULES`）纳入 Guard（见 §13）。该组只约束对六模块业务表的**聚合读**（R-SCOPE-AGG），不改变 report 自身写路径的 OUT_OF_SCOPE 结论。

### 12.2 Protected Prisma Models（模型级，防 helper 逃逸）

`PROTECTED_PRISMA_MODELS`：`inspections` / `after_sales` / `quality_loss_index` / `quality_losses` / `suppliers` / `work_orders` / `qms_task_dispatches`。

这 7 张表的危险写**在任何文件**（modules/\*/helpers、utils、跨模块 service）都进入检查，不依赖文件模块前缀。模块级另覆盖 `quality_records` / `qms_inspection_requests` / `qms_inspection_material_requests` / `inspection_archive_tasks` / `inspection_form_templates`。

### 12.3 Resource Identifier Fields（配置式业务主键）

`RESOURCE_IDENTIFIER_FIELDS` 按模型配置（`work_orders: id/workOrderNumber`、`quality_losses: id/lossId`、`inspections: id/inspectionId/workOrderNumber`、`quality_records: id/recordId`、`qms_inspection_requests: id/requestId` …）。规则目标：where 核心定位由外部可控业务主键完成、且无 scope/access 条件 → 高风险裸写。豁免条件（存在任一即放行）：

- 行内显式 marker：`// qms-arch-allow R-SCOPE: <reason>`（reason 必填，≥8 字符，无理由 suppress 直接 CI fail）
- ownership / scope 字段：`assigneeId` / `assignorId` / `createdBy` / `updatedBy` / `inspector` / `inspectorId` / `dispatcherId` / `responsibleDepartment(Id)` / `respDept(Id)` / `leaseOwner` / `leaseUntil` / `division` / `source` / `sourcePk`，及含这些字段的 `OR` / `AND`
- 命名 scope helper 调用 / spread / 不透明标识符 where（`applyInspectionIssueWriteOwnership` / `buildDeleteScopeWhere` / `buildScopedWorkOrderWhere` / `buildSupplierWhere` 等）
- 操作符形态状态守卫（`status: { in/not/... }` 等 CAS / 显式状态机约束）；`isDeleted: false`、标量 `status: 'ACTIVE'` 等单字段变形**不豁免**
- 批量 `id: { in }` 至少带 1 个非 `isDeleted` 锚点条件（主数据解析 / CAS 批量签名）；裸 `{ id: { in: ids } }` 拦截

### 12.4 Raw SQL 允许范式（R-SCOPE-RAW）

六模块 + analytics 模块（dashboard/report）文件内 `$queryRaw` / `$executeRaw` / `$queryRawUnsafe` / `$executeRawUnsafe`（Call 与 TaggedTemplate 两种形态均检测）必须满足其一：

- 命名 scoped SQL helper：`buildQualityLossIndexRawScopeSql` / `buildRequestHistoryRawScopeSql` / `buildAfterSalesRawScopeSql` / `buildIssueTrendOwnershipRawFilter` / `applyInspectionIssueOwnershipRawFilter`（helper 与原始 SQL 同函数即认定已带 scope 片段）
- 显式 marker：`// qms-arch-allow R-SCOPE-RAW: <reason>`（函数级或语句级）

### 12.5 LEGACY 分类表

| 条目 | 文件:行 | 规则 | 分类 | Owner | 风险 | 目标专项 | Review 条件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| archive task 状态裸 update | `inspection-archive-task.service.ts:113` | R-SCOPE（baseline） | TEMPORARY | inspection 域 | 低（内部任务表，管理员 RBAC 门控，非部门业务数据） | SEC-DATASCOPE-003（archive 域收口） | 迁移 scoped 写后移除 baseline |
| 关闭后置副作用裸 update | `inspection-request-close-effects.service.ts:64` | R-SCOPE（baseline） | TEMPORARY | inspection 域 | 低（id 派生自已授权关闭流，文档同步副作用） | SEC-DATASCOPE-003 | 改造 scoped 副作用后移除 baseline |
| inspection 表单模板裸 update | `inspection-route.service.ts:164` | R-SCOPE（baseline） | DESIGN_EXCEPTION | inspection/planning | 低（共享配置表，RBAC 写门控，非部门数据） | 无（随 inspection-form 专项复核） | 表单模板改共享配置模型后移除 |
| task-dispatch parent promotion | `task-dispatch.service.ts:86` | R-SCOPE（marker） | TEMPORARY | task-dispatch | 低（PENDING 状态 CAS，id 来自 create 载荷 parentId） | SEC-DATASCOPE-003 | 迁移 scoped 写后移除 marker |
| 关闭流派生 id 写（13 处 marker） | `inspection-request-close*.ts` / `inspection-request-dispatch*.ts` / `inspection-material-request*.ts` / `inspection-request-close-records*.ts` 等 | R-SCOPE（marker） | TEMPORARY | inspection 域 | 低（id 均派生自已授权 / CAS 锁定的同事务记录） | SEC-DATASCOPE-003（inspection 关闭流专项复核） | 逐点迁移 scoped 写后移除 marker |
| quality-loss / after-sales 跨域副作用写（3 处 marker） | `inspection-reporting.service.ts:22` / `after-sales-integration.service.ts:70` / `after-sales.service.ts:149` | R-SCOPE（marker） | TEMPORARY | quality-loss/after-sales | 低（id 派生自已授权源记录；`after-sales.service.ts:149` 为 b168 遗留，当前调用方仅测试） | b168（after-sales 写收口） | b168 迁移 updateAccessible 后移除 marker |
| work-order create 恢复已删工单 | `work-order-route.service.ts:163` | R-SCOPE（marker） | PRODUCT_DECISION | work-order 域 | 中（workOrderNumber 裸写；跨部门恢复语义需产品确认） | 产品决策 | 产品确认恢复语义后决定 scope 策略 |
| supplier create 恢复已删供应商 | `supplier-create.service.ts:59` | R-SCOPE（marker） | PRODUCT_DECISION | supplier 域 | 低（id 来自服务端 name 查找 + RBAC 门控） | 产品决策 | 同上 |
| NC 编号 sequence 生成器 | `inspection-issue-nc-number.service.ts` | R-SCOPE-RAW（marker） | DESIGN_EXCEPTION | inspection 域 | 无（仅内部 sequences 表，无业务行暴露） | 无 | 引入 DBA 序列后可移除 marker |
| report 模块裸写 | `report-route.service.ts` / `pass-rate-projection-rollout.service.ts` / `pass-rate-shadow-reconciliation.service.ts` | R-SCOPE（baseline 已失效） | **已收口（2026-08-20 SEC-REPORT-WRITE-001）** | report 域 | 已消除：reports 用户写迁移 scoped 写（owner + 状态 CAS），系统写显式 marker | 已完成 | 见 §14 |

Baseline 治理规则：新增 violation 默认 CI fail；baseline 只允许人工显式更新，禁止脚本自动灌入。2026-08-20 移除 1 条过期 baseline（`task-dispatch.service.ts` 的 `bare-id-write-qms_task_dispatches.update`——该写已迁移 `updateAccessible`，条目所指代码已不存在）。

## 13. Analytics 聚合 DataScope（SEC-ANALYTICS-SCOPE-001）

Dashboard / Report / Workspace 聚合读取的数据范围收口。目标：List / Detail / Export / Stats / Chart / Trend / Dashboard / Report / Workspace / Drill-down 使用同一套 DataScope 语义，禁止“列表只看本部门、Dashboard 统计全公司”。

### 13.1 统一 Analytics Access Context

- `AnalyticsAccessContext { user: { userId, username? }, dataScope? }` 定义于 `modules/data-scope/analytics-access-context.ts`，由 `modules/data-scope` 统一导出。
- 服务入口统一 `requireAnalyticsUser(access)` fail-closed：userId 缺失 / 上下文不完整 → `403 FORBIDDEN`，禁止退化为全量聚合。
- 路由统一 `getAnalyticsAccessContext(event)`（`utils/current-user.ts`），消除各路由手写 access 对象的复制粘贴；认证缺失时 `getCurrentUser` 直接抛错（第一层 fail-closed）。

### 13.2 跨模块 scope 语义（禁止统一 department where）

每个数据来源分别应用该来源自己的 scope 字段：

| 来源 | DEPT 字段 | SELF 字段 |
| --- | --- | --- |
| inspection | `responsibleDepartment` / `responsibleBU` | `inspector` / `lastEditor` |
| after-sales | `division` / `feedbackDept` / `respDept` | `handler` |
| work-order | `division` | —（SELF 回退 DEPT） |
| quality-loss | `respDeptId` | `createdBy`（SELF 回退 DEPT） |

Dashboard/Report/Workspace 路由不在六模块前缀下（middleware 不注入 `dataScope`），由 `resolveInspectionScope` 按需解析；DEPT/SELF 通过注入的 `dataScope` 生效（DATA_SCOPE_V2 未启用时解析为 ALL）。

**inspection-request 域独立语义**（SEC-INSPECTION-REQUEST-ANALYTICS-001）：request 聚合不套用 inspections 表的通用 scope，而是沿用 request 列表/历史查询自己的规则——DEPT → `responsibleDepartment IN (deptId + 部门名候选)`；SELF → `inspectorId = userId OR reporterId = userId`（禁止另立新 SELF 规则）；空部门候选 → `{ id: '__none__' }`（fail-closed）。入口：`modules/inspection/inspection-request-scope.ts#buildScopedInspectionRequestWhere`。

### 13.3 已迁移入口

- **Dashboard**：`api/qms/dashboard.ts` → `dashboard.service.getStats / getMonthlyTrend / getIssueDistribution`；in-memory 缓存按 userId 隔离（DEPT/SELF/ALL 聚合互不串）。
- **Workspace**：`api/qms/workspace.get.ts` → `dashboard-route.service.getWorkspaceSummary`；`api/qms/workspace/work-order-aggregate.get.ts` → `work-order-aggregate.service.getWorkOrderAggregate`（工单本体走 work-order scope，明细继承 inspection scope；未命中 → 404）。
- **Report**：`reports/summary.get.ts` / `reports/weekly.get.ts` / `reports/daily-summary.get.ts` / pass-rate-trend 全部 access 透传；`getNetPassRateSummaryByRange / getPassRateDrillDownByRange / getSummary` 的 KPI 与 drill-down 使用同一 access（下钻一致性）。
- **六模块 reporting 服务**：`inspection-reporting` / `inspection-report-statistics` / `after-sales-integration` / `quality-loss-reporting` / `work-order.service` / `inspection-score-data.getWorkOrderAggregateInspections` 全部追加 `access` 参数并走各自 scoped builder。
- **IDOR 修复**：`report-daily-summary` 忽略任意 `user` query 参数，行过滤与报告人恒取自当前登录用户（保留参数仅为前端兼容 shape）。
- **Inspection Request Stats**：`api/qms/inspection/requests/stats.get.ts` → `inspection-route.service.getRequestStats` → `inspection-request-stats.service.getRequestStats(query, access)`；4 个 `qms_inspection_requests` 查询点（2×findMany + 2×count）全部经 `buildScopedInspectionRequestWhere`，缺 user → 403，DEPT 空候选 → 空集合（fail-closed）。

### 13.4 Raw SQL scope

- `buildInspectionRawScopeSql(access)`（`modules/report/pass-rate-scope.ts`）：DEPT → `responsibleDepartment IN (候选)`；SELF → `inspector = username`；空候选 → `AND 1 = 0`（fail-closed）；ALL → 无片段。
- `buildScopedInspectionWhere / buildScopedIssueWhere`：ORM 聚合统一 scoped where。
- 投影物化路径仅在无 scope 或 ALL 时使用（投影表无部门字段），DEPT/SELF 回落 legacy scoped 路径，避免下钻全量。

### 13.5 R-SCOPE-AGG（Architecture Guard 新增）

- `ANALYTICS_SCOPE_MODULES = { dashboard, report }`：这两个模块目录内的 protected 业务表聚合读受检。
- `ANALYTICS_READ_MODELS`：`inspections / quality_records / after_sales / quality_losses / quality_loss_index / work_orders / suppliers / qms_task_dispatches`。
- 检测 `findMany / findFirst / findUnique / count / aggregate / groupBy`：所在函数无 scope anchor（`buildScoped*Where` / `*RawScopeSql` / `resolve*Scope` / `DataScopeService`）且无 `// qms-arch-allow R-SCOPE-AGG: <reason>` → CI fail。
- `requireAnalyticsUser` 单独**不构成** anchor（只证明认证，不证明行级授权）。
- R-SCOPE-RAW 扩展到 dashboard/report：业务 KPI 原始 SQL 必须真实 scope 化，禁止长期 marker 豁免。
- **Stats 文件规则**（SEC-INSPECTION-REQUEST-ANALYTICS-001）：`STATS_AGGREGATE_READ_GUARD = { inspection → [qms_inspection_requests] }`——protected 模块内文件名含 `stats/statistics` 的文件，对清单内模型做聚合读（`findMany/count/aggregate/groupBy` 等）必须带 scope anchor 或显式 marker；普通 list/CRUD 服务不受影响（走写侧 R-SCOPE）。当前豁免：`inspection-request-stats-workload.ts`（M-G08 全系统在办量，系统级指标、无业务行暴露，已加显式 marker）。

### 13.6 Analytics LEGACY 分类

| 条目 | 位置 | 分类 | Owner | 风险 | 目标专项 | Review 条件 |
| --- | --- | --- | --- | --- | --- | --- |
| vehicle-commissioning 聚合无 scope | `vehicle-commissioning.service.ts`（`getStatsForDashboard`） | OUT_OF_SCOPE | vehicle-commissioning 域 | 低-中（无 DataScope 声明的独立模块） | 专属权限专项 | 定义 DataScope 声明后收口 |
| report 用户写路径 | `report-route.service.ts` / `report-write.service.ts` | **已收口（SEC-REPORT-WRITE-001）** | report 域 | 无（owner 对象授权 + 状态机 + CAS + 审计，见 §14） | 已完成 | — |
| report 投影 rollout / 对账 / manual | `pass-rate-projection-rollout.service.ts` / `pass-rate-shadow-reconciliation.service.ts` / `vehicle-failure-rate-manual*` | SYSTEM_MAINTENANCE | report 域 | 低（系统队列 CAS lease / admin 门控，显式 marker 带 reason） | 无（系统写，保持 marker 治理） | marker 原因复核 |
| 投影维护读（8 处 marker：5×R-SCOPE-AGG + 3×R-SCOPE-RAW） | `pass-rate-projection-query.service.ts` / `pass-rate-projection.service.ts` | TEMPORARY | report 域 | 低（快照/新鲜度/对账/物化，系统维护非用户行暴露；投影读仅在 ALL scope 下对外可达） | report-write 专项（投影授权语义） | marker 原因复核通过后移除 |
| daily-summary `user` query 参数兼容 | `api/qms/reports/daily-summary.get.ts`（服务端已忽略） | TEMPORARY | report 域 | 无（已 fail-closed） | 前端移除参数后清理 | 前端 `reports/index.vue` 停止传 `user` 后删除 |

Marker 治理：SEC-ANALYTICS-SCOPE-001 新增 8 处 marker 全部为投影系统维护读，均带 reason / owner / 目标专项（上表）；SEC-INSPECTION-REQUEST-ANALYTICS-001 新增 1 处 marker（`inspection-request-stats-workload.ts`，M-G08 全系统在办量，系统级指标非用户行暴露）。禁止无理由新增 marker。

**PERF LEGACY（权限已收口，仅性能遗留）**：

| 条目 | 位置 | 分类 | Owner | 风险 | 目标专项 | Review 条件 |
| --- | --- | --- | --- | --- | --- | --- |
| inspection-request-stats 全量 JS 聚合（`findMany` → Node 聚合，权限已按 §13.3 scope 化） | `inspection-request-stats.service.ts`（`GET /qms/inspection/requests/stats`） | PERF（PERF-QMS-001） | inspection 域 | 无权限风险（DEPT/SELF/ALL 与主业务一致，缺 user 403，空候选 fail-closed）；仅大区间性能 | PERF-QMS-001（数据库聚合下推：`count/groupBy/aggregate` 等价替换候选） | 下推后移除；权限语义变化需重新走 DataScope 专项 |

## 14. Report 写路径治理（SEC-REPORT-WRITE-001）

reports 表用户写路径的对象级授权与状态机收口。目标：用户可触发的 report 写必须经过 `Authentication → RBAC → Object Authorization → Domain Service → Scoped Write → Audit`，禁止只校验功能权限后 `prisma.reports.update/delete({where:{id}})`。

### 14.1 Report Write Access Matrix（关键入口）

| API | Service | 模型 | 写类型 | RBAC | Object Auth | 状态机/CAS | 审计 | 外部 ID | 类 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `PUT /qms/reports/[id]` | `ReportWriteService.updateReport` | `reports` | UPDATE | `QMS:Reports:Edit` | author owner / admin ALL | 状态机 + `updateMany({id,status,...owner})` count≠1→409 | `report.update` | ✓ | A |
| `DELETE /qms/reports/[id]` | `ReportWriteService.deleteReport` | `reports` | DELETE | `QMS:Reports:Delete` | author owner / admin ALL | Published 禁删(409) + CAS | `report.delete` | ✓ | A |
| `POST /qms/reports` | `ReportWriteService.createReport` | `reports` | CREATE | `QMS:Reports:Create` | N/A(插入) | 仅 Draft | `report.create` | - | A |
| `PUT /qms/reports/daily-summary` | `ReportWriteService.saveDailySummary` | `daily_reports` | UPSERT | `QMS:Reports:Edit` | reporter 恒为当前登录用户（修复 body.user 冒充） | - | `report.daily-summary` | - | A |
| 投影 rebuild（worker） | `pass-rate-projection-rollout.processNextRebuild` | `pass_rate_projection_refresh_jobs` | UPDATE | System | CAS lease（updateMany 状态+租约） | PENDING→PROCESSING→COMPLETED/FAILED | - | - | B |
| 投影物化（worker） | `pass-rate-projection.buildGeneration` | `pass_rate_process_identity_projection` | createMany/deleteMany | System | 代次门控 | - | - | - | C |
| 阴影对账（脚本） | `pass-rate-shadow-reconciliation` | `identity_reconciliation_runs` | UPDATE | System | 脚本触发，PENDING/RUNNING 门控 | - | - | - | D |
| `PUT /system/pass-rate-projection/enabled` | `setEnabled` | `system_settings` | UPSERT | `requireSystemAdmin` | rolloutReady 门控→409 | - | - | - | E |
| `POST /system/pass-rate-projection/rebuild` | `requestRebuild` | `pass_rate_projection_refresh_jobs` | CREATE | `requireSystemAdmin` | - | - | - | - | E |
| `POST /qms/vehicle-failure-rate-manual` | `vehicle-failure-rate-manual.post.service` | `system_settings` | UPSERT | `requireSystemAdmin` | - | - | - | - | E |
| `PUT/DELETE /qms/supervision/reports` | `SupervisionReportService.updateReport/deleteReport` | `supervision_daily_reports` | UPDATE/DELETE | supervision 码 | creator 所有权 + admin ALL（§15 已收口） | CAS（updateMany + count≠1→409） | `report-update` / `report-delete` | ✓ | A |

### 14.2 对象授权模型

- `reports` 表无部门维度，对象边界采用 **author 所有权**：`updateReport / deleteReport` 先用 `findUnique` 读取 `author/status`（404），非系统管理员要求 `author ∈ {realName, username}`（403），最终写使用原子 `updateMany/deleteMany({ where: { id, status: 当前状态, ...buildReportOwnershipWhere(userinfo) } })`， `count !== 1 → 409`——ownership 与状态在最终写中原子重验，消除 find→判断→update 的 TOCTOU。
- 系统管理员（`isSystemAdmin`）为 ALL：spread 空对象（静态分析仍视为 scoped 写）。
- `body.author` 在 update/create 中一律忽略或拒绝：作者即记录所有者，不可通过请求体改绑。
- 状态码统一走共享 `ErrorCode`：404 `NOT_FOUND` / 403 `FORBIDDEN` / 409 `CONFLICT` / 400 `VALIDATION`。

### 14.3 状态机（Explicit State Machine）

- 合法状态：`Draft → Published / Archived`；`Published → Archived`；`Archived → Draft`（restore）；同状态编辑允许。
- 非法跳转（如 `Published → Draft`）→ 409；未知目标状态值 → 400；删除 `Published` 报告 → 409（必须先归档）。
- 新报告只能以 `Draft` 创建（`POST /qms/reports` 传 Published/Archived → 409）。

### 14.4 并发控制（CAS）

- 所有 update/delete 写 where 均携带 `status: 当前状态`（CAS），状态并发变更 → `count=0 → 409`。
- **CONCURRENCY GAP → DATA-INTEGRITY-001**：`reports` 无 `version` 列，非状态字段的并发编辑依赖 `updatedAt` 兜底与 CAS 状态保护，未实现全字段乐观锁；登记为后续专项，本专项不加 schema。

### 14.5 Audit

- `report.module.ts` 声明 `create / update / delete / daily-summary` 四个审计动作（`SystemLogService.auditLog('report', ...)`），记录 actor(userId) / action / target / 关键 diff 变量 / ip / userAgent / timestamp；成功写后落 `audit_logs`。

### 14.6 系统维护写（B/C/D/E）

- 投影 rebuild：CAS lease（`updateMany` 状态+租约，`count===1` 才继续）+ 幂等（PENDING/PROCESSING 去重入队）；完成/失败 finalizer 显式 marker（`qms-arch-allow R-SCOPE: system maintenance write...`）。
- 阴影对账失败 finalizer 显式 marker（系统脚本触发，无用户入口）。
- `setEnabled / rebuild / vehicle-failure-rate-manual` 全部 `requireSystemAdmin` 门控。
- 普通登录用户无任何入口可触发系统重算/覆盖（R-SCOPE-RAW/AGG 不涉及）。

### 14.7 Guard 与 Baseline 变化

- `reports` 加入 `PROTECTED_PRISMA_MODELS`：任意文件（含 helper）中 `reports.update/updateMany/delete/deleteMany` 裸写（`where:{id}` 及变形）→ R-SCOPE 强制拦截；`create/upsert` 不受影响。
- 移除 4 条 report R-SCOPE baseline（rollout×2 / reconciliation×1 / reports.update / reports.delete）；新增 1 条 B-M1 baseline（`report-write.service.ts` 深路径导入 `~/modules/vehicle-commissioning/daily-report-storage.service`——与 `report-route.service.ts` / `report-daily-summary.service.ts` 同源 LEGACY，report 与 vehicle-commissioning 存储耦合，避免经 index 拖入 vehicle-commissioning 主服务）。
- 系统写 marker +3（rollout 2 + reconciliation 1），均带 reason。

### 14.8 剩余 LEGACY / OUT_OF_SCOPE

| 条目 | 位置 | 分类 | Owner | 风险 | 目标专项 | Review 条件 |
| --- | --- | --- | --- | --- | --- | --- |
| vehicle-commissioning 聚合无 scope | `vehicle-commissioning.service.ts` | OUT_OF_SCOPE | vehicle-commissioning 域 | 低-中 | 专属专项 | 定义 DataScope 后收口 |
| reports 无 version 列（并发编辑窗口） | `reports` 表 | CONCURRENCY GAP | report 域 | 低 | DATA-INTEGRITY-001 | 加 version 列迁移后移除 |
| `report-route.service.ts` / `report-daily-summary.service.ts` / `report-write.service.ts` 深路径导入 vehicle-commissioning 存储 | 3 处 B-M1 baseline | DESIGN_EXCEPTION | report/vehicle-commissioning | 低（存储模块仅 prisma 封装） | report 依赖治理 | 独立存储服务抽取后移除 |

## 15. Supervision 域权限与数据完整性（SEC-SUPERVISION-001）

supervision 域（项目/问题/计划任务/日报）的对象级授权 + 显式状态机 + CAS 收口。

### 15.1 对象授权模型

- 无部门维度，对象边界采用 **creator 所有权**：`supervision_projects.createdBy` / `supervision_issues.createdBy` / `supervision_daily_reports.createdBy` （迁移 `20260820150000_add_supervision_created_by`）。普通用户只能写自己创建的记录；系统管理员（`isSystemAdmin`）为 ALL（spread 空对象）。
- 计划任务无 owner 列，**继承父项目范围**：`where` 追加 `{ project: { createdBy } }`。
- 无 creator 的存量行仅管理员可写（fail-closed，不扩权）。
- 统一 `buildSupervisionAccessWhere(resource, ctx)`（`supervision-access.ts`），禁止手写硬编码权限。

### 15.2 写路径矩阵

| API | Service | 模型 | RBAC | Object Auth | 状态机/CAS | 审计 | 类 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /qms/supervision/projects` | `createProject` | `supervision_projects` | CREATE | 落 `createdBy` | - | `project-create` | A |
| `PUT /qms/supervision/projects/[id]` | `updateProject` | `supervision_projects` | EDIT | creator / admin | 状态机 + `updateMany({id,status,...scope})` count≠1→409 | `project-update` | A |
| `DELETE /qms/supervision/projects/[id]` | `deleteProject` | `supervision_projects` | DELETE | creator / admin | COMPLETED 禁删 + CAS | `project-delete` | A |
| `POST .../issues` | `createIssue` | `supervision_issues` | CREATE | 父项目访问校验 + 落 `createdBy` | - | `issue-create` | A |
| `PUT .../issues/[id]` | `updateIssue` | `supervision_issues` | EDIT | creator / admin | 状态机 + CAS | `issue-update` | A |
| `DELETE .../issues/[id]` | `deleteIssue` | `supervision_issues` | DELETE | creator / admin | CLOSED 禁删 + CAS | `issue-delete` | A |
| `POST .../issues/[id]/actions` | `createIssueAction` | `supervision_issue_actions` | EDIT | creator / admin（事务内 CAS） | 状态机 + CAS | `issue-update` | A |
| `POST .../plan-tasks` | `createTask` | `supervision_plan_tasks` | CREATE | 父项目范围 | - | `task-create` | A |
| `PUT .../plan-tasks/[taskId]` | `updateTask` | `supervision_plan_tasks` | EDIT | 项目继承范围 | 派生状态重算 + CAS | `task-update` | A |
| `DELETE .../plan-tasks/[taskId]` | `deleteTask` | `supervision_plan_tasks` | DELETE | 项目继承范围 | DONE 禁删 + CAS | `task-delete` | A |
| `POST .../plan-tasks/import` | `importPlanTasks` | `supervision_plan_tasks` | CREATE | 父项目范围 | COMPLETED 禁覆盖导入 + CAS | `task-import` | A |
| `POST .../reports` | `createReport` | `supervision_daily_reports` | CREATE | 父项目校验 + reporter 恒为当前登录用户（payload 忽略） | 事务内任务/项目 CAS | `report-create` | A |
| `PUT .../reports` | `updateReport` | `supervision_daily_reports` | EDIT | creator / admin | `updateMany` + count≠1→409 | `report-update` | A |
| `DELETE .../reports` | `deleteReport` | `supervision_daily_reports` | DELETE | creator / admin | CAS | `report-delete` | A |
| 项目进度/状态派生（内部） | `syncSupervisionProjectProgress` | `supervision_projects` | System | 调用方已授权 | 叶子任务重算（marker 豁免） | - | B |

### 15.3 状态机（Explicit State Machine）

- 项目：`PLANNED → IN_PROGRESS / PAUSED / COMPLETED`，`IN_PROGRESS → PAUSED / COMPLETED / PLANNED`， `PAUSED → IN_PROGRESS / COMPLETED / PLANNED`，`COMPLETED → IN_PROGRESS`（仅可重开）；非法跳转 409。
- 问题：`OPEN → IN_PROGRESS / VERIFYING / CLOSED`，`IN_PROGRESS → OPEN / VERIFYING / CLOSED`， `VERIFYING → OPEN / IN_PROGRESS / CLOSED`，`CLOSED → OPEN`（仅可重开）；非法跳转 409。
- 项目/问题 `status` 永不接受任意 `body.status`；转换矩阵在 `supervision-state.ts` 显式声明。

### 15.4 并发控制（CAS）

- 所有用户型 update/delete 最终写均为 `updateMany({ where: { id, ...scope, 当前状态/CAS 锚点 } })`， `count !== 1 → 409`——消除 find→判断→update 的 TOCTOU。
- 任务进度/状态为派生字段（`calculatePlanTaskStatus` / `syncSupervisionProjectProgress`），不允许用户直接写矛盾组合。

### 15.5 Audit

- `supervisionModule.audit` 声明 13 个审计动作（project/issue/task/report 的 create/update/delete + task-import）；成功写后 `auditSupervisionWrite` → `SystemLogService.auditLog('supervision', ...)` 落 `audit_logs` （actor userId / action / targetId / 关键变量 / timestamp）。

### 15.6 Architecture Guard

- 新增窄范围 `SUPERVISION_STATE_MODELS`（`supervision_projects` / `supervision_issues` / `supervision_plan_tasks` / `supervision_daily_reports`）+ `SUPERVISION_FILE_PATTERN` （`api/qms/supervision` + `modules/supervision`）：域内这些表的 update/delete/updateMany/deleteMany 必须带对象范围（`createdBy` / `project` 嵌套或 `...accessWhere` spread）或显式 marker； `{id}`、`{id, isDeleted:false}`、业务主键裸写 → R-SCOPE 拦截。
- 保护范围不泛化到其它模块文件（当前无跨模块 supervision 写者；如未来出现，再评估是否纳入模型级保护列表）。

### 15.7 LEGACY

| 条目 | 位置 | 分类 | Owner | 风险 | 目标专项 | Review 条件 |
| --- | --- | --- | --- | --- | --- | --- |
| `syncSupervisionProjectProgress` 系统派生写 | `supervision-plan-task-progress.ts` | SYSTEM_MAINTENANCE | supervision 域 | 低（调用方已授权，id 为内部主键） | 长期保留 | 引入事务内依赖注入后移除 marker 或保持现状 |
| 列表/看板读路径仍为登录级可见（未按 creator 过滤） | `listProjects/listIssues/listReports/deadlineBoard` | PRODUCT_DECISION | supervision 域 | 低-中（管理概览，写路径已对象级收口） | 如产品要求可见性收缩，再定义读侧 scope | 产品决策变更时评估 |

## 16. 关键业务记录乐观锁（OPTIMISTIC-LOCK-001）

after-sales / supplier / work-order 三模块把既有 `version Int @default(1)` 死字段激活为乐观锁：用户型编辑与删除必须携带客户端读取到的 `version`，否则 400；版本过期统一 409 `OPTIMISTIC_LOCK_CONFLICT`，且绝不允许退化为 Last Write Wins。

### 16.1 写类型分类

- **A. 用户交互式编辑/删除**（`PUT /qms/after-sales/:id`、`DELETE /qms/after-sales/:id`、`PUT /qms/supplier/:id`、`DELETE /qms/supplier/:id`、`PUT /qms/work-order`、`DELETE /qms/work-order`）→ **必须 Optimistic Lock**（`version` 必填 + DataScope + 原子 `version: { increment: 1 }`）。
- **B. 状态机/CAS** → 保持原 status CAS；与 `version` 可共存（`{ id, version, status }` 是 Guard 认可的并发签名）。
- **C. 系统后台维护写** → 不依赖用户 `version`：after-sales 系统清理删除（`expectedVersion` 省略）走非版本化 `updateAccessible` force-delete；work-order 系统删除同理。
- **D. 批量导入 / restore / upsert** → PRODUCT_DECISION：`supplier` create/restore/import/batchUpsert、`work-order` import upsert / create-restore 不要求逐行用户 `version`（批量/系统语义），不得静默退化为用户型 LWW。

### 16.2 统一能力（Scoped Repository）

- `updateAccessibleVersioned(args, ctx, expectedVersion)`：内部合并 `version: expectedVersion` 进 where + DataScope，data 强制 `version: { increment: 1 }`（调用方无法伪造 version 列）。
- `assertVersionedWriteAffected(count, exists, label)`：count=1 成功；count=0 时依据只读 scoped 存在性复查分类——不存在/无权限 → 404（不泄露对象存在），存在但版本过期 → 409。
- 禁止 `find → 判断 → update` 的 TOCTOU 序列；错误分类查询只读、不用于授权后普通写。

### 16.3 冲突判定与 HTTP 语义

| 场景                      | HTTP | 错误码                     |
| ------------------------- | ---- | -------------------------- |
| 缺 version / 非法 version | 400  | `BAD_REQUEST`              |
| 对象不存在或无数据权限    | 404  | `NOT_FOUND`                |
| 对象存在但版本过期        | 409  | `OPTIMISTIC_LOCK_CONFLICT` |

### 16.4 API Contract

- 列表/详情响应必须携带 `version`（三模块列表均为全行映射，`version` 已随响应返回）。
- 用户编辑/删除请求必须携带 `version`（body 或 query），解析统一走 `utils/optimistic-lock.ts#requireExpectedVersionBody/Query`；缺失 → 400，不允许“version 可选、缺失退化为 LWW”。

### 16.5 Architecture Guard

- 三模型（`after_sales` / `suppliers` / `work_orders`）已在 `PROTECTED_PRISMA_MODELS`；`{ id, version }` / `{ workOrderNumber, version, isDeleted }` 等“只加 version 锚点、无 scope 条件”的裸写仍被 R-SCOPE 拦截（version 不是授权条件）。
- 放行：scoped repository `updateAccessibleVersioned`、不透明 scoped where（`...buildScopedWorkOrderWhere`）、`{ id, version, status: CAS }` 并发签名。
- 若新增用户型写入口：必须同时存在 version anchor + scope anchor；禁止重新出现 `updateAccessible(...)` 无 version 覆盖用户编辑路径（系统维护写除外）。

### 16.6 剩余 LEGACY

| 条目 | 位置 | 分类 | Owner | 风险 | 目标专项 | Review 条件 |
| --- | --- | --- | --- | --- | --- | --- |
| after-sales/supplier/work-order 批量删除（batch-delete）不携带逐条 `version` | batch-delete 路由 | DESIGN_EXCEPTION | 各模块 | 低（管理员批量删除 + RBAC + scoped where + audit，非交互编辑） | 如产品要求逐条并发校验再评估 | 引入批量 version 校验时移除 |
| 前端 409 仅提示刷新（不自动重取覆盖） | web-antd 三个编辑弹窗 | PRODUCT_DECISION | 前端 | 低 | 长期保留 | 产品决策变更时评估 |

## 17. 核心业务状态转换一致性（STATE-MACHINE-001）

task-dispatch / vehicle-commissioning / quality-loss 三模块的状态推进统一为 `显式状态机 + CAS` 范式，禁止 `status = body.status` 直接覆盖，禁止 `find → 判断 → update` 的 TOCTOU 序列。

### 17.1 保护范围

- 状态矩阵为**模块独立常量**（`*-state.ts`），不建全局万能状态机；终态不可静默回退。
- 每个状态矩阵与写入口：

| 模块 | 状态文件 | 状态集合 | 转换要点 |
| --- | --- | --- | --- |
| task-dispatch | `modules/task-dispatch/task-dispatch-state.ts` | PENDING / DISPATCHED / PROCESSING / COMPLETED / CANCELLED | 前向推进；COMPLETED / CANCELLED 终态 |
| vehicle-commissioning | `modules/vehicle-commissioning/vehicle-commissioning-state.ts` | OPEN / IN_PROGRESS / RESOLVED / CLOSED | CLOSED 只能重开回 OPEN；closedAt 随状态同步 |
| quality-loss | `modules/quality-loss/quality-loss-state.ts` | Pending / Processing / Confirmed / Resolved | 前向推进 + 显式纠偏边（Resolved 仅回 Pending） |

### 17.2 统一 CAS 范式

用户驱动的状态写一律：

1. scoped 读取当前状态（`findAccessible` / 事务内 `tx.findFirst`，带 DataScope）。
2. 断言 `current → next` 合法；未知状态文本 → 400（fail closed），非法跳转 → 409。
3. `updateMany / updateAccessible({ where: { id, status: current, ...scope }, data: { status: next } })`。
4. `count !== 1` → 只读 scoped 复查：不存在/无权限 → 404（不泄露对象存在），存在但状态已被并发修改 → 409，客户端刷新。

### 17.3 错误语义

| 场景                         | HTTP | 说明                        |
| ---------------------------- | ---- | --------------------------- |
| 未知/非法状态文本            | 400  | `BAD_REQUEST`，fail closed  |
| 非法状态跳转                 | 409  | `CONFLICT`，客户端刷新      |
| CAS 竞争（状态已被并发修改） | 409  | `CONFLICT`，事务回滚        |
| 对象不存在或无数据权限       | 404  | `NOT_FOUND`，不泄露对象存在 |

### 17.4 Architecture Guard（R-SM）

- `STATE_MACHINE_PROTECTED_MODELS = { qms_task_dispatches, quality_losses, vehicle_commissioning_issues }` 模型级保护：无论代码位于模块 service、helper、utils 还是事务客户端 `tx.*`，对保护模型写 `data.status` 都必须携带 CAS 锚点。
- 认可的锚点：where 含 `status`（期望当前状态）、scope/ownership 字段、 `OR` / `AND`、opaque scoped spread（`...scopeWhere` / `...accessWhere`）。
- 拦截形态：`{ id }`、`{ id, isDeleted: false }`、`{ lossId }` 等业务主键裸写、 `updateMany` / `deleteMany` 变形、事务客户端 `tx.model.update/updateMany`、跨模块 helper 裸写。
- 豁免：带 reason 的显式 marker（`qms-arch-allow`）；不透明 scoped where 无法静态证明为裸写时放行（仍受 R-SCOPE 全量校验兜底）。

### 17.5 LEGACY / 边界

| 条目 | 位置 | 分类 | Owner | 风险 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 报检关单 / 派单联动对 task-dispatch 状态的系统写 | inspection 域 close/dispatch 流 | TEMPORARY | inspection | 低 | 系统维护语义，沿用既有 R-SCOPE marker，不视为用户状态推进 |
| quality-loss 非 MANUAL 来源状态写 | quality-loss 域 INTERNAL/EXTERNAL/COMMISSIONING | DESIGN_EXCEPTION | quality-loss | 低 | 由各业务源页面回写，非用户手工状态推进；MANUAL 来源已全部收口 |
| quality-loss 索引物化对状态字段的同步 | quality-loss-index / worker | SYSTEM_MAINTENANCE | quality-loss | 低 | 只读源事实同步，幂等可重跑，受索引队列纪律约束 |

### 17.6 测试

- 三模块各新增 `*-state.test.ts`：矩阵完整性、严格解析、非法跳转 409、未知状态 400。
- service 层 CAS 断言：`updateMany/updateAccessible` where 含期望 `status`；新增非法跳转 409、CAS 竞争 409、未知状态 400 回归用例。
- Guard fixture：拦截裸写（`{id}` / `{id,isDeleted}` 变形 / tx / updateMany / helper 裸写），放行 CAS、scoped spread、带 reason marker、scoped repository 调用。

## 18. 关单副作用一致性（CLOSE-EFFECTS-INTEGRITY-001）

Inspection Request Close 链路统一为 `严格关单 CAS + 主事务内业务写 + 附件合并乐观 CAS + 幂等 post-commit`。

### 18.1 Close Effect Matrix

| Effect | 数据源 | 目标表 | 时机 | 分类 | 幂等 | 失败影响 |
| --- | --- | --- | --- | --- | --- | --- |
| 请求状态守卫（严格 CAS） | body + 预读请求 | `qms_inspection_requests` | 主事务内 | MUST_SAME_TRANSACTION | 天然 | 关单失败 |
| 请求行 closeAttachments/结果/关闭事实 | body | `qms_inspection_requests` | 主事务内 | MUST_SAME_TRANSACTION | 天然 | 关单失败 |
| 检验记录（生成或显式关联：结果/数量/责任） | 请求快照 | `inspections` | 主事务内 | MUST_SAME_TRANSACTION | 天然 | 关单失败 |
| 不合格项创建/关闭 + 质量损失索引信号 | body/请求 | `quality_records` + queue | 主事务内 | MUST_SAME_TRANSACTION | DB 约束 + CAS | 关单失败 |
| 请求-检验关联 | 生成/显式 | `qms_inspection_request_inspections` | 主事务内 | MUST_SAME_TRANSACTION | `skipDuplicates` | 关单失败 |
| 派单任务状态 | 请求行 | `qms_task_dispatches` | 主事务内 | MUST_SAME_TRANSACTION | CAS | 关单失败 |
| 供应商评分/焊工评分信号 | 检验记录 | metric-refresh / welder queue | 主事务内/after-commit | MUST_SAME_TRANSACTION / IDEMPOTENT | 队列幂等 | 可重跑 |
| 附件 JSON 快照合并 | 请求 closeAttachments | `inspections.documents / selfCheckDocuments` | post-commit | AFTER_COMMIT_IDEMPOTENT | CAS 合并去重 | 日志 + 人工补偿 |
| `file_references` 登记（请求/检验记录/不合格项） | 附件列表 | `file_references` | post-commit（事务内调用必须传 tx） | AFTER_COMMIT_IDEMPOTENT | deleteMany + createMany `skipDuplicates` | 日志 + 人工补偿 |
| 业务审计（close / 不合格项 / 责任裁决） | 请求/记录 | `audit_logs` | post-commit | AFTER_COMMIT_IDEMPOTENT | 追加型 | 日志 |

### 18.2 严格关单 CAS

主事务守卫禁止 `status: { not: CLOSED }`（并发 FAIL 关单会双过），必须锚定预读状态：

```ts
await tx.qms_inspection_requests.updateMany({
  data: { status: INSPECTING },
  where: { id, isDeleted: false, status: request.status },
});
```

同一请求并发 close 只有一个成功；败者抛业务错误且不触发任何 close-effects。

### 18.3 附件 canonical source 与 CAS 合并

- canonical source = `file_references`；`inspections.documents / selfCheckDocuments` = 兼容快照，两源必须一致。
- 快照合并禁止 `find → JS merge → update({where:{id}})`（Lost Update），改用 `findUnique` → 按 fileId/url 去重合并 → `updateMany({ where: { id, documents, selfCheckDocuments }, data })`； `count=0` 重读重合并，最多 3 次，超限按 `effectName/requestId/inspectionId` 记日志供人工补偿，禁止无限重试。
- 按检验记录逐个隔离失败，一条记录的合并失败不得吞掉其它记录的引用登记。

### 18.4 Transaction Client 传播

- 事务内调用 `FileStorageService.registerReferencesFromAttachments` 必须传 `tx` （`inspection-record-create/update` 已强制）；禁止事务内调用但内部走 global `prisma`。

### 18.5 Guard（R-CLOSE-EFFECT）

- `INSPECTION_CLOSE_EFFECT_FILE_PATTERN`：`inspection-request-close-effects.service.ts` 内 `inspections.update/updateMany` 必须锚定 `documents / selfCheckDocuments` 快照列（乐观 CAS）或 opaque scoped spread；裸 `{ id }`、无关列 CAS、单列锚点均拦截；marker 带 reason 豁免。
- baseline 变化：移除 `R-SCOPE|...close-effects.service.ts|bare-id-write-inspections.update` 1 条。

### 18.6 剩余 LEGACY

| 条目 | 位置 | 分类 | Owner | 风险 | Review 条件 |
| --- | --- | --- | --- | --- | --- |
| 主事务内派生 id 写（请求行/检验记录/派单任务）的 R-SCOPE marker ×4 | `inspection-request-close.service.ts` / `close-records.service.ts` | DESIGN_EXCEPTION | inspection | 低（id 均源自严格 CAS 锁定的请求行，同事务内） | 引入按对象的 scoped repository 写入口时移除 |
| 审计日志重复执行无幂等键 | close-effects post-commit | PRODUCT_DECISION | inspection | 低（fire-once 语义） | 引入 Idempotency-Key 框架时统一处理 |
| 存量 JSON 快照与 `file_references` 漂移 | 生产数据 | 审计项 | inspection | 待评估 | 运行 `audit:inspection-document-drift` 后按 CLOSE-EFFECTS-RECONCILE-001 处理 |
