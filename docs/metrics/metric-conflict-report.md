# METRIC-GOVERNANCE-001 / PHASE-0

## Metric Conflict Report（指标冲突报告）

扫描日期：2026-08-21。本文只报告事实、风险和建议，不修改任何代码、Schema 或 migration。

## 1. 统计结论

| 项目 | 结果 |
| --- | --: |
| Metric Inventory 资产总数 | **65**（A 21 / B 30 / C 7 / D 7） |
| 已在 `apps/backend/utils/metrics-registry.ts` 登记 | **41** |
| PHASE-0 新识别/拆分资产 | **24** |
| 重复/多处实现的指标族 | **15** |
| 明确的高风险口径冲突 | **9** |
| 硬编码权重/阈值命中 | **2 个评分模型、12 个阈值/扣分常量** |
| 缺少业务定义或定义不完整 | **至少 15** |
| Owner 为 UNKNOWN（业务责任人；模块名仅为技术归属） | **65** |
| Version 为 GAP（无生效版本/日期） | **至少 61** |

“重复指标数量”按指标族计数：同一业务含义在两个以上 Calculation Location 计算，或同一返回字段在 Dashboard/Report/前端再次派生；不是按文本命中次数统计。

## 2. 高风险口径冲突

### C-01 / P1：合格率存在三套源和四个实现层

- `pass-rate.ts` 的检验源口径：`quantity - unqualifiedQuantity` 钳制后求和。
- `pass-rate-issue-summary.service.ts` 的问题源口径：`MIN(inspections.quantity, quality_records.quantity)` 再计算。
- `pass-rate-projection-query.service.ts` 的投影口径：按身份投影表的 `passCount/totalCount`，可回退 legacy。
- `dashboard.service.ts#getMonthlyTrend` 又对月度点重新累加并计算百分比；`PassRateTrendChart` 只消费结果。

风险：同一期间在 Dashboard、报表和下钻页可能因为 source、窗口、分母或投影代次不同而显示不同值。已有 projection shadow reconciliation 只覆盖部分路径，尚未形成全消费者契约。

证据：`apps/backend/modules/report/pass-rate*.ts`、`apps/backend/modules/report/pass-rate-projection-query.service.ts`、`apps/backend/modules/dashboard/dashboard.service.ts:259-289`。

### C-02 / P1：质量损失存在索引口径与旧列表/汇总口径并存

- 统一出口 `quality_loss_index` 的趋势/钻取/列表口径是 `lossAmount > 0 OR isClaim = true`。
- `QualityLossSummaryService` 仍接收列表后在内存 `reduce` `amount` 与 `actualClaim`，并依据状态计算 pending amount。
- 报表内部损失还将 `quality_records.lossAmount` 与 `quality_losses.amount` 相加；Dashboard 概览另合并售后、检验、调试和手工结果。

风险：索引刷新延迟、四源纳入条件和状态过滤可能导致看板总额、损失页 KPI、报表 internalLoss/externalLoss 不一致。

证据：`apps/backend/modules/quality-loss/quality-loss-summary.service.ts:14-57`、`apps/backend/modules/report/report-summary.service.ts:184-192`、`apps/backend/modules/dashboard/dashboard.service.ts:181-190`。

### C-03 / P1：供应商评分是两个硬编码模型，不是可审计的版本化公式

- 普通供应商模型：A/B/C 工程与售后问题分别扣 `15/5/1`，来料失败每批扣 `3`。
- 驻厂/外协模型：A/B/C 扣 `12/4/0.5`，未分类问题再扣 `0.5`，开放问题每项扣 `2`。
- 另有阈值 `5000`（A 类损失）、`80000`（冻结）、`75`（预警）、`90`（来料预警）、连续 `3` 次和最少 `3` 个问题。
- 快照写入 `SUPPLIER_V4` / `IN_HOUSE_OUTSOURCING_V4`，但 registry 没有权重表、版本生效日期、审批人或公式 hash。

风险：不同模型不可直接横向比较；修改常量会改变历史分数但没有回溯版本；“最终质量评分”“进料合格率”“工程分”“售后分”容易被前端当成同一评分。

证据：`apps/backend/modules/supplier/supplier-scoring.ts:7-12,94-179,220-292`。

### C-04 / P1：问题结案率分子/分母与时间字段未统一

`report-summary.service.ts` 使用 `closedIssues/newIssues`，两者都以 `quality_records.createdAt` 窗口过滤，关闭只是在新增集合上加 `status=CLOSED`；而 Dashboard 的 open issue 使用当前 `status=OPEN`，日报问题路径同时纳入“期间新增、期间关闭、仍未关闭”。

风险：结案率可能大于 100% 的业务语义被隐藏，跨期关闭不计入，Dashboard open count 与 Report closingRate 不是互补关系。

证据：`apps/backend/modules/report/report-summary.service.ts:173-183`、`apps/backend/modules/inspection/inspection-reporting.service.ts:74-136,273-311`。

### C-05 / P1：复检率在后端和前端存在不同的分母/展示派生

后端定义为 `reinspectionCount / inspectedCount`；前端 detail drawer 还计算团队/供应商占比 `row.count / total`，并同时展示 `reinspectionRate`。

风险：用户可能把“报检分布占比”和“复检率”混为一谈；空分母=0 的处理也未在共享契约声明。

证据：`apps/backend/modules/inspection/inspection-request-stats-identity.ts:103-131`、`apps/web-antd/src/views/qms/inspection/dashboard/components/InspectionDashboardDetailDrawer.vue:102-173`。

### C-06 / P1：工单完成率同名字段有至少两条计算路径

后端 `WorkOrderAggregateService` 以计划点为分母并对已检点做 `min` 钳制；共享 DTO 暴露 `byPart`、`byProcess`、`summary` 三处 `completionRate`。前端工作台只展示后端值，但生产过程卡片另外以 `completedQuantity/totalQuantity` 表示完成状态。

风险：点位完成率、数量完成率和要求执行率被同一 UI 语义称为“完成率”，不可直接比较。

证据：`apps/backend/modules/work-order/work-order-aggregate.service.ts:339-351`、`packages/qgs-shared/src/modules/qms/work-order.ts:109-206`。

### C-07 / P1：车辆故障率同时接受自动数据和人工覆盖

自动数据从 `vehicle_commissioning_issues` 聚合，人工值存入 `system_settings` 并替换月度序列；排名百分比又以当前结果集为分母，年度强度使用平均保修车辆数。

风险：同一月份可能出现自动、手工、强度三种“故障率”；人工覆盖无审批、版本、来源原因字段。

证据：`apps/backend/modules/report/vehicle-failure-rate.service.ts:192-206,343-366`、`vehicle-failure-rate-manual.service.ts`。

### C-08 / P1：工序目标配置、状态色和 Registry 来源三方不一致

- `metrics-registry.ts` 将 M-F04 来源写为 `dashboard_targets`，实际 `dashboard.service.ts` 和 targets route 读写 `system_settings.QMS_PASS_RATE_TARGETS`。
- 共享包默认工序目标为 `99.85/99.90` 等值；Dashboard 状态色却固定使用 `98/95`，没有比较 API 返回的 `targetPassRate`。
- 前端目标弹窗说明“影响颜色逻辑”，但当前逻辑并未消费该配置。

风险：目标配置的业务含义、存储来源和视觉判定不一致，用户可能看到“达标颜色”但实际低于配置目标。

证据：`apps/backend/utils/metrics-registry.ts` M-F04、`apps/backend/modules/dashboard/dashboard.service.ts:106-121`、`apps/web-antd/src/views/qms/dashboard/index.vue:49-56,440-451`、`apps/web-antd/src/views/qms/dashboard/components/PassRateTargetModal.vue:141-145`。

### C-09 / P1：NC 页面关闭率与报表结案率同名不同分母

- NC 页面使用 `closedCount / totalCount`。
- 报表使用 `closedIssues / newIssues`，且无新增时返回 `100`。
- 核心合格率空分母在其他函数返回 `0`，趋势 API 对无数据历史周期又可能显示 `100`。

风险：同一“关闭率/结案率”在 NC、报表和趋势页面不可比较；空数据被解释为满分会掩盖无样本。

证据：`apps/backend/modules/inspection/inspection-issue-stats.service.ts:151-154,225-233`、`apps/backend/modules/report/report-summary.service.ts:177-183`、`apps/backend/api/qms/pass-rate-trend.get.ts:139-148`。

## 3. 重复指标矩阵

| 指标族 | 计算/派生位置 | 重复类型 | 当前判断 |
| --- | --- | --- | --- |
| 合格率 | `report/pass-rate.ts`、`pass-rate-issue-summary.service.ts`、`pass-rate-projection-query.service.ts`、`dashboard.service.ts`、前端 DTO | 多源 + 多层重算 | **高风险**；A-01~A-04 |
| 质量损失金额 | `quality-loss.service.ts`、`quality-loss-summary.service.ts`、`quality-loss-reporting.service.ts`、`report-summary.service.ts`、`dashboard.service.ts` | 四源/索引/报表合并 | **高风险**；A-06~A-08/B-01~B-03 |
| 售后成本/损失 | `after-sales-analytics.service.ts`、`after-sales-integration.service.ts`、`report-summary.service.ts` | gross/net/recovered 多输出 | 需统一字段命名；A-09/A-10 |
| 问题关闭 | `inspection-reporting.service.ts`、`report-summary.service.ts`、日报服务、Dashboard open count | period close vs current open | **高风险**；A-17/B-11/B-12 |
| 缺陷 TOP | `inspection-report-statistics.service.ts`、`report-summary.service.ts`、Dashboard issue distribution、前端 TOP5 | 同一类别不同窗口/排序 | 需统一窗口和 topN；A-20/B-08/B-13 |
| 供应商评分 | `supplier-scoring.ts`、快照、列表 global stats、前端 supplier stats | V4 双模型/快照读 | **高风险**；A-12/A-13/B-15关联 |
| 复检率 | `inspection-request-stats-identity.ts`、merge service、前端 detail drawer | 后端率 + 前端占比 | **高风险**；B-22 |
| 工单完成 | `work-order-aggregate.service.ts`、shared DTO、前端生产进度 | 点位率 + 数量率 | **高风险**；B-14/B-23/B-24 |
| 监造进度 | shared `supervision-core.ts`、`SupervisionManagementView.vue` | 后端/前端同构计算 | 需要单一服务出口；B-25 |
| 车辆故障 | 自动聚合、人工设置、前端强度 | 覆盖值与展示派生 | **高风险**；A-05/D-01 |
| 趋势变化 | `report-summary.ts#calculateTrend`、各趋势 service、前端图表 | 业务趋势 vs presentation delta | 明确 D-03 非业务指标 |
| 文件/队列统计 | file storage service、metric-refresh/worker | 运行观测值 | 归 C 类，禁止混入经营 KPI |
| 工序目标/状态色 | shared target defaults、Dashboard API、Dashboard fixed 98/95 colors | 配置与展示阈值重复 | **高风险**；A-04/A-21/D-05 |
| 供应商评分规则 | backend `supplier-scoring.ts`、`ScoringRulesModal.vue` | 前端静态副本未覆盖外协模型 | **高风险**；A-12 |
| 报表总损失 | report API metrics array、`MonthlyReportContent.vue` | 前端按数组位置再合并 | 中高风险；D-06 |
| 日均报检量/排行占比 | inspection dashboard API、`InspectionDashboardDetailDrawer.vue` | 后端事实与前端 presentation ratio | 中风险；D-07 |

## 4. 硬编码权重与阈值

### 已确认的评分权重

| 位置 | 硬编码 | 影响 |
| --- | --- | --- |
| `supplier-scoring.ts#buildSupplierScore` | engineering/after-sales A/B/C = `15/5/1`；incoming failure=`3` | 普通供应商最终分、等级、冻结判断 |
| `supplier-scoring.ts#buildInHouseOutsourcingScore` | A/B/C=`12/4/0.5`；未分类=`0.5`；open issue=`2` | 驻厂/外协最终分、稳定分 |
| `supplier-scoring.ts` constants | `5000/80000/75/90/3/3/3` | 缺陷分类、预警、冻结和降级 |
| `welder-score.ts` | critical=`4`、major=`2`、other=`1`、max=`12` | 焊工分数 |
| `report-daily-summary.service.ts` | `archived/required*100` | 归档及时率，虽非“权重”但属于未登记公式 |

处置判断：这些常量不是代码缺陷，而是必须迁入可审计 Metric Definition（权重、阈值、模型版本、生效日期、审批人）的治理对象。PHASE-0 不改动它们。

## 5. 无业务定义 / 无 Owner / 无 Version

### 无业务定义或定义不足

至少包括：A-04 目标达成率、A-13 供应商平均分、A-17 结案率、A-20 缺陷 TOP5、A-21 目标达成、B-17 派发任务统计、B-19 监造统计、B-26 监造健康度、B-28~B-30 计量概览、C-07 缓存年龄，以及所有 D 类展示/人工覆盖资产。

具体缺口：统计窗口、软删除过滤、跨期关闭处理、空分母、四舍五入、是否包含 `CONDITIONAL/NA`、canonical identity 失败处理、topN 和人工覆盖优先级均未在统一业务定义中声明。

计量器具、检定计划和借用概览（B-28~B-30）虽然有 DTO 和 API，但当前为 Node `findMany` 后汇总；未见指标级 Permission Scope、业务 Owner、Version 或统一统计窗口。

### Owner 缺口

当前 registry 的 `owner` 是模块技术归属，不是可追责的业务 Owner。以下指标在源码和文档均没有人/岗位/委员会责任人：报表派生 KPI、车辆故障人工覆盖、监造进度/逾期、文件存储统计、缓存年龄、队列健康度、自定义售后图表和前端趋势值。清单以 `UNKNOWN` 保留，不以模块名冒充业务 Owner。

计量三类概览的技术模块虽可确定为 `metrology`，但没有业务 Owner；监造截止板明确未接 DataScope，权限范围同样是 `GAP`。

### Version 缺口

只有供应商评分明确带 `SUPPLIER_V4`/`IN_HOUSE_OUTSOURCING_V4`，合格率投影有 generation 概念；其余指标没有公式版本、生效时间、废止时间、变更原因、回溯策略或数据对账版本。现有 `M-A01` 等 registry ID 不是业务公式版本。

## 6. Dashboard 自己计算指标清单

1. `dashboard.service.ts#getMonthlyTrend` 从 monthly pass-rate points 再次 `SUM(passCount)/SUM(totalCount)`，形成 A-15 的第二计算点。
2. `dashboard.service.ts#getStats` 将多个域的 weekly/total loss 和 issue count 相加，形成 A-14 的跨域合并口径；它不是简单转发单一 registry 指标。
3. `MonthlyReportContent.vue` 用 `defect.value / defects[0].value` 计算展示宽度（D-04），不能作为缺陷比例。
4. `InspectionDashboardDetailDrawer.vue` 用当前 team/supplier 结果集总数计算分布百分比；该值不是 B-22 复检率。
5. `VehicleFailureChart.vue` 用 `issueCount / warrantyVehicleCount` 计算强度展示，后端同时返回 `intensityPct`，存在重复展示计算。
6. `SupervisionManagementView.vue` 用 `completed/planned*100` 计算进度，shared 包也有同一公式。

## 7. 推荐第一批进入 Metric Registry

按经营影响、跨页面复用和冲突风险，第一批建议登记以下 10 个稳定资产：

1. **A-01/A-03 合格率主口径**：先确定 source 与投影启用规则，其他 source 作为对账指标，不再让 Dashboard 重算。
2. **A-06/A-07 质量损失总额与趋势**：统一 `quality_loss_index`、四源纳入条件和追偿字段。
3. **A-17 问题结案率**：明确新增/关闭窗口和跨期关闭规则。
4. **A-10 售后净损失**：固化 gross/recovered/net 三字段和 D1 决策。
5. **A-12 供应商最终质量评分**：把两套 V4 模型、权重、阈值和生效日期纳入版本化 definition。
6. **B-22 复检率**：固化 inspected/reinspection 分母、空分母和身份维度。
7. **B-14/B-23 工单检验完成率**：区分点位完成率、数量完成率、要求执行率，避免同名复用。
8. **A-05 车辆故障强度**：分离自动值、人工覆盖值和保修车数来源，并增加审批/版本。
9. **B-27 归档及时率**：明确 required item、逾期和模板缺失是否进入分母。
10. **B-20 DFMEA RPN 风险统计**：将阈值（50/100）和风险级别版本化。

第二批再处理 C 类运行指标和 D 类临时分析指标；它们应进入 Observability/Analysis Registry，不应与经营 KPI 混在同一看板口径。

## 8. PHASE-0 后续治理边界

- 本阶段只建立资产和冲突证据；没有修改代码、Schema、migration、前端行为或业务数据。
- PHASE-1 应由业务 Owner 逐项确认 A 类公式、窗口、权限和版本；确认前不得以当前实现自动生成“标准口径”。
- PHASE-2 才设计 Metric Registry schema/字段扩展；PHASE-3 以后再迁移调用方和增加门禁。本报告不自动进入下一个专项。

## 9. PHASE-1 冲突处置状态（2026-08-21）

本节替代上一节中“PHASE-2 才设计 Registry”的时序表述：PHASE-1 已建立 Definition Registry 基础设施，但没有修改任一既有值计算，也没有替业务方裁定下列口径。`DRAFT` Definition 是争议的可审计载体，不是“已标准化”的宣告。

| Business Metric Code | 对应冲突 | 分类 | 当前消费者与影响 | 决策前规则 |
| --- | --- | --- | --- | --- |
| `BM-PASS-RATE` | C-01 | BUSINESS_DECISION_REQUIRED | Dashboard、报告、趋势、下钻会受事实源/投影切换影响 | 保留三套实现用于对账；不得以任一实现自动激活。 |
| `BM-QUALITY-LOSS-TREND` | C-02 | BUSINESS_DECISION_REQUIRED | 损失看板、Dashboard、周/月报、钻取会受四源和索引延迟影响 | 不改 `quality_loss_index` 或报表组合；记录纳入条件候选。 |
| `BM-PROBLEM-CLOSURE-RATE` | C-04、C-09 | BUSINESS_DECISION_REQUIRED | 报告卡、NC 页、日报和问题卡的分母/时间字段不同 | 不把“关闭率”显示名当成同一公式。 |
| `BM-AFTER-SALES-NET-LOSS` | 售后成本/损失族 | CANONICAL_CANDIDATE | 周/月报和质量损失汇总使用 D1 `gross - recovered` | 维持 DRAFT，待确认时间归属和 Owner。 |
| `BM-SUPPLIER-FINAL-SCORE` | C-03、供应商规则静态副本 | BUSINESS_DECISION_REQUIRED | 快照、供应商列表、前端规则说明和等级判断受双模型与常量影响 | 权重、阈值、等级、冻结均列为 BUSINESS_POLICY。 |
| `BM-REINSPECTION-RATE` | C-05 | CANONICAL_CANDIDATE | Inspection dashboard 和 detail drawer 同时展示复检率/分布占比 | 分布占比保持展示指标，不能代替后端候选公式。 |
| `BM-WORK-ORDER-INSPECTION-COMPLETION` | C-06 | BUSINESS_DECISION_REQUIRED | Workspace、shared DTO、生产过程卡会混淆点位率和数量率 | 必须拆分语义或明确名称后才激活。 |
| `BM-VEHICLE-FAILURE-INTENSITY` | C-07 | BUSINESS_DECISION_REQUIRED | Dashboard 图表、报告和人工覆盖配置受自动/手工数据优先级影响 | 不调整人工覆盖行为；DataScope 缺口另行治理。 |
| `BM-ARCHIVE-TIMELINESS` | PHASE-0 B-27 定义缺口 | BUSINESS_DECISION_REQUIRED | 日报、归档提醒和管理检查受模板/逾期/N-A 规则影响 | required 分母与模板缺失不得由实现推断。 |
| `BM-DFMEA-RPN-RISK` | PHASE-0 B-20 阈值缺口 | BUSINESS_DECISION_REQUIRED | DFMEA 项目风险统计受 50/100 分桶阈值影响 | 风险阈值按 BUSINESS_POLICY 等待批准。 |

### BUSINESS_DECISION_REQUIRED 清单

以下事项没有足够源码证据可以替代业务决策，PHASE-1 不选边：

1. 合格率采用检验事实、NC 校验还是身份投影作为主事实，及无活动代次的回退规则。
2. 质量损失是否以索引为唯一入口，四个来源、追偿、状态和索引延迟如何纳入。
3. 结案率采用期间新增闭环率还是存量关闭率，跨期关闭和零分母如何解释。
4. 供应商普通/驻厂外协双模型是否并存，扣分、等级、冻结、预警及损失阈值的审批和生效策略。
5. 工单“完成率”是否拆为检验点完成率与生产数量覆盖率。
6. 车辆故障强度中自动事实、人工覆盖和保修车辆分母的优先级、审批和回溯方式。
7. 归档及时率的 required 项、模板缺失、N/A、取消与逾期补归档规则。
8. DFMEA RPN 风险阈值及其适用范围、生效日期与历史比较方式。

### PHASE-1 控制结论

- 所有首批 Definition 均以 `DRAFT/v1` bootstrap；不存在业务 Owner 的，持久化为 `ownerDeptId=null`、`ownerStatus=UNCONFIRMED`。
- `BUSINESS_DECISION_REQUIRED` 绝不自动激活，Definition Version 不允许就地修改或物理删除。
- 供应商/焊工评分中的业务扣分、等级、阈值、奖励和惩罚进入 `BUSINESS_POLICY` 候选；数学钳制、固定精度等才可记为 `ALGORITHM_CONSTANT`。
- Registry 仅治理 Definition 元数据；所有当前值查询继续受既有 DataScope 和 RBAC 约束，不会因查询 Registry 而获取跨范围指标值。

完整 Definition Sheet 和 API/审计/版本契约见 [metric-registry.md](./metric-registry.md)。
