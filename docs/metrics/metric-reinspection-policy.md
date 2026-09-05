# METRIC-GOVERNANCE-001 / PHASE-6.3-POLICY

## BM-REINSPECTION-RATE Policy Finalization Preparation

状态：`PENDING_BUSINESS_APPROVAL`

本文只记录候选制度，不代表业务批准。Adapter 在批准证据写入前必须保持 `BLOCKED_POLICY`。

## 1. Reinspection Event Definition

### 推荐候选：Request-level

一次复检事件定义为：同一有效 inspection request 在首次有效检验之后，产生一次被系统确认的再次提交或再次执行记录，并且该记录不是草稿、取消、N/A 或无结论记录。

以下情况不计为复检事件：

- 首次有效检验；
- 仅修改表单但没有再次提交/执行；
- 草稿、取消、N/A 或未形成有效结论的记录；
- 同一 Revision 内的重复保存；
- 无法稳定关联到原 request 的孤立记录。

业务负责人必须确认“再次提交”和“再次执行”是否都构成事件，以及 FAIL 后重提是否需要单独 Policy。

## 2. Revision Key Policy

候选方案：

| Option | Revision Key | 说明 |
| --- | --- | --- |
| A（推荐候选） | `requestId + revision` | Revision 必须由系统持久化、单调递增且跨重试稳定 |
| B | `requestId + submissionSequence` | 仅当 submission sequence 在历史数据中完整且不可重排时可用 |
| C | `requestId + eventId` | 只能识别事件，不能证明同一次 Revision；不建议作为唯一 Revision Key |

确认条件：Revision 缺失、重复、可变或无法回算时，该记录不得自动判定为复检，必须进入 Exception Queue。

## 3. Deduplication Policy

推荐候选规则：

1. 先按 `requestId + approvedRevisionKey` 识别 Revision。
2. 同一 request 在统计窗口内只要存在至少一个有效复检 Revision，分子计数为 1。
3. 同一 Revision 的重试、重复提交和重复执行只计 1 次。
4. 一个 request 不因多次复检而在分子中重复计数。
5. 无法解析 Revision Key 的记录不进入自动分子，进入 Exception Queue。

业务负责人必须确认：跨统计窗口的复检归属窗口、Revision 回退/修订处理，以及重复事件的最终保留记录。

## 4. Zero Denominator Policy

候选规则：当 eligible inspection request 分母为 0 时，Canonical Metric Result 返回 `NULL`。

禁止返回 `0%` 或 `100%`，禁止把无分母解释为“没有复检”。展示层可显示 `N/A`，但不得改变底层结果。

该规则仍需业务负责人确认后才能进入正式 Policy Evidence。

## 5. Historical Calculation Rule

历史回算只处理满足以下条件的 request：

- request 在统计窗口内已完成有效检验；
- request 非取消、非草稿、非 N/A；
- Revision Key 可稳定解析；
- 去重键可重复计算；
- 结果可由原始事实数据重建。

无法满足条件的记录：

- 不猜测是否为复检；
- 不自动纳入或排除；
- 写入 Exception Queue；
- 仅由业务负责人进行例外复核。

正常历史数据可由 Batch Backfill Job 批量处理，不逐条请求人工批准。

## 6. Human Decisions Required

1. 是否采用 Request-level 复检事件定义？
2. 是否确认 `requestId + revision` 为唯一 Revision Key？
3. Revision 缺失或不稳定时是否进入 Exception Queue？
4. 同一 request 多个有效 Revision 是否只计 1 个复检 request？
5. 同一 Revision 的重复提交/执行是否只计 1 次？
6. FAIL 后再次提交是否属于普通复检事件？
7. 跨窗口 Revision 的归属规则是什么？
8. 零分母是否返回 `NULL`？
9. 历史无法解析 Revision 的记录是否只进入人工例外队列？

## Decision State

```text
Decision: PENDING
Decision By: ______
Effective Date: ______
Decision Note: ______
```
