# METRIC-GOVERNANCE-001 / PHASE-5H.1

## Metric Approval Granularity

### 目标

将一次性的业务口径审批与版本、消费者迁移、历史回算分离，避免为每条历史记录重复请求人工批准，同时保持每个治理动作可追溯、可回滚、可审计。

## 1. 分层审批模型

| 层级 | 审批对象 | 触发条件 | 审批证据 | 影响范围 |
| --- | --- | --- | --- | --- |
| Metric Policy Approval | 指标业务定义、公式、Scope、边界和容差规则 | 新指标或业务口径变化 | Policy Approval Evidence | 所有后续版本和消费者 |
| Version Approval | 某个 Definition Version 的公式、字段、来源或有效期 | 新建或变更 Version | Version Approval Evidence | 指定 Version |
| Consumer Cutover Approval | 某个 Consumer 从 Legacy 切换到 Canonical | Dashboard/API/Report/Export 等迁移 | Consumer Cutover Evidence | 指定 Metric + Consumer |
| Historical Backfill Approval | 某个指标、版本和窗口的批量历史回算 | 需要回算历史数据或重建派生结果 | Backfill Approval Evidence | 指定 Batch Job 和窗口 |

审批不可跨层隐式继承：Policy Approval 不自动批准 Version、Consumer Cutover 或 Historical Backfill。

## 2. Historical Recalculation Governance

历史回算按 Batch Job 管理，不逐历史记录请求人工审批。

### Batch Job Evidence

每个批次必须产生 append-only Evidence：

- `metricCode`
- `version`
- `batchJobId`
- `executionWindow`
- `scope`
- `sourceSnapshot`
- `formulaHash`
- `startedAt` / `completedAt`
- `rowCount`
- `successCount`
- `exceptionCount`
- `resultChecksum`
- `operator` / `executionMode`

### Validation Summary

批次完成后生成汇总校验：

- 输入行数与成功、异常行数相等。
- 公式和 Version 与已批准 Evidence 一致。
- Scope、软删除和时间窗口符合 Policy。
- 结果数量、金额/比率总计和 checksum 可重复验证。
- 与现有 Legacy 结果的差异分类可追溯。

### Exception Queue

以下情况进入 Exception Queue，不得静默写入 Canonical 结果：

- 身份、Scope 或时间字段无法解析。
- Source Snapshot 缺失或重复。
- 公式、Version 或 Policy 不匹配。
- Legacy/Canonical 差异超过已批准容差。
- 数据库、Adapter 或批次执行失败。

异常项至少保存 `batchJobId`、记录标识、原因、当前值、Canonical 候选值和重试状态。

### Manual Review Only For Exceptions

- 正常批次由 Batch Job Evidence 和 Validation Summary 批量批准。
- 只有 Exception Queue 中的异常需要人工复核。
- 人工复核结果追加到异常 Evidence，不修改原始批次 Evidence。
- 未关闭的异常不允许将批次标记为 `COMPLETED_VALIDATED`。

## 3. 状态与门禁

```text
POLICY_APPROVED
  -> VERSION_APPROVED
  -> BATCH_VALIDATED
  -> EXCEPTIONS_RESOLVED
  -> CONSUMER_CUTOVER_APPROVED
```

任一层缺少 Evidence，后续层保持 BLOCKED。历史回算也不改变 Metric Definition、Immutable Version 或既有历史事实数据；如需写入派生结果，必须使用独立、可回滚的 Batch Job。

## 4. 当前项目边界

- 本模型不自动批准现有 BM-GROSS-QUALITY-LOSS 容差。
- 不自动填写 Owner、Decision By 或 Effective Date。
- 不执行 Consumer Cutover 或 Historical Backfill。
- 仍遵守 append-only Evidence、Version immutable 和异常 fail-closed 规则。
