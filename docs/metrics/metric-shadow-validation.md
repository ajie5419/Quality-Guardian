# METRIC-GOVERNANCE-001 / PHASE-2A

## Shadow Metric Validation Foundation

本阶段建立只读影子计算框架。影子计算与现有计算并行执行，输出 Result Snapshot 和字段级 Diff Report；不会改写现有指标、Dashboard、Report、Projection 或历史数据。

## Framework Contract

每个 Calculation Adapter 必须声明：

- `metricCode`：Canonical Metric Code
- `registryDefinition`：当前 Registry Definition 的版本化摘要
- `sourceQuery`：真实来源查询说明（只记录查询契约，不执行字符串公式）
- `calculateCurrent`：调用现有计算逻辑
- `calculateShadow`：调用新 Canonical 影子逻辑

`calculateShadowMetric()` 生成：

- Metric Code
- Calculation Time
- Registry Definition
- Current Calculation
- Shadow Calculation
- Difference（`equal` 与字段级差异）

Result Snapshot 应由上层验证任务持久化到审计/验证证据存储；本框架不写业务指标值。

## First Batch

| Metric | Registry Definition | Current Calculation | Shadow Calculation | Difference | Resolution |
| --- | --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | 首次有效检验一次通过率 | 现有检验/报表计算入口 | Canonical 首次检验事件适配器 | 待运行快照 | 差异需业务口径复核 |
| BM-FINAL-PASS-RATE | 最终检验合格率 | 现有最终结果计算入口 | Canonical 最终结果适配器 | 待运行快照 | 差异需业务口径复核 |
| BM-GROSS-QUALITY-LOSS | 质量损失发生总额 | 现有质量损失汇总入口 | Canonical Gross Loss 适配器 | 待运行快照 | 差异需源范围复核 |
| BM-NET-QUALITY-LOSS | Gross Loss 减已确认追偿 | 现有质量损失汇总入口 | Canonical Net Loss 适配器 | 待运行快照 | 差异需追偿状态复核 |
| BM-PROBLEM-CLOSURE-RATE | 问题关闭率 | 现有问题统计入口 | Canonical 问题关闭适配器 | 待运行快照 | 差异需状态范围复核 |

## Validation Evidence

影子验证证据至少包含：`metricCode`、Registry Version、scope、asOf、current snapshot、shadow snapshot、diff report、执行时间和 Resolution。没有证据时，Metric 不具备激活资格。Policy Pending、历史不可回算或 DataScope 未确认时，验证结果只能记录为 `BLOCKED`，不得以通过替代。

## Activation Guard

`metric-governance-readiness.ts` 将 `SHADOW_VALIDATION_MISSING` 纳入激活前置条件。即使 Approval Evidence、Owner、Effective Date 和 Policy 均满足，缺少影子验证证据仍必须拒绝 ACTIVE。现阶段首批指标保持 DRAFT，等待实际 Shadow Snapshot 和 Diff Resolution。
