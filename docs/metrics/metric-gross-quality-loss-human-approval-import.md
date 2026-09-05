# METRIC-GOVERNANCE-001 / PHASE-5H

## BM-GROSS-QUALITY-LOSS Human Approval Import

### Import Result

`BLOCKED — HUMAN_APPROVAL_INPUT_MISSING`

PHASE-5G 的 [Human Decision Template](./metric-gross-quality-loss-human-decision.md) 当前仍包含空白字段，仓库中没有可导入的人工批准结果。因此本阶段未创建 Approval Evidence，也未执行 Consumer Cutover。

### Required Validation Fields

| Field | Current status | Import result |
| --- | --- | --- |
| Metric Code | 模板固定为 `BM-GROSS-QUALITY-LOSS` | PRESENT |
| Decision | 空白 | BLOCKED |
| Decision By | 空白 | BLOCKED |
| Effective Date | 空白 | BLOCKED |
| Tolerance Rule | 空白 | BLOCKED |
| Approved Tolerance Value | 空白 | BLOCKED |
| Scope Confirmation | 空白 | BLOCKED |
| Rollback Confirmation | 空白 | BLOCKED |
| Historical Calculation Confirmation | 空白 | BLOCKED |

### Import Contract

收到完整人工批准内容后，导入流程必须：

1. 校验 Metric Code、Decision、Decision By、Effective Date、Tolerance Rule、Scope Confirmation 和 Rollback Confirmation 均非空。
2. 原样保留 Tolerance Decision 与 Cutover Approval 的完整审批文本。
3. 以 append-only 方式创建两类 Approval Evidence，不覆盖既有记录。
4. 关联 `BM-GROSS-QUALITY-LOSS` 当前 Definition Version，并记录 source document、recordedAt 和审计信息。
5. 重新执行 Cutover Readiness Check；任何缺失字段、未关闭业务复核或未批准容差都保持 BLOCKED。

### Current Governance State

- `PHASE5E_READY_FOR_CUTOVER = false`
- Consumer mode：`LEGACY`
- Tolerance Evidence：未创建
- Cutover Approval Evidence：未创建
- Metric Definition / ACTIVE Version：未修改
- Consumer Cutover：未执行

不得自动补齐负责人、日期、容差、Scope 或 Decision。
