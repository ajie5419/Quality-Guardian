# METRIC-GOVERNANCE-001 / PHASE-2B

## Real Calculation Adapter & Shadow Evidence

本报告记录首批真实 Calculation Adapter 的定义和 Evidence 契约。Shadow 运行只读调用既有服务，并在同一 scope 与时间窗口中重算 Canonical 结果；不会改变 Dashboard、Report、Projection 或现有指标输出。

## Adapter Registry

| Metric | Version | Source Query | Current Formula | Canonical Formula |
| --- | --- | --- | --- | --- |
| BM-GROSS-QUALITY-LOSS | v1 | `QualityLossService.getTrendData('month', access)` | 现有趋势结果 `SUM(totalAmount)` | Canonical Gross Loss = 质量损失发生总额 |
| BM-FIRST-PASS-YIELD | v1 | `getLegacyInspectionPassRateSummaryByRange(start, end, access)` | 现有 `passRate` | 首次有效合格数量 / 首次有效检验数量 |
| BM-PROBLEM-CLOSURE-RATE | v1 | `InspectionIssueStatsService.getIssueStats({ year, userContext })` | 现有 `closedRate` 统计来源 | 关闭问题数 / 问题总数 |

## Evidence Contract

每次 Snapshot 必须包含：

- `metricCode`
- `version`
- `calculatedAt`
- `source`
- `result.current`
- `result.canonical`
- `diff.status`
- `diff.fields`

Diff 分类：

- `MATCH`：无字段差异
- `MINOR_DIFF`：单一数值字段差异，待确认容差
- `BUSINESS_REVIEW_REQUIRED`：多字段或业务语义差异
- `BLOCKED`：数据范围、来源或计算前置条件无法确认

## Initial Evidence Status

| Metric | Current Formula | Canonical Formula | Difference | Resolution |
| --- | --- | --- | --- | --- |
| BM-GROSS-QUALITY-LOSS | QualityLossService trend aggregation | Gross Loss total amount | 待在指定 scope 运行 Snapshot | 运行后按 Diff 分类 |
| BM-FIRST-PASS-YIELD | Legacy inspection pass-rate summary | First valid pass yield | 待在指定 scope 运行 Snapshot | 运行后按 Diff 分类 |
| BM-PROBLEM-CLOSURE-RATE | Inspection issue closed-rate statistics | Closed problems / all problems | 待在指定 scope 运行 Snapshot | 运行后按 Diff 分类 |

实际 Snapshot 运行必须保留输入 scope、时间窗口和 Registry Version；没有 Evidence 的指标不得激活。
