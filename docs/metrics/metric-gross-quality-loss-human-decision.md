# METRIC-GOVERNANCE-001 / PHASE-5G

## BM-GROSS-QUALITY-LOSS Human Decision Recording

> 本文只提供人工业务决策输入和 Evidence 记录格式。AI 不填写负责人、日期、批准值或 Decision。

## 1. Gross Quality Loss Tolerance Decision Form

| Field | Business Input |
| --- | --- |
| Metric Code | `BM-GROSS-QUALITY-LOSS` |
| Tolerance Rule | **\_\_**（例如：金额绝对差异不超过批准值；百分比规则填写 N/A） |
| Approved Tolerance Value | **\_\_** CNY |
| Scope | **\_\_**（`ALL` / `DEPT` / `SELF` / `ALL_DEPT_SELF`） |
| Decision | **\_\_**（`APPROVE` / `MODIFY` / `DEFER`） |
| Decision By | **\_\_** |
| Effective Date | **\_\_** |
| Decision Note | **\_\_** |

当前状态：`PENDING_HUMAN_DECISION`。

## 2. Cutover Approval Form

| Field | Business Input |
| --- | --- |
| Metric Code | `BM-GROSS-QUALITY-LOSS` |
| Consumer Scope | **\_\_**（`QUALITY_LOSS_DASHBOARD` / `ANALYTICS_API` / `QUALITY_LOSS_SUMMARY` / `ALL`） |
| Activation Decision | **\_\_**（`APPROVE` / `MODIFY` / `DEFER`） |
| Effective Date | **\_\_** |
| Rollback Confirmation | **\_\_**（`CONFIRMED` / `PENDING`） |
| Historical Calculation Confirmation | **\_\_**（`CONFIRMED` / `PENDING`） |
| Decision By | **\_\_** |
| Decision Note | **\_\_** |

当前状态：`PENDING_HUMAN_DECISION`。在 Rollback 或历史计算任一项为 `PENDING` 时，不得切换消费者。

## 3. Decision Evidence Record

人工填写后，按 append-only 方式追加以下 Evidence，不覆盖既有记录：

| Evidence Field | Value |
| --- | --- |
| evidenceType | `GROSS_QUALITY_LOSS_TOLERANCE_DECISION` 或 `GROSS_QUALITY_LOSS_CUTOVER_APPROVAL` |
| metricCode | `BM-GROSS-QUALITY-LOSS` |
| sourceDocument | 本文原始审批表 |
| originalApprovalContent | **\_\_**（保留完整原始审批内容） |
| decision | **\_\_** |
| decisionBy | **\_\_** |
| effectiveDate | **\_\_** |
| scope | **\_\_** |
| decisionNote | **\_\_** |
| recordedAt | **\_\_**（由记录系统生成） |

Evidence 规则：

- 只追加，不更新或删除既有 Evidence。
- 原始审批内容必须完整保留，可审计追溯。
- 空白字段不得被 AI 推断或补齐。
- 本 Evidence 不代表自动批准，也不触发消费者切换。

## 4. 当前治理状态

- `PHASE5E_READY_FOR_CUTOVER = false`
- `Decision = PENDING`
- Consumer mode：Legacy
- Metric Definition / ACTIVE Version：不变
