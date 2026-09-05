# vehicle-commissioning 模块

## 职责

调试验收问题台账、质量损失联动、日报和验收报表。

## 问题台账删除边界

- 问题台账只允许具备 `QMS:VehicleCommissioning:Delete` 权限的用户删除。
- 删除采用软删除，查询必须带 `isDeleted: false`；历史日报中的问题快照不回写、不清理。
- 删除时同步软删除附件引用和质量损失索引，并写入模块声明的删除审计日志。
- API 只负责认证、参数解析和调用公开 service；删除业务逻辑集中在 `vehicle-commissioning-delete.service.ts`。

## 问题台账状态机约束（STATE-MACHINE-001）

- 问题状态必须通过显式转换矩阵 `VEHICLE_COMMISSIONING_ISSUE_TRANSITIONS`： `OPEN / IN_PROGRESS / RESOLVED` 可互转并均可进入 `CLOSED`；`CLOSED` 只能重开回 `OPEN`，以保证 `closedAt` 生命周期一致。
- 写路径严格校验：`assertVehicleCommissioningIssueStatus` 只接受规范状态值，未知文本 → 400，绝不静默归一为 `OPEN`（避免意外重开已关闭问题）；读路径仍使用宽松别名解析 `parseVehicleCommissioningIssueStatus`，两者职责分离。
- 更新事务内 `tx.findFirst(id)` 读取当前状态 → 断言合法转换 → `tx.updateMany({ where: { id, status: <期望当前状态> }, data: { status, closedAt } })`； `closedAt` 随状态同步（`CLOSED` 写入当前时间，其他状态置空）。 `count !== 1` 时只读复查区分 404 与 409；并发状态变化 → 409 整事务回滚。

## 问题创建幂等（IDEMPOTENCY-KEY-001 / PHASE-2）

- `POST /qms/vehicle-commissioning/issues` 强制 `Idempotency-Key`，operationKey = `qms.vehicle-commissioning-issue.create`，窗口 5 分钟。
- claim 行与 `createIssue`（含 `quality_loss_index_jobs` 信号 enqueue）同一事务； `createIssueFromBody` 在 claim 事务内执行，post-commit（照片引用 + `issueCreate` 审计）拆到 `applyIssueCreatePostCommit` 仅首次执行。

## 约束

- 所有业务写入必须保留责任部门的受控字段写入路径。
- 新增问题操作必须通过模块权限和审计声明管理。
- 新增业务逻辑必须附带单元测试，查询软删除记录必须显式过滤 `isDeleted: false`。
