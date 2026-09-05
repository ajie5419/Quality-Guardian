# METRIC-GOVERNANCE-001 / PHASE-5D

## BM-GROSS-QUALITY-LOSS Consumer Dual Run

### 执行边界

本阶段对 Quality Loss Dashboard、Analytics API 和 Quality Loss Summary 执行消费者级双轨验证。Legacy Consumer 继续作为用户可见输出，Canonical Result 仅用于验证；未切换 Dashboard、Report 或 Export。

### Consumer Evidence

执行入口：`executeGrossQualityLossConsumerDualRun`。

每条 Evidence 包含：

- `consumer`
- `metricCode = BM-GROSS-QUALITY-LOSS`
- `version`
- `scope = ALL | DEPT | SELF`
- `executionWindow`
- `legacyResult`
- `canonicalResult`
- `diff`
- `classification`

消费者范围：

| Consumer | Legacy 输出 | Canonical 验证目标 | 用户输出切换 |
| --- | --- | --- | --- |
| Quality Loss Dashboard | 保持现有 Quality Loss Service 结果 | `SUM(amount)` Gross Loss | 否 |
| Analytics API | 保持现有 stats/trend 结果 | `SUM(amount)` Gross Loss | 否 |
| Quality Loss Summary | 保持 `totalAmount`、`totalClaim`、`pendingAmount` 展示 | 仅对 `totalAmount` 对账 | 否 |

### 口径验证

1. 金额：Canonical 使用 `SUM(amount)`。
2. 时间：使用 `occurDate` 窗口。
3. 过滤：排除 `isDeleted = true`。
4. 范围：分别执行 `ALL`、`DEPT`、`SELF`，并保持 DataScope 一致。
5. 边界：Gross Loss 不扣减 `actualClaim`，不包含 Net Loss 或 Claim Recovery。

### Diff Classification

- `MATCH`：Legacy 与 Canonical 一致。
- `MINOR_DIFF`：仅存在已解释的精度差异。
- `BUSINESS_REVIEW_REQUIRED`：金额、窗口、来源或范围存在未批准差异。
- `BLOCKED`：Adapter、Version、数据库或 Scope 不可用；禁止猜测结果。

### 保留与回滚

- Legacy Calculation 与 Legacy Query 保持不变。
- Rollback Path 仍指向原 Quality Loss Service/Query。
- Dual Run Evidence 持久化并保留，供后续切换审批使用。
- 本阶段不修改 Metric Definition、ACTIVE Version、历史数据或任何用户可见输出。
