# METRIC-GOVERNANCE-001 / PHASE-1.5

## Canonical Metric Business Decision Preparation

本文件是首批指标的业务决策包，不是批准记录。所有条目初始为 `PENDING`，不改变 Registry 状态；首批 10 个指标仍为 `DRAFT / v1`。本阶段不修改业务计算代码、Dashboard、Report、Projection 或 DataScope。

## 1. Decision Status 约定

| 状态             | 含义                                             |
| ---------------- | ------------------------------------------------ |
| `PENDING`        | 等待业务负责人确认                               |
| `APPROVED`       | 已有明确制度或正式决策证据                       |
| `REJECTED`       | 决策明确否决该候选                               |
| `SPLIT_REQUIRED` | 一个显示名混合多个业务概念，必须拆分 Metric Code |

本阶段所有决策状态均为 `PENDING`；`Approved Formula`、`Approved Owner`、`Effective Date`、`Decision By`、`Decision Note` 均留空。

## 2. Business Decision Required Matrix

| Metric Code | 当前状态 | 主要争议 | 建议处置 |
| --- | --- | --- | --- |
| `BM-PASS-RATE` | BUSINESS_DECISION_REQUIRED | 事实检验、问题汇总、身份投影、趋势空周期的分母和排除条件不同 | `SPLIT_REQUIRED`：至少拆 First Pass Yield 与 Final Pass Rate |
| `BM-QUALITY-LOSS-TREND` | BUSINESS_DECISION_REQUIRED | 原始质量损失、索引、售后损失、追偿金额的财务含义不同 | `SPLIT_REQUIRED`：Gross Loss、Net Loss、Claim Recovery |
| `BM-PROBLEM-CLOSURE-RATE` | BUSINESS_DECISION_REQUIRED | 本期新增、全部存量、关闭事件、按期关闭混用 | `SPLIT_REQUIRED`：Closure Rate 与 On-time Closure Rate |
| `BM-SUPPLIER-FINAL-SCORE` | BUSINESS_DECISION_REQUIRED | 普通供应商与驻厂外协使用两套扣分模型和等级阈值 | 保留模型维度，等待政策批准 |
| `BM-WORK-ORDER-INSPECTION-COMPLETION` | BUSINESS_DECISION_REQUIRED | 点位完成率、数量覆盖率、请求关闭率和工单状态混用 | `SPLIT_REQUIRED` 或明确显示名 |
| `BM-VEHICLE-FAILURE-INTENSITY` | BUSINESS_DECISION_REQUIRED | 手工覆盖、自动故障数、保修车辆均可能作为来源或分母 | 先批准 exposure，再决定名称 |
| `BM-ARCHIVE-TIMELINESS` | BUSINESS_DECISION_REQUIRED | required 项、模板缺失、逾期和自然日/工作日未定义 | 先批准时钟与分母 |
| `BM-DFMEA-RPN-RISK` | BUSINESS_DECISION_REQUIRED | RPN 数值与风险分桶阈值混合 | `SPLIT_REQUIRED`：RPN Value 与 Risk Band |

`BM-AFTER-SALES-NET-LOSS` 与 `BM-REINSPECTION-RATE` 当前为 `CANONICAL_CANDIDATE`，仍保持 `PENDING`，不能因候选状态自动激活。

## 3. PASS RATE DECISION SHEET

**Metric Code**：`BM-PASS-RATE` **Metric Name**：Primary Inspection Pass Rate（当前显示名不足以区分一次/最终） **Current Consumers**：Dashboard、报告摘要、月度趋势、过程钻取、身份投影对账。

| 版本 | 当前实现位置 | 分子 | 分母 | 排除/时间 | 结果为何不同 |
| --- | --- | --- | --- | --- | --- |
| A | `apps/backend/modules/report/pass-rate-projection-query.service.ts` | `SUM(quantity - unqualifiedQuantity)` | `SUM(quantity)` | 随来源范围与投影代次；空总量返回 0 | 按数量加权，单批次大小会改变总体结果 |
| B | `apps/backend/modules/report/pass-rate-issue-summary.service.ts` | `totalQuantity - issueQuantity` | 检验总数量 | 问题数量受 NC 关联和裁剪影响 | 只反映问题汇总可见范围，未必等于原始检验结论 |
| C | `apps/backend/modules/report/pass-rate-trend.get.service.ts` | 同投影摘要 | 同投影摘要 | 无数据历史周期可能展示 `100` 或 `null` 的策略差异 | 趋势补点会把“没有样本”误读为“全部通过” |
| D | `apps/backend/modules/report/pass-rate.ts`、前端目标色逻辑 | 后端 `passRate`；前端另按 98/95 着色 | 后端结果 | 前端固定阈值与配置目标/共享默认目标不同 | 同一数值可能在不同页面显示不同状态 |

**Decision Questions**：

1. “一次合格率”是否定义为首次检验记录中 `PASS / 首次检验总数`？复检、返修、取消、无结论分别如何处理？
2. “最终合格率”是否另建 Code，分子为最终结论 PASS、分母为已完成最终判定记录？
3. 分母按批次数、检验数量还是检验点数量？
4. 无活动投影代次和无数据周期应返回 `0`、`null` 还是“不适用”？

**Suggested Candidate**：拆为 `BM-FIRST-PASS-YIELD` 与 `BM-FINAL-PASS-RATE`；当前不批准任何一个。

## 4. QUALITY LOSS DECISION SHEET

**Source Evidence**：`apps/backend/modules/quality-loss/quality-loss-summary.service.ts`、`quality-loss.service.ts`、`quality-loss-index`、`apps/backend/modules/after-sales/after-sales-integration.service.ts`、Report/Dashboard consumers。

| 概念 | 当前实现/字段 | 业务含义风险 |
| --- | --- | --- |
| Gross Loss | `quality_losses.amount`、部分售后成本合计 | 发生损失总额，不能自动等同财务确认损失 |
| Net Loss | `amount - actualClaim` 或售后 `grossCost - recovered` | 依赖追偿归属、状态和时间窗口 |
| Claim Recovery | `actualClaim` | 实际索赔/回收，不等于索赔申请金额 |
| Indexed Loss | `quality_loss_index` 物化结果 | 可能存在索引延迟、来源纳入条件和快照时点 |
| Dashboard/Report Total | 多源相加、前端或摘要组合 | 可能把内部、外部、售后、人工来源重复或混合 |

**Decision Questions**：来源是否互斥？`actualClaim` 按发生日、确认日还是回收日归属？取消、冲销、待追偿是否进入 Gross/Net？索引是否为管理报表唯一入口？

**Suggested Split**：`BM-GROSS-QUALITY-LOSS`、`BM-NET-QUALITY-LOSS`、`BM-CLAIM-RECOVERY`、`BM-QUALITY-LOSS-TREND`。当前 `BM-QUALITY-LOSS-TREND` 不应承载三种财务含义。

## 5. CLOSURE RATE DECISION SHEET

**Source Evidence**：`apps/backend/modules/report/report-summary.ts`、`apps/backend/modules/inspection/inspection-issue-stats.ts`。

| 版本 | 分子 | 分母 | 时间语义 | 影响 |
| --- | --- | --- | --- | --- |
| A Report closingRate | `closedIssues` | `newIssues` | 本期新增问题中已关闭数量 | 允许跨期关闭，但本期关闭可能不是本期新增 |
| B NC closedRate | `closedCount` | `totalCount` | 当前结果集存量 | 存量越大，历史已关闭问题改变比率 |
| C On-time closure candidate | 截止 deadline 前关闭 | 本期应关闭问题 | 需要 deadline 与工作日规则 | 关闭率高不代表及时率高 |

**Suggested Split**：`BM-PROBLEM-CLOSURE-RATE` 与 `BM-PROBLEM-ON-TIME-CLOSURE-RATE`。业务必须确认跨期关闭、零分母和截止日。

## 6. SUPPLIER SCORE POLICY TABLE

**Source**：`apps/backend/modules/supplier/supplier-scoring.ts`、`supplier-score-snapshot.service.ts`、前端 `ScoringRulesModal.vue`。

| 参数 | 普通供应商模型 | 驻厂外协模型 | 分类 |
| --- | --- | --- | --- |
| 初始分 | 100 | 100 | BUSINESS_POLICY |
| A/B/C 扣分 | 15 / 5 / 1 | 12 / 4 / 0.5，未分类问题另扣 0.5 | BUSINESS_POLICY |
| 入厂失败扣分 | 每次 3 | 不使用，入厂分固定 100 | BUSINESS_POLICY |
| 单次重大损失阈值 | 80,000 | 同一冻结条件 | BUSINESS_POLICY |
| 入厂预警阈值 | 合格率 < 90% 且批次 > 5 | 不适用 | BUSINESS_POLICY |
| 连续重大问题 | 3 次 | 3 次 | BUSINESS_POLICY |
| 开放问题扣分 | 不适用 | 每个开放问题 2 分 | BUSINESS_POLICY |
| 观察阈值 | 综合分 < 75，降级上限 70 | 开放问题达到 3 或规则触发，降级上限 85 | BUSINESS_POLICY |
| 等级区间 | A≥90、B≥80、C≥65、D<65 | 同代码等级区间 | BUSINESS_POLICY |
| `clamp(0,100)`、四舍五入 | 纯算法约束 | 纯算法约束 | ALGORITHM_CONSTANT |

不存在代码证据支持质量/交付/整改 `40%/30%/30%` 权重；这些不应由 AI 补齐。业务需决定模型是否并存、权重/扣分/阈值/生效日期/冻结规则，以及前端规则文案是否仅作说明。

## 7. REINSPECTION DEFINITION OPTIONS

**Source Evidence**：Inspection request/record stats、`qgs-shared` inspection contracts、Dashboard reinspection display。

| 选项 | 事件定义 | 需要确认 |
| --- | --- | --- |
| A Request-level | 同一 inspection request 再次提交/执行 | 是否以 request revision 识别 |
| B Object-level | 同一 inspection object 第二次检验 | object identity 是否稳定 |
| C Failure-driven | `inspectionResult=FAIL` 后重新提交 | FAIL 是否包含未结论/返修 |
| D Issue-linked | linkedIssue 触发的复检记录 | 一个问题多次复检如何计数 |

当前不能把页面分布占比当复检率。建议保留 `BM-REINSPECTION-RATE` 为候选，先批准事件定义、分子去重键、分母 eligible population 和空分母行为。

## 8. WORK-ORDER INSPECTION COMPLETION

**Source Evidence**：`apps/backend/modules/work-order/work-order-aggregate-identity.ts`、Work Order aggregate API、Inspection request stats。

| 选项 | 分子 | 分母 | 不同结果原因 |
| --- | --- | --- | --- |
| A 点位完成率 | 已检验点位 | 计划点位 | 点位数量受模板展开影响 |
| B 数量覆盖率 | 已检验数量 | 计划数量 | 大数量工单权重更高 |
| C 请求关闭率 | CLOSED inspection requests | 必检 requests | 请求状态不等于最终 PASS |
| D 最终合格率 | PASS 结果 | 已完成最终判定 | 质量结论不等于执行完成 |

工单 `COMPLETED` 只能是业务状态，不能直接作为检验完成。建议拆为 `BM-INSPECTION-POINT-COMPLETION`、`BM-INSPECTION-QUANTITY-COVERAGE`，并另设最终合格率。

## 9. VEHICLE FAILURE METRIC

**Source**：`apps/backend/modules/report/vehicle-failure-rate.service.ts` 与 manual service。

当前自动强度为：`issueCount / average warranty vehicle count × 100`；前端仍存在相同派生计算，且支持手工月度覆盖。代码未提供稳定的运行小时、里程或调试次数 exposure。

| 候选 | 分母 | 结论 |
| --- | --- | --- |
| Failure Count | 无分母，故障事件数 | 可立即定义，但不是 rate/intensity |
| Failure Intensity | 平均保修车辆数 | 仅在车辆暴露数据完整、手工覆盖优先级明确时成立 |
| Failure Rate | 运行小时/里程/调试次数 | 当前无可靠统一 exposure，不能伪造 |

建议暂时拆 `BM-VEHICLE-FAILURE-COUNT` 与 `BM-VEHICLE-FAILURE-INTENSITY`；后者保持 PENDING，先确认保修车辆分母及人工覆盖审批/回溯。

## 10. ARCHIVE TIMELINESS

**Source**：`apps/backend/modules/report/report-daily-summary.service.ts`、archive task services、`apps/web-antd/src/views/qms/reports/index.vue`。

当前实现近似 `archivedCount / requiredCount × 100`。但 `requiredCount`、模板缺失、取消项和 overdue 归属仍由实现上下文决定。

业务需确认：计时起点是检验完成、问题关闭还是报告关闭；deadline 是 24h、48h、自然日还是工作日；模板缺失是否进入分母；补归档是否恢复及时率；N/A/取消项如何处理。

## 11. DFMEA RPN / RISK BAND

**Source**：`packages/qgs-shared/src/modules/qms/planning.ts`、DFMEA planning services。

数学定义可表达为 `RPN = Severity × Occurrence × Detection`。当前争议是风险分桶与整改触发：例如 high `>100`、medium `50<RPN≤100`、low `≤50`，但阈值属于 BUSINESS_POLICY。

建议拆为：

- `BM-DFMEA-RPN-VALUE`：数值本身；
- `BM-DFMEA-RISK-BAND`：阈值、等级和整改触发。

## 12. Suggested Owner Matrix

以下均为建议，不写入 `ownerDeptId`，也不改变 `ownerStatus`：

| Metric | Suggested Owner | Reason | Decision Required |
| --- | --- | --- | --- |
| Pass Rate | 品质部 | 检验事实与质量结论 | 一次/最终口径及责任部门 |
| Quality Loss | 财务/品质联合 | 金额、追偿和责任归属 | 财务确认主体 |
| Problem Closure | 品质部 | NC/问题闭环 | 是否由品质委员会负责 |
| After-sales Net Loss | 售后/财务 | 售后成本与回收 | 成本确认责任 |
| Supplier Score | 供应链/品质 | 供应商质量与政策 | 普通/外协模型 Owner |
| Reinspection Rate | 品质部 | 检验复检流程 | 事件定义 Owner |
| Work-order Completion | 项目管理/品质 | 工单计划与检验执行 | 点位/数量责任边界 |
| Vehicle Failure | 技术/售后 | 车辆故障与暴露量 | exposure 数据 Owner |
| Archive Timeliness | 品质文控 | 归档与时效 | deadline 规则 Owner |
| DFMEA RPN/Risk Band | 工程/品质 | 风险分析与整改 | 阈值批准委员会 |

## 13. Decision Record Template

| Metric | Decision Status | Approved Formula | Approved Owner | Effective Date | Decision By | Decision Note |
| --- | --- | --- | --- | --- | --- | --- |
| 首批 10 项 | PENDING | — | — | — | — | 等待业务决策 |

## 14. Remaining PENDING Decisions

1. 合格率拆分及首次/最终检验定义。
2. Gross/Net/Recovery 的财务归属与来源互斥规则。
3. Closure 与 On-time Closure 的窗口、deadline 和跨期处理。
4. 供应商评分双模型、扣分、权重、等级和冻结政策。
5. 复检事件键、去重规则和分母。
6. 工单检验完成的点位、数量、请求和最终 PASS 关系。
7. 车辆 exposure、手工覆盖优先级和回溯。
8. 归档起点、deadline、工作日和 required 分母。
9. DFMEA 风险阈值与整改触发。
10. 首批指标业务 Owner 和生效日期。

## 15. PHASE-2 Readiness

## 16. Decision Finalized（PHASE-1.6B）

14 条人工决策已由业务负责人确认，并记录于 docs/metrics/metric-approval-sheet.md §9。批准证据来源统一记为 Human Business Approval，不伪造个人姓名或账号。

- APPROVED：D01、D02、D03、D04、D05、D07、D08、D09、D11、D13、D14。
- APPROVED_WITH_POLICY_PENDING：D06（request revision 稳定识别）、D10（日历规则）、D12（Risk Band 阈值）。
- D13 仅确认 Suggested Business Owner 作为业务责任归属，不写入 ownerDeptId；UNKNOWN Policy Owner/Data Owner 保持 UNKNOWN。
- D14 的历史可计算性和 DataScope 验证是 PHASE-2 前置条件，不代表已开始消费者迁移。

本次 Finalization 只形成 Approval Evidence；不修改 Registry 数据、不创建 Version、不激活 Metric、不修改业务计算或消费者。

当前**不具备直接进入 Dashboard/Projection 迁移的条件**。只有当上述决策项获得业务批准、Owner 确认、有效日期确定，并通过正式 Definition Version/Audit 流程后，才具备进入 PHASE-2 的条件。当前 Registry 保持首批 10 项 `DRAFT / v1`，未执行 `ACTIVATE`、`DEPRECATE` 或 `NEW_VERSION`。
