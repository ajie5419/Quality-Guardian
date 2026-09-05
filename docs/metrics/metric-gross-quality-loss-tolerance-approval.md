# METRIC-GOVERNANCE-001 / PHASE-5F

## BM-GROSS-QUALITY-LOSS Business Tolerance Approval

> 本文是业务决策输入模板。以下 Recommendation 不是批准结果；所有空白字段必须由业务负责人填写。

## 1. Gross Quality Loss Diff Tolerance Policy

| Policy Item | Recommended Proposal | Business Decision |
| --- | --- | --- |
| 金额绝对差异容差 | `<= 0.01 CNY` per scoped result after source aggregation and rounding | **\_\_** |
| 百分比差异容差 | 不适用。Gross Quality Loss 是金额指标，不以百分比判定 | **\_\_** |
| ALL/DEPT/SELF | 统一使用同一金额容差；DataScope 过滤不得放宽 | **\_\_** |
| MINOR_DIFF | 仅允许金额绝对差异不超过批准容差，且来源、窗口、删除过滤和 Scope 完全一致 | **\_\_** |
| BUSINESS_REVIEW_REQUIRED | 金额超过容差，或 Gross/Net/Claim、来源、窗口、删除过滤、Scope 任一不一致 | **\_\_** |
| BLOCKED | Adapter、Version、数据库、Evidence 或 Scope 不可用时禁止生成结果 | **\_\_** |

### 建议判定公式

```text
absoluteDiff = abs(canonicalResult - legacyResult)
MINOR_DIFF 仅当 absoluteDiff <= approvedAbsoluteTolerance
且所有业务边界检查通过
```

批准前状态：`RECOMMENDED_NOT_APPROVED`。

## 2. Business Review Checklist

业务负责人逐项确认：

| Check                                             | Confirmation |
| ------------------------------------------------- | ------------ |
| Gross Loss 只计算发生的质量损失总额 `SUM(amount)` | **\_\_**     |
| Gross Loss 不扣减 `actualClaim`                   | **\_\_**     |
| Net Loss 保持独立，不并入 Gross Metric            | **\_\_**     |
| Claim Recovery 保持独立，不并入 Gross Metric      | **\_\_**     |
| `occurDate` 是统一时间字段                        | **\_\_**     |
| `isDeleted = false` 是统一过滤规则                | **\_\_**     |
| ALL/DEPT/SELF 使用相同 DataScope 语义             | **\_\_**     |
| 财务确认规则仅适用于已确认追偿，不改变 Gross Loss | **\_\_**     |
| 历史数据可按 Canonical 口径回算                   | **\_\_**     |

## 3. Final Cutover Approval Template

| Field | Value |
| --- | --- |
| Metric Code | `BM-GROSS-QUALITY-LOSS` |
| Decision | **\_\_** (`APPROVE` / `MODIFY` / `DEFER`) |
| Decision By | **\_\_** |
| Effective Date | **\_\_** |
| Scope Confirmation | **\_\_** (`ALL` / `DEPT` / `SELF` / `ALL_CONFIRMED`) |
| Historical Calculation Confirmation | **\_\_** (`CONFIRMED` / `PENDING`) |
| Approved Absolute Tolerance | **\_\_** CNY |
| Approved Percentage Tolerance | `N/A` or **\_\_** |
| Activation/Cutover Note | **\_\_** |

### 当前治理状态

- `PHASE5E_READY_FOR_CUTOVER = false`
- Decision：`PENDING`
- Owner：不自动生成
- Effective Date：不自动生成
- Consumer：保持 Legacy，不执行切换
