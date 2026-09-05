# METRIC-GOVERNANCE-001 / PHASE-5C

## BM-GROSS-QUALITY-LOSS Consumer Cutover Readiness

本阶段完成切换准备，不执行 Dashboard、Analytics API、Report、Export 或 Quality Loss Summary 的实际切换。

## 1. Consumer Mapping

| Consumer | Current Source | Target Canonical Metric | Migration Strategy | Readiness |
| --- | --- | --- | --- | --- |
| Quality Loss Dashboard KPI | `QualityLossService.getStatsForDashboard` → `QualityLossReportingService`，聚合 `quality_loss_index.amount` | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER + DUAL_RUN_REQUIRED | READY_FOR_GATE |
| Quality Loss Dashboard Trend | `QualityLossService.getTrendData`，按月/周聚合 `amount` | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER + DUAL_RUN_REQUIRED | READY_FOR_GATE |
| Analytics API | Quality Loss stats/trend service | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER + DUAL_RUN_REQUIRED | READY_FOR_GATE |
| Quality Loss Summary | `QualityLossSummaryService.getDashboardSummary` 的 `totalAmount` | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER + DUAL_RUN_REQUIRED | READY_FOR_GATE |
| Report | 当前主要输出 inspection loss 与 after-sales net loss，不等同于 Gross Quality Loss | 不直接替换 | LEGACY_KEEP | BLOCKED_SCOPE |
| Export | `/qms/quality-loss/export` 输出明细，不是 Canonical 聚合 KPI | 保留明细导出 | LEGACY_KEEP | BLOCKED_SCOPE |

## 2. Cutover Gate

消费者只有同时满足以下条件才允许后续切换：

1. Evidence 完整：metricCode、version、executionWindow、scope、Legacy Result、Canonical Result、diff、classification 均存在。
2. `ALL / DEPT / SELF` 均为 `MATCH`，或 MINOR_DIFF 已有明确业务批准；`BUSINESS_REVIEW_REQUIRED`、`BLOCKED` 直接阻断。
3. 两条轨道均使用相同的 `occurDate` 窗口、`isDeleted = false` 过滤和 DataScope 解析。
4. Gross 只计算 `SUM(amount)`，不得扣减 `actualClaim`；Net Loss 和 Claim Recovery 不得混入。
5. Rollback 可通过原 Legacy Service/Query 独立执行，且不依赖 Canonical 状态。
6. 切换不修改历史数据、历史报告、Metric Definition 或 ACTIVE Version。

5E 逐项状态：

| Gate | Required condition | Status |
| --- | --- | --- |
| Dual Run Evidence | 每个消费者、窗口和 ALL/DEPT/SELF 均有完整证据 | PENDING_FINAL_REVIEW |
| Scope consistency | ALL/DEPT/SELF 使用同一 DataScope 语义 | READY_FOR_REVIEW |
| MATCH threshold | 结果必须达到 MATCH | PENDING_FINAL_REVIEW |
| MINOR_DIFF tolerance | 仅接受已有业务批准的容差 | BLOCKED_UNTIL_APPROVED |
| BUSINESS_REVIEW_REQUIRED | 必须全部关闭 | BLOCKED_UNTIL_CLOSED |
| Rollback | Legacy Service/Query 可独立执行 | READY |

在业务复核和容差确认完成前，`PHASE5E_READY_FOR_CUTOVER = false`；本阶段不自动判定为可切换。

## 3. Adapter Design

### Forward

`Legacy Consumer → Gross Quality Loss Adapter → BM-GROSS-QUALITY-LOSS`

Adapter 输入固定窗口、DataScope 和 Version，输出 Canonical Gross Result，并保留原消费者需要的字段形状。Dual Run Evidence 在切换前后继续保留。

### Rollback

`Canonical Adapter → Legacy Result`

Rollback 直接回到现有 Quality Loss Service/Query，不删除或覆盖 Legacy Calculation。Dashboard、Analytics API 和 Summary 应使用显式开关控制 Forward/Rollback；Report 与 Export 在边界未确认前保持 Legacy。

## 4. Evidence 与当前结论

PHASE-5B 已建立 `BM-GROSS-QUALITY-LOSS` 的 `ALL / DEPT / SELF` 双轨执行和持久化 Evidence。后续正式切换前仍需逐消费者确认结果字段、窗口和 Scope 完全一致；本 Readiness 文档不代替业务批准，也不执行切换。

## 5. Consumer Cutover Audit

实际切换时必须追加 append-only Audit Record，字段固定为：

| 字段 | 内容 |
| --- | --- |
| `metricCode` | `BM-GROSS-QUALITY-LOSS` |
| `consumerType` | `QUALITY_LOSS_DASHBOARD` / `ANALYTICS_API` / `QUALITY_LOSS_SUMMARY` |
| `oldMode` | `LEGACY` |
| `newMode` | `CANONICAL` |
| `effectiveTime` | 实际切换时间，不在本阶段填写 |
| `rollbackConfig` | 指向 Legacy Adapter/Query 的配置 |

本阶段仅定义 Audit 契约，不写入切换记录。

## 5. 保护边界

- 不实际切换任何消费者。
- 不修改 Dashboard、Report、Export 或业务计算。
- 不修改 Metric Definition、ACTIVE Version 或历史数据。
- 不删除 Legacy Calculation、Legacy Query 或 Rollback Path。
