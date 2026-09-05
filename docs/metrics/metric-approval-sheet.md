# METRIC-GOVERNANCE-001 / PHASE-1.6

## Business Decision Approval Sheet

本表将 PHASE-1.5 的分析压缩为业务负责人可逐项回答的决策表。它不是 Registry Definition、Version 或批准记录；不改变任何计算、Dashboard、Report、Projection、DataScope，也不激活 Metric。

证据来源：

- `docs/metrics/metric-inventory.md`
- `docs/metrics/metric-conflict-report.md`
- `docs/metrics/metric-registry.md`
- `docs/metrics/metric-business-decisions.md`
- 首批指标对应的实现文件（各 Decision Card 中列出）

统一约束：`Decision = PENDING`、`Confirmed Owner = —`、`Effective Date = —`、`Decision By = —`、`Decision Note = —`。`Recommended Option` 仅为 `RECOMMENDED_NOT_APPROVED`，不构成业务批准。

## 1. Approval Matrix

| Metric Code | Business Name | Business Question | Option A | Option B | Option C | Recommended Option | Recommendation Reason | Impact | Suggested Owner | Decision | Confirmed Owner | Effective Date | Decision By | Decision Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BM-PASS-RATE | 合格率主族 | 管理层要看首次通过、最终通过，还是一个混合率？ | 首次有效检验通过数 / 首次有效检验总数 | 最终结论通过数 / 已完成最终判定总数 | 保留一个显示名但同时混合两者 | A+B 拆分为 proposed codes | 当前 `pass-rate.ts`、NC 汇总、projection 三条链路事实源不同；拆分可稳定回算并避免复检掩盖首过损失 | 报表、Dashboard、趋势、projection | 品质部 | PENDING | — | — | — | — |
| BM-QUALITY-LOSS-TREND | 质量损失趋势 | 期间损失应表达发生总额、净损失还是追偿？ | Gross Loss：纳入来源的发生金额 | Net Loss：Gross 减已确认追偿 | Claim Recovery：已确认回收额 | A+B+C 拆分；趋势仅作为各自时间序列 | `quality_loss_index`、领域事实和售后净额语义不同；拆分可避免重复相加，且索引延迟可单独治理 | 损失看板、周/月报、财务对账、历史趋势 | 财务/品质联合 | PENDING | — | — | — | — |
| BM-PROBLEM-CLOSURE-RATE | 问题结案率 | 结案率按本期新增问题还是当前存量计算？ | 本期新增问题中已关闭 | 期末应关闭/存量问题中已关闭 | 截止期限前关闭 | A+B 拆分；C 另建 on-time code | 报告使用新增/关闭，NC 页面使用存量；跨期和 deadline 不能混在一个百分比 | 周/月报、NC 看板、责任考核 | 品质部 | PENDING | — | — | — | — |
| BM-AFTER-SALES-NET-LOSS | 售后净损失 | 售后成本扣除哪类已确认追偿？ | `materialCost + laborTravelCost - actualClaim` | 仅财务确认成本与回收入账 | 按关闭日/确认日归属而非发生日 | A，且确认时间归属规则 | 当前实现已形成 gross-recovered 关系；成本、追偿、撤销和时间归属仍需制度确认 | 售后分析、周/月报、损失汇总 | 售后/财务 | PENDING | — | — | — | — |
| BM-SUPPLIER-FINAL-SCORE | 供应商最终质量评分 | 普通供应商与驻厂外协是否使用同一政策？ | 两套独立、可版本化 Policy | 统一一套扣分/阈值政策 | 先统一结果展示，模型仍隐含不同 | A | 代码已明确双模型；强行合并会破坏历史可比性，算法钳制可统一但业务扣分不能臆定 | 供应商等级、冻结、预警、快照横比 | 供应链/品质 | PENDING | — | — | — | — |
| BM-REINSPECTION-RATE | 复检率 | 什么事件算一次复检，按什么对象去重？ | Request-level：同一报检任务再次提交/执行 | Object-level：同一检验对象第二次检验 | Failure-driven：FAIL 后再次提交 | A（若 request revision 稳定）；否则 B | 现有 stats 以请求统计为主，request scope 最易审计；必须先锁定 revision/对象键和空分母 | 检验 Dashboard、供应商/部门卡片、趋势 | 品质部 | PENDING | — | — | — | — |
| BM-WORK-ORDER-INSPECTION-COMPLETION | 工单检验完成率 | 工单“完成”应表示点位执行、数量覆盖、请求关闭还是最终合格？ | Inspection Point Completion | Quantity Coverage | Request Closure；Final Pass 作为独立质量指标 | 拆为 A、B，C/D 不并入完成率 | 真实实现同时返回 planned/inspected points 与 process quantity；四种问题回答不同，合并会误导生产进度 | 工作台、工单过程卡、检验执行管理 | 项目管理/品质 | PENDING | — | — | — | — |
| BM-VEHICLE-FAILURE-INTENSITY | 车辆故障强度 | 故障强度的 exposure 是平均保修车辆数，还是里程/工时？ | 故障数 / 平均保修车辆数 | 故障数 / 运行小时、里程或调试次数 | 只发布 Failure Count，不称 rate/intensity | C；B 需先补齐可靠 exposure | 当前只有车辆数和人工月度覆盖，不能伪造运行 exposure；DataScope 缺口也不能由 Registry 绕过 | 车辆 Dashboard、质量报告、人工覆盖审计 | 技术/售后 | PENDING | — | — | — | — |
| BM-ARCHIVE-TIMELINESS | 归档及时率 | 哪些归档任务进入分母、从何时开始计时？ | 模板已生成任务；完成时间与 dueAt 比较 | 应生成但模板缺失也入分母 | 仅按自然日/工作日之一计算 | A，时钟/日历需制度确认 | 当前 `inspection_archive_tasks.status/dueAt` 可实施；required population、模板缺失、补归档规则必须人工批准 | 日报、归档提醒、文控检查 | 品质文控 | PENDING | — | — | — | — |
| BM-DFMEA-RPN-RISK | DFMEA RPN 风险统计 | 数值 RPN 与风险等级是否分开治理？ | 一个指标同时返回平均/最大/Risk Band | RPN Value 与 Risk Band 两个指标 | 只发布 Risk Band 计数 | B | 乘法数值是算法，50/100 等阈值是业务政策；拆分便于阈值版本化和历史回算 | DFMEA 项目统计、风险看板、整改触发 | 工程/品质 | PENDING | — | — | — | — |

## 2. Proposed Metric Split Matrix

以下仅提出 proposed code，不创建 Registry Definition 或 Version。

| 混合概念 | Proposed Metric Code | 建议含义 | 仍需业务批准 |
| --- | --- | --- | --- |
| PASS RATE | BM-FIRST-PASS-YIELD | 首次有效检验通过数 / 首次有效检验总数 | 首次事件、分母、复检/返修/取消排除 |
| PASS RATE | BM-FINAL-PASS-RATE | 最终判定通过数 / 已完成最终判定总数 | 最终结论、返修后的记录关系 |
| QUALITY LOSS | BM-QUALITY-LOSS-GROSS | 约定来源的发生损失总额 | 来源互斥、撤销/冲销、索引延迟 |
| QUALITY LOSS | BM-QUALITY-LOSS-NET | Gross Loss 减已确认追偿 | 追偿确认时点、负追偿、归属期间 |
| QUALITY LOSS | BM-CLAIM-RECOVERY | 已确认实际追偿金额 | 申请额与回收额区别、回收日规则 |
| PROBLEM CLOSURE | BM-PROBLEM-CLOSURE-RATE | 约定问题集合中已关闭比例 | 新增窗口或存量窗口、零分母 |
| PROBLEM CLOSURE | BM-PROBLEM-ONTIME-CLOSURE-RATE | 截止期限前关闭比例 | deadline、工作日、重开规则 |
| WORK ORDER COMPLETION | BM-INSPECTION-POINT-COMPLETION | 已检验点位 / 计划检验点位 | 点位展开、重复点、N/A/取消 |
| WORK ORDER COMPLETION | BM-INSPECTION-QUANTITY-COVERAGE | 已检验数量 / 计划数量 | 数量来源、部分检验、零计划 |
| WORK ORDER COMPLETION | BM-INSPECTION-REQUEST-CLOSURE-RATE | 关闭请求 / 应检请求 | 请求状态与最终判定的边界 |
| WORK ORDER COMPLETION | BM-FINAL-PASS-RATE（复用上项 proposed code） | 工单范围最终通过率 | 不得与执行完成率混用 |
| DFMEA RPN | BM-DFMEA-RPN-VALUE | RPN 数值（平均/最大可为派生视图） | 空值、废止项、精度 |
| DFMEA RPN | BM-DFMEA-RISK-BAND | 按批准阈值分桶 | 阈值、生效日、整改触发 |
| VEHICLE FAILURE | BM-VEHICLE-FAILURE-COUNT | 车辆故障事件数 | 事件去重与保修范围 |

## 3. Recommended Canonical Definitions（未批准）

| Proposed Code | Recommended Definition | Event / Deduplication | Numerator | Denominator | Scope / History | Status |
| --- | --- | --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD | 首次有效检验事件中通过的检验数量占首次有效检验数量 | 首次检验事件；按稳定 inspection/request revision 去重 | 首次结论 PASS 的有效数量 | 首次有效且有结论的检验数量 | 沿用 Analytics DataScope；历史需能识别首次关系 | RECOMMENDED_NOT_APPROVED |
| BM-FINAL-PASS-RATE | 每个检验对象最终有效判定为 PASS 的比例 | 对象最终结论；同一对象只取最终有效判定 | 最终 PASS 数量 | 已完成最终判定数量 | 不将复检次数重复计入；历史需有最终链 | RECOMMENDED_NOT_APPROVED |
| BM-GROSS-QUALITY-LOSS | 约定互斥来源在发生期间确认的损失金额 | loss record/source identity 去重 | 纳入来源金额之和 | — | 以统一索引为候选入口，待确认索引延迟 | RECOMMENDED_NOT_APPROVED |
| BM-NET-QUALITY-LOSS | Gross Loss 减实际确认追偿 | 追偿按确认事件去重 | Gross - confirmed recovery | — | 发生日/确认日需制度确认 | RECOMMENDED_NOT_APPROVED |
| BM-CLAIM-RECOVERY | 期间实际完成的追偿金额 | recovery transaction 去重 | 实际回收金额 | — | 不能用申请金额替代 | RECOMMENDED_NOT_APPROVED |
| BM-PROBLEM-CLOSURE-RATE | 约定问题集合中已关闭问题的比例 | problem ID 去重；跨期规则固定 | 已关闭问题数 | 约定问题集合数 | 建议按新增窗口另建 cohort | RECOMMENDED_NOT_APPROVED |
| BM-PROBLEM-ONTIME-CLOSURE-RATE | 在批准 deadline 前关闭的问题比例 | problem ID + deadline 版本 | deadline 前关闭数 | 应在窗口内关闭的问题数 | 工作日/自然日需制度确认 | RECOMMENDED_NOT_APPROVED |
| BM-INSPECTION-POINT-COMPLETION | 已执行的有效检验点占计划有效点 | requirement point identity 去重 | 已执行点位数 | 计划有效点位数 | 排除取消/N/A；零分母返回 N/A 候选 | RECOMMENDED_NOT_APPROVED |
| BM-INSPECTION-QUANTITY-COVERAGE | 已检验数量占计划数量 | work order + part + process + quantity batch | 已检验数量（按批准部分检验规则） | 计划数量 | 不表示请求关闭或 PASS | RECOMMENDED_NOT_APPROVED |
| BM-REINSPECTION-RATE | 发生批准复检事件的已检验任务比例 | 推荐 request-level revision key；一任务计一次 | 去重后的复检任务数 | eligible 已完成检验任务数 | 取消/未结论排除；零分母 N/A 候选 | RECOMMENDED_NOT_APPROVED |
| BM-ARCHIVE-TIMELINESS | required archive task 在 deadline 前完成的比例 | archive task ID 去重 | `completedAt <= dueAt` 的任务数 | 约定 required population | 推荐模板已生成任务先纳入；缺模板政策待定 | RECOMMENDED_NOT_APPROVED |
| BM-DFMEA-RPN-VALUE | `Severity × Occurrence × Detection` 的 RPN 数值 | DFMEA item ID 去重 | RPN 值（平均/最大为聚合） | item count（平均值） | 排除空/废止项待批准 | RECOMMENDED_NOT_APPROVED |
| BM-DFMEA-RISK-BAND | 按版本化阈值把 RPN 分为风险等级 | DFMEA item ID + threshold version | 各等级 item 数 | 适用 DFMEA item 数 | 当前 50/100 仅为实现现状，不是批准政策 | RECOMMENDED_NOT_APPROVED |

## 4. Decision Cards

### A. Supplier Score

证据：`apps/backend/modules/supplier/supplier-scoring.ts`、`supplier-score-snapshot.service.ts`、前端 `ScoringRulesModal.vue`。

| 项目 | 普通供应商 | 驻厂外协 | 技术可统一 / 必须保留 Policy |
| --- | --- | --- | --- |
| 初始分 | 100 | 100 | 初始值可统一；是否批准为制度需确认 |
| A/B/C 扣分 | 15 / 5 / 1 | 12 / 4 / 0.5，未分类另 0.5 | 必须保留不同 Policy，除非业务批准统一 |
| 入厂失败 | 每次 3 分 | 不使用，入厂分固定 100 | 必须保留不同 Policy |
| 开放问题 | 不适用 | 每个 2 分 | 必须保留不同 Policy |
| 重大损失/连续问题冻结 | 代码均使用 80,000、3 次等常量 | 同一冻结触发 | 可统一算法结构；阈值仍属 Policy |
| 等级 | A≥90、B≥80、C≥65、D<65 | 当前同一等级带 | 可统一展示；生效日和历史版本需批准 |
| 钳制/四舍五入 | `clamp(0,100)`、整数四舍五入 | 相同 | 可技术统一，属于算法约束 |

推荐：`BM-SUPPLIER-FINAL-SCORE` 保留两套可版本化 Policy（普通 `SUPPLIER_V4`、驻厂外协 `IN_HOUSE_OUTSOURCING_V4`），共享输出结构、钳制和审计字段。权重、扣分、阈值、等级、冻结和历史比较必须由供应链/品质批准；代码未发现 40%/30%/30% 权重证据，不补填。

### B. Reinspection Rate

证据：`apps/backend/modules/inspection/inspection-request-stats-identity.ts#createReinspectionRows`、`inspection-request-stats.service.ts`、Dashboard 复检展示。

| 选项 | Event definition | Deduplication key | Numerator | Denominator |
| --- | --- | --- | --- | --- |
| A（推荐） | 同一 inspection request 的第二次及以后有效提交/执行 | `requestId + revision`，聚合到 `requestId` 后一任务一次 | 发生至少一次复检的 eligible request 数 | 期间已完成且有有效结论的 request 数 |
| B | 同一检验对象第二次有效检验 | 稳定 `objectId`（需业务确认） | 发生复检的 object 数 | 期间完成检验的 eligible object 数 |
| C | FAIL 后重新提交/执行 | `requestId + failure cycle` | FAIL 后发生复检的 request 数 | 期间出现 FAIL 的 eligible request 数 |

推荐 A：请求级最接近当前统计链路，避免一个请求多次复检把分子膨胀。取消、草稿、无结论记录排除；零分母建议返回 N/A/null，而不是 0% 或 100%。A/B/C 只能由业务选一项。

### C. Work-order Inspection Completion

当前 `work-order-aggregate.service.ts` 同时计算计划/已检点位和过程数量；不能继续用一个 KPI 表达四种问题。

| 指标 | 回答的问题 | 推荐公式 | 不应解释为 |
| --- | --- | --- | --- |
| BM-INSPECTION-POINT-COMPLETION | 计划检验点执行了多少 | 有效已检点位 / 有效计划点位 | 生产数量完成、最终合格 |
| BM-INSPECTION-QUANTITY-COVERAGE | 计划数量覆盖了多少 | 已检验数量 / 计划数量 | 点位执行、请求关闭 |
| BM-INSPECTION-REQUEST-CLOSURE-RATE | 应检请求关闭了多少 | CLOSED requests / eligible requests | PASS 结论 |
| BM-FINAL-PASS-RATE | 最终判定通过了多少 | final PASS / completed final judgment | 执行完成率 |

推荐体系：A、B 分别建立；C/D 作为独立 proposed metric，不并入“工单检验完成率”。取消项、N/A、重复点、部分数量和零分母必须在 Formula/Scope Policy 中单独批准。

### D. Archive Timeliness

证据：`apps/backend/modules/report/report-daily-summary.service.ts#buildArchiveStats`、`apps/backend/modules/inspection/inspection-archive-task.service.ts`、`inspection_archive_tasks.status/dueAt`。

| 决策维度 | Candidate 1 | Candidate 2 | 推荐（未批准） |
| --- | --- | --- | --- |
| Timer start | 检验完成 | 问题关闭/报告关闭 | 以系统已生成 archive task 的业务完成事件为起点；人工确认具体事件 |
| Deadline | 固定 24/48 小时 | 模板/业务类型配置 | 使用 task `dueAt`，由制度/模板生成 |
| Calendar | 自然日 | 工作日/节假日历 | 先沿用已计算 `dueAt`；公司必须批准日历 |
| Required population | 模板已生成任务 | 应生成但模板缺失也计入 | 推荐先纳入模板已生成且非取消/N/A 任务；缺模板另列治理缺口 |
| Late definition | `completedAt > dueAt` | 截止时未完成即逾期，补归档仍 late | `completedAt <= dueAt` 才 timely；补归档不抹除逾期事实 |
| Denominator zero | 0% | 100% | N/A/null，避免无任务伪造满分 |

公司制度必须人工批准：timer start、24/48 小时或模板 deadline、自然日/工作日、缺模板是否入分母、取消/N/A、补归档是否恢复及时率。

## 5. Suggested Owner Matrix

Owner 指对业务定义、政策和生效版本负责的人/部门，不是代码模块归属。

| Metric | Suggested Business Owner | Supporting Departments | Reason | Confirmation Required |
| --- | --- | --- | --- | --- |
| BM-FIRST-PASS-YIELD / BM-FINAL-PASS-RATE | 品质部 | 检验、生产、数据治理 | 负责检验事实、结论和质量解释 | 确认一次/最终口径及责任岗位 |
| BM-GROSS-QUALITY-LOSS / BM-NET-QUALITY-LOSS / BM-CLAIM-RECOVERY | 财务与品质联合 | 售后、采购、质量损失 | 同时涉及金额确认、责任归属和追偿 | 确认财务确认主体与时间归属 |
| BM-PROBLEM-CLOSURE-RATE / BM-PROBLEM-ONTIME-CLOSURE-RATE | 品质部 | 责任部门、品质委员会 | 负责 NC 闭环制度和时限 | 确认新增/存量及 deadline 制度 |
| BM-AFTER-SALES-NET-LOSS | 售后/财务 | 品质、供应链 | 成本与回收均来自售后经营事实 | 确认成本、追偿及撤销规则 |
| BM-SUPPLIER-FINAL-SCORE | 供应链/品质 | 采购、售后、检验 | 供应商评价政策跨质量与采购 | 确认普通/外协 Policy Owner |
| BM-REINSPECTION-RATE | 品质部 | 检验、生产 | 负责复检触发和检验流程 | 确认事件定义、去重键、分母 |
| BM-INSPECTION-POINT-COMPLETION / BM-INSPECTION-QUANTITY-COVERAGE | 项目管理/品质联合 | 生产、检验、计划 | 分别负责计划点位与数量执行 | 确认点位/数量责任边界 |
| BM-VEHICLE-FAILURE-COUNT / BM-VEHICLE-FAILURE-INTENSITY | 技术/售后 | 车辆调试、数据治理 | 负责故障事实与 exposure 数据 | 确认 exposure、人工覆盖和 DataScope |
| BM-ARCHIVE-TIMELINESS | 品质文控 | 检验、IT、各业务部门 | 负责归档制度、模板和时限 | 确认 deadline、日历、required population |
| BM-DFMEA-RPN-VALUE / BM-DFMEA-RISK-BAND | 工程/品质 | 研发、项目管理 | 负责 DFMEA 风险算法应用和整改阈值 | 确认阈值、生效日、整改触发 |

## 6. PHASE-2 Readiness Gate

对每一个拟迁移的 Canonical Metric，以下条件必须全部为真：

| Gate | Required evidence |
| --- | --- |
| Decision | `APPROVED`，不能是 `PENDING` / `SPLIT_REQUIRED` |
| Owner | `Confirmed Owner` 已由业务负责人确认，不能使用 Suggested Owner |
| Formula | Formula 已批准并写入正式 Definition Version |
| Scope Policy | DataScope、来源、排除、权限范围已批准 |
| Effective Date | 非空，且对应批准版本 |
| Decision By | 非空，可追溯到业务决策人/记录 |
| History | 历史数据可计算性、回算窗口和缺失数据处理已确认 |

逻辑：`PHASE2_READY = Decision=APPROVED AND Owner=CONFIRMED AND Formula=APPROVED AND ScopePolicy=APPROVED AND EffectiveDate!=null AND DecisionBy!=null AND HistoricalComputability=CONFIRMED`。

任一条件不满足即 `PHASE2_READY = false`，禁止消费者迁移、Projection 绑定、Metric 激活或新 Version 创建。本阶段全部为 `false`。

## 7. HUMAN DECISIONS REQUIRED

以下问题可直接回答，`YES/NO` 或填写选项即可；推荐不等于批准。

1. Q1：一次合格率是否定义为“首次有效检验 PASS 数 / 首次有效检验总数”？推荐：YES。Decision: **\_\_**
2. Q2：是否另建最终合格率，定义为“最终 PASS 数 / 已完成最终判定总数”？推荐：YES。Decision: **\_\_**
3. Q3：质量损失是否拆为 Gross、Net、Claim Recovery 三个指标？推荐：YES。Decision: **\_\_**
4. Q4：问题结案率采用“本期新增”还是“当前存量”？推荐：新增与存量拆分。Decision: **\_\_**
5. Q5：普通供应商与驻厂外协是否保留两套可版本化评分 Policy？推荐：YES。Decision: **\_\_**
6. Q6：复检率是否采用 request-level 事件、`requestId + revision` 去重？推荐：YES。Decision: **\_\_**
7. Q7：工单完成是否拆为 Inspection Point Completion 与 Quantity Coverage，并独立展示 Request Closure/Final Pass？推荐：YES。Decision: **\_\_**
8. Q8：在可靠运行小时/里程 exposure 建立前，车辆指标是否只发布 Failure Count？推荐：YES。Decision: **\_\_**
9. Q9：归档及时率是否只将已生成且非取消/N/A 的 archive task 纳入分母？推荐：YES。Decision: **\_\_**
10. Q10：归档 deadline 是否以 task `dueAt` 为准，并由制度确认自然日/工作日？推荐：YES。Decision: **\_\_**
11. Q11：DFMEA 是否拆分 RPN Value 与 Risk Band？推荐：YES。Decision: **\_\_**
12. Q12：DFMEA 当前 50/100 风险阈值是否批准为正式 Policy？推荐：NO，先确认标准和生效日。Decision: **\_\_**
13. Q13：是否确认首批指标的 Suggested Business Owner，并填写 Confirmed Owner？推荐：逐项确认。Decision: **\_\_**
14. Q14：上述批准是否允许进入 PHASE-2 前，先完成历史可计算性和 DataScope 复核？推荐：YES。Decision: **\_\_**

## 8. Phase Boundary

## 9. Final Human Decision Record（PHASE-1.6B）

以下记录是业务负责人提供的 Approval Evidence。Decision By 仅记录为 Human Business Approval，不伪造个人姓名、账号或组织签名。该记录不改变 Registry Definition、Version、Owner ID、Effective Date 或生产消费者。

| decisionId | metric | decisionStatus | approvedOption | approvedDefinition | decisionSource | decisionNote |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | BM-PASS-RATE | APPROVED | Split | 拆分为 BM-FIRST-PASS-YIELD 与 BM-FINAL-PASS-RATE | Human Business Approval | 原混合指标不再作为唯一 canonical 语义 |
| D02 | BM-FINAL-PASS-RATE | APPROVED | Independent Metric | 建立独立最终合格率 | Human Business Approval | 与首次合格率分离 |
| D03 | QUALITY LOSS | APPROVED | Split | 建立 BM-GROSS-QUALITY-LOSS、BM-NET-QUALITY-LOSS、BM-CLAIM-RECOVERY | Human Business Approval | Gross、Net、Recovery 分离治理 |
| D04 | PROBLEM CLOSURE | APPROVED | Split | 建立 BM-PROBLEM-CLOSURE-RATE 与 BM-PROBLEM-ONTIME-CLOSURE-RATE | Human Business Approval | 结案率与按期结案率不混用 |
| D05 | BM-SUPPLIER-FINAL-SCORE | APPROVED | Unified Concept + Dual Policy | 统一指标概念；保留 STANDARD_SUPPLIER_SCORE_POLICY 与 RESIDENT_OUTSOURCING_SCORE_POLICY | Human Business Approval | 两套 Policy 不硬合 |
| D06 | BM-REINSPECTION-RATE | APPROVED_WITH_POLICY_PENDING | Request-level priority | 优先 Request-level；若 request revision 无法稳定识别，不自动选择其他方案 | Human Business Approval | revision 稳定性仍待确认 |
| D07 | WORK ORDER INSPECTION COMPLETION | APPROVED | Split | 建立 BM-INSPECTION-POINT-COMPLETION 与 BM-INSPECTION-QUANTITY-COVERAGE；Request Closure / Final Pass 不并入 completion | Human Business Approval | 四种概念分离 |
| D08 | VEHICLE FAILURE | APPROVED | Count only | 当前发布 BM-VEHICLE-FAILURE-COUNT，不宣称 Failure Rate / Intensity | Human Business Approval | 不自造 exposure denominator |
| D09 | BM-ARCHIVE-TIMELINESS | APPROVED | Required population | 分母仅为模板已生成且非取消/N/A 任务 | Human Business Approval | 缺模板项目不自动纳入 |
| D10 | BM-ARCHIVE-TIMELINESS | APPROVED_WITH_POLICY_PENDING | task dueAt | 使用 task dueAt；日历规则另行作为 Policy | Human Business Approval | 自然日/工作日仍待确认 |
| D11 | DFMEA | APPROVED | Split | 建立 BM-DFMEA-RPN-VALUE 与 BM-DFMEA-RISK-BAND | Human Business Approval | RPN 与风险等级分离 |
| D12 | BM-DFMEA-RISK-BAND | APPROVED_WITH_POLICY_PENDING | Threshold pending | 暂不批准 Risk Band 阈值 | Human Business Approval | 阈值不得写入 RPN 定义 |
| D13 | OWNER MATRIX | APPROVED | Suggested owner responsibility | 使用当前 Suggested Business Owner；联合责任保持联合；不强制唯一 ownerDept；UNKNOWN Policy/Data Owner 保持 UNKNOWN | Human Business Approval | 不写入 ownerDeptId |
| D14 | PHASE-2 GATE | APPROVED | Mandatory pre-checks | 进入 PHASE-2 前必须完成历史可计算性验证与 DataScope 验证 | Human Business Approval | 不代表已开始 PHASE-2 |

Decision By: Human Business Approval Decision timestamp / record: 2026-08-21，依据本阶段人工批准记录 Effective Date: 未在本阶段批准，仍为 PENDING Confirmed Owner: 依 D13 记录为 Suggested Business Owner responsibility；具体 ownerDeptId 未写入

本文件完成 PHASE-1.6 的决策准备，不进入 PHASE-2；未批准任何 Metric、Owner、Definition Version 或消费者迁移。所有首批 Registry 记录继续保持 `DRAFT / v1 / PENDING`。
