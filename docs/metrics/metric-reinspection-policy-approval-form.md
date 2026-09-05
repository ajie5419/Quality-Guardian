# METRIC-GOVERNANCE-001 / PHASE-6.3-HUMAN-APPROVAL

## BM-REINSPECTION-RATE Policy Approval Form

本表是人工审批输入，不代表已批准。未完成填写和确认前，指标必须保持 `BLOCKED_POLICY`。

## Metric

| Field          | Value                       |
| -------------- | --------------------------- |
| Metric Code    | `BM-REINSPECTION-RATE`      |
| Metric Name    | Reinspection Rate / 复检率  |
| Current Status | `PENDING_BUSINESS_APPROVAL` |

## Policy Decisions

### 1. Reinspection Event Definition

候选定义：同一有效 inspection request 在首次有效检验后产生再次提交或再次执行，并形成有效结论，计为复检事件；草稿、取消、N/A、无结论和同一 Revision 内重复保存不计入。

业务决定：

```text
Decision: ____________________
Approved Definition: ________________________________________________
____________________________________________________________________
```

### 2. Revision Key

候选：`requestId + revision`。Revision 必须持久化、稳定、单调且可历史回算。

业务决定：

```text
Decision: ____________________
Approved Revision Key: ______________________________________________
Revision Missing/Unstable Handling: _________________________________
```

### 3. Deduplication Rule

候选：同一 request 在统计窗口内只计一个复检 request；同一 Revision 的重复提交/执行只计一次；无法解析 Revision 的记录进入 Exception Queue。

业务决定：

```text
Decision: ____________________
Approved Deduplication Rule: ________________________________________
Cross-window Rule: __________________________________________________
```

### 4. Zero Denominator Rule

候选：eligible inspection request 分母为 0 时，Canonical Result 返回 `NULL`，展示层可显示 `N/A`，不得返回 0% 或 100%。

业务决定：

```text
Decision: ____________________
Approved Zero Denominator Rule: _____________________________________
```

### 5. Historical Backfill Rule

候选：仅自动处理 Revision Key 可解析、去重可重复计算且事实数据完整的历史 request；无法稳定回算的记录进入 Exception Queue，由人工复核，不猜测纳入或排除。

业务决定：

```text
Decision: ____________________
Approved Historical Backfill Rule: _________________________________
____________________________________________________________________
```

## Exception Handling

请明确无法回算历史记录的处理方式：

```text
Exception Queue Required:  YES / NO
Manual Review Required:    YES / NO
Default Treatment:         INCLUDE / EXCLUDE / REVIEW_ONLY / OTHER
Exception Retention Rule:   _________________________________________
Exception Decision Note:    _________________________________________
```

## Approval Fields

```text
Decision:          APPROVE / MODIFY / DEFER
Decision By:       _________________________________________________
Effective Date:    _________________________________________________
Decision Note:     _________________________________________________
```

填写完成后，由治理流程追加 Approval Evidence。AI 不得补填、推断或代替审批。
