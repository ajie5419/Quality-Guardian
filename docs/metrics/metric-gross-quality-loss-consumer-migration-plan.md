# METRIC-GOVERNANCE-001 / PHASE-5A

## BM-GROSS-QUALITY-LOSS Consumer Migration Preparation

本阶段仅完成消费者盘点和迁移准备，不执行切换。`BM-GROSS-QUALITY-LOSS` 仍由现有消费者按 Legacy 逻辑输出。

## 1. Canonical Definition

| 项目           | 口径                                                    |
| -------------- | ------------------------------------------------------- |
| Metric         | BM-GROSS-QUALITY-LOSS                                   |
| Definition     | Reporting scope 内发生的质量损失总额，未扣除已确认追偿  |
| Formula        | `SUM(amount)`                                           |
| Primary source | `quality_loss_index.amount`                             |
| Time field     | `quality_loss_index.occurDate`                          |
| Scope          | 继承 Quality Loss DataScope                             |
| Claim recovery | 不从 Gross Loss 中扣除；由独立 `BM-CLAIM-RECOVERY` 表达 |

## 2. Legacy Consumer Mapping

| Consumer | Legacy Formula / Entry | Data Source | Target | Strategy | Risk |
| --- | --- | --- | --- | --- | --- |
| Quality Loss Dashboard KPI | `QualityLossService.getStatsForDashboard` → `QualityLossReportingService.getStatsForDashboard`；年度/周度 `SUM(amount)` | `quality_loss_index` | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER + DUAL_RUN_REQUIRED | HIGH |
| Quality Loss Dashboard Trend / Summary | `QualityLossService.getTrendData`、`QualityLossSummaryService.getDashboardSummary`；`SUM(amount)`，Summary 同时计算 `actualClaim` 和 pending net amount | `quality_loss_index` / 展示 DTO | BM-GROSS-QUALITY-LOSS 仅覆盖 gross amount | ADAPTER_LAYER + DUAL_RUN_REQUIRED | HIGH |
| Analytics API | Quality Loss dashboard/stats 与 trend service | `quality_loss_index`，按 DataScope 聚合 | BM-GROSS-QUALITY-LOSS | DUAL_RUN_REQUIRED | HIGH |
| Report | `ReportSummaryService` 的 `internalLoss` 使用 inspection loss，不是该 Metric；after-sales `netLoss` 也不是 Gross Quality Loss | `inspection` / after-sales 聚合 | 不直接替换；需业务确认边界 | LEGACY_KEEP | HIGH |
| Export | `/qms/quality-loss/export` → `QualityLossService.getExportRows`，输出明细而非聚合 KPI | `quality_losses` / index 查询 | 保留明细导出；另建 Canonical 汇总导出前需确认 | LEGACY_KEEP | MEDIUM |
| Scheduled Jobs | 未发现独立的 Gross Quality Loss 定时发布消费者；如复用 Dashboard/Trend，应沿用同一 Adapter | 继承调用方 | BM-GROSS-QUALITY-LOSS | ADAPTER_LAYER | MEDIUM |
| Quality Loss Summary | `QualityLossSummaryService.getDashboardSummary`；`totalAmount`、`totalClaim`、`pendingAmount` 同屏 | `QualityLossItem.amount`、`actualClaim` | Gross KPI 只绑定 `totalAmount` | DUAL_RUN_REQUIRED | HIGH |

## 3. 关键风险与边界

### Gross 与 Net 混用

当前 Quality Loss Summary 同时展示 `totalAmount`、`totalClaim` 和 `pendingAmount = amount - actualClaim`。这些字段不能统一替换为 Gross Metric。Canonical Gross 只能替换 `totalAmount` 类指标；Net Loss 和 Claim Recovery 必须保持独立代码与独立 Metric。

### Claim Recovery 影响

`actualClaim` 只允许进入 `BM-CLAIM-RECOVERY` 或明确的 Net 计算。将其从 Gross 中扣除会把 Gross 误变成 Net，属于业务口径破坏。

### Finance / Quality 边界

Quality Loss 的 `amount` 是质量损失事实；after-sales 报告中的 `grossCost - recovered` 是售后 Net Loss。两者不能因名称相近而合并。财务确认的追偿金额需通过 Claim Recovery Policy 进入独立指标。

### 历史一致性

Canonical 使用 `quality_loss_index` 时，必须验证索引回填、软删除、来源去重、`occurDate` 窗口和 DataScope 与各 Legacy Consumer 一致。未完成历史可回算和范围对账前，不允许切换。

## 4. 推荐迁移顺序

1. 先为 Dashboard KPI、Trend 和 Quality Summary 建立 Adapter Layer。
2. 对 ALL/DEPT/SELF 固定窗口执行 Legacy vs Canonical Dual Run。
3. 仅接受 MATCH 或有业务解释并批准的 MINOR_DIFF；`BUSINESS_REVIEW_REQUIRED`、`BLOCKED` 阻止切换。
4. Export 保持 Legacy 明细输出，待 Canonical 汇总导出需求明确后单独评审。
5. Report 中的 inspection loss、after-sales net loss 不在本阶段迁移。

## 5. 回滚与禁止事项

- Forward：Legacy Consumer → BM-GROSS-QUALITY-LOSS Adapter。
- Rollback：Canonical Adapter → 原 Legacy Service/Query。
- Legacy Calculation、历史数据、历史报告必须保留。
- 本阶段不修改 Dashboard、Report、Projection、Metric Definition、ACTIVE Version 或业务计算逻辑。
