# METRIC-GOVERNANCE-001 / PHASE-5B

## BM-GROSS-QUALITY-LOSS Dual Run Report

### 执行边界

本阶段仅执行 `BM-GROSS-QUALITY-LOSS` Legacy vs Canonical 双轨验证，不切换 Dashboard、Report 或 Export，不修改 Metric Definition、ACTIVE Version 或历史数据。

### 双轨定义

| 轨道 | 实现 | 口径 |
| --- | --- | --- |
| Legacy Result | 现有 `QualityLossService` / `QualityLossReportingService` | 现有 `quality_loss_index` 查询和聚合 |
| Canonical Result | `BM-GROSS-QUALITY-LOSS` Adapter | `SUM(amount)`，按 `occurDate`，`isDeleted = false`，继承 DataScope |
| Evidence | `executeGrossQualityLossDualRun` | 持久化 Version、窗口、scope、结果和分类 |

### 验证范围

每次执行明确记录：

- `scope`: `ALL` / `DEPT` / `SELF`
- `executionWindow.start/end`
- `metricCode`: `BM-GROSS-QUALITY-LOSS`
- `version`: `v1`
- Legacy Result、Canonical Result、Diff 和 Classification

### Diff Classification

- `MATCH`：结果一致。
- `MINOR_DIFF`：仅有可解释的数值精度差异。
- `BUSINESS_REVIEW_REQUIRED`：金额、范围或过滤条件存在未批准差异。
- `BLOCKED`：数据库、版本、DataScope 或 Adapter 不可用；禁止猜测结果。

### 边界检查

1. 金额仅使用 `SUM(amount)`，不扣减 `actualClaim`。
2. 时间字段使用 `occurDate`，不得改用创建时间或更新时间。
3. 软删除记录由 `isDeleted = false` 排除。
4. `ALL/DEPT/SELF` 必须使用同一 DataScope 语义；空范围 fail-closed。
5. `BM-NET-QUALITY-LOSS` 与 `BM-CLAIM-RECOVERY` 不参与本次 Gross 结果，也不自动合并。

### 保留与回滚

- Legacy Query、Legacy Calculation 和原消费者入口全部保留。
- Rollback 仍指向 Legacy Result。
- 本阶段不执行任何消费者切换；Dual Run Evidence 仅用于验证和后续业务复核。
