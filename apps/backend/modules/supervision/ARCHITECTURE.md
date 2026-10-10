# supervision 模块

## 职责

质量监督检查全流程：监督项目立项 → 计划任务分配 → 问题发现与跟踪 → 报告输出。

## 文件结构

- `supervision.service.ts` — 监督主服务（项目级操作）
- `supervision-project.service.ts` — 监督项目 CRUD
- `supervision-plan-task.service.ts` — 计划任务分配与执行
- `supervision-deadline-board.service.ts` — 纳期看板只读聚合
- `supervision-plan-task-import.service.ts` — 计划 Excel 导入（覆盖导入）
- `supervision-plan-task-progress.ts` — 项目进度/状态派生重算（系统维护写）
- `supervision-issue.service.ts` — 问题记录与整改跟踪
- `supervision-report.service.ts` — 监督报告生成
- `supervision-access.ts` — 对象级访问上下文（SEC-SUPERVISION-001）
- `supervision-state.ts` — 显式状态转换矩阵 + 409 helper（SEC-SUPERVISION-001）
- `supervision-audit.ts` — 审计写辅助（复用 SystemLogService）
- `supervision-shared.ts` — 模块内共享工具函数

## 对外接口

所有子服务通过 `index.ts` 统一导出。调用方按需 import 具体 service。

## 依赖

- `~/utils/prisma`
- `~/modules/data-scope/` — 数据权限

## 特殊约束

- 子服务之间有调用关系（issue 关联 plan-task，report 汇总 issue）
- 监督项目有状态流转：`PLANNED / IN_PROGRESS / PAUSED / COMPLETED`（COMPLETED 仅可 → IN_PROGRESS）
- 问题状态流转：`OPEN / IN_PROGRESS / VERIFYING / CLOSED`（CLOSED 仅可 → OPEN）

## 权限模型（SEC-SUPERVISION-001）

调用链：`Authentication → RBAC → Object Authorization → Domain Service → Scoped Write → Audit`。

- 无部门维度：对象边界为 **creator 所有权**——普通用户只能写自己创建的项目/问题/日报；系统管理员（super/admin）为 ALL。`createdBy` 列（迁移 `20260820150000_add_supervision_created_by`）记录创建者；无 creator 的存量行仅管理员可写（fail-closed，不扩权）。
- 计划任务继承父项目范围：`task` 的 where 追加 `{ project: { createdBy } }`，不允许只凭任务 ID 操作他人项目的任务。
- 所有 update/delete 使用 `updateMany({ where: { id, ...accessWhere, 状态条件 } })` + `count !== 1 → 404/409`，禁止 `find → 判断 → update` 的 TOCTOU 模式。
- 状态转换必须经过 `supervision-state.ts` 显式矩阵；CAS 以当前 `status` 作为原子锚点。
- 用户型写成功路径记录审计（`auditSupervisionWrite`，动作在 `supervisionModule.audit` 声明）。

## 并发（CAS）

- 项目/问题状态写：`where` 携带当前 `status`；进度变化时由 `syncSupervisionProjectProgress` 按叶子任务重算派生进度与状态（系统维护写，Guard marker 豁免）。
- 任务删除：`status !== 'DONE'` 才可删；导入仅在项目非 `COMPLETED` 时可覆盖。
- 竞争/并发状态变更 → `409 CONFLICT`；越权/不存在 → `404 NOT_FOUND`。

## 处理记录的桌面重试边界

- 桌面问题处理抽屉每次打开生成新的 `Idempotency-Key`；提交失败或丢响应时保留该键，成功后的下一次跟进使用新键。
- 带键处理调用复用 idempotency 模块，将 claim 与处理记录/状态 CAS 写入同一事务。5分钟内相同键和 payload 返回原结果，同键不同 payload 返回409；重放重新校验创建者权限及未删除状态。
- 相同内容的新键仍可形成合法后续跟进；未带键的既有调用保留旧行为，不能据此宣称已覆盖移动/微信端的幂等保证。
- 授权调用位于监督写路由的错误边界内，RBAC拒绝透传标准403，不由全局错误转换为500。真实E2E与缺陷前后证据见 [统一验收报告](../../../../docs/web-e2e-verification.md)。

## 供应商身份契约与治理阶段

- `supervision_projects.supplierId` 是供应商关联 ID，`supplierName` 仅为名称快照；服务端应根据 ID 校验并生成 canonical 名称。
- `supplierName` 查询仅用于关键字搜索和历史数据排查，不得用于画像、统计或跨表关联，也不得以名称作为 ID 缺失时的在线回退。
- 当前 supervision 在线写入已要求 `supplierId`，服务端按 ID 重建 canonical 名称快照；本模块尚未纳入本轮供应商身份存量回填及 unresolved 审计。
- 后续治理 wave 必须补齐 supervision 存量回填、审计和生产指标核对；任何 import/backfill 名称解析都必须建立显式白名单和审计。

本轮 supplier identity governance wave 不代表 supervision 存量或其他主数据已达到全项目 `ID_ONLY`。通用规则见 `docs/master-data-identity-governance.md`。
