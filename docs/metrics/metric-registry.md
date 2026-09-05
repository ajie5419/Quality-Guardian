# METRIC-GOVERNANCE-001 / PHASE-1

## Metric Governance Registry 与 Canonical Metric Definition

本文是业务指标治理注册表的契约文档。它管理“某个指标是什么、依据什么口径、谁负责、何时生效、是否存在待决冲突”；它不计算数值，也不替代既有报表、投影、Worker 或 Dashboard。

### 1. 阶段目标与边界

PHASE-0 已登记 65 个指标资产（A 核心经营 21、B 过程 30、C 技术 7、D 临时分析 7），发现 15 个重复实现族、9 个高风险口径冲突、全部业务 Owner 缺失以及至少 61 个版本缺口。PHASE-1 只建立可追溯的定义、生命周期、版本和审计底座，并将第一批 10 个高价值指标以 `DRAFT` 初始化。

本阶段明确不做以下事项：迁移 Dashboard 或 Report 消费者、修改任何现有 SQL/聚合结果、建设投影、改造 Worker、删除旧实现、创建通用公式引擎、执行公式字符串、改变 DataScope 查询权限、自动解决业务口径争议或将 65 个资产全部入库。

### 2. 必须区分的对象

| 对象 | 定义 | 本阶段边界 |
| --- | --- | --- |
| Metric Code | 稳定、不可复用的业务指标标识，例如 `BM-PASS-RATE` | 显示名称可改，Code 不因改名而变化。 |
| Display Name | 面向用户的名称 | 不是稳定键，也不是接口数组位置。 |
| Definition | 业务含义、分子分母、来源、维度、排除条件、权限与刷新策略的可审计版本 | 不保存可执行 SQL/JS。 |
| Metric Value | 某时间、范围和维度下计算得到的数值 | 仍由既有领域服务、投影或报表产生；Registry 不存储或计算它。 |
| Business Metric Governance Registry | 本文及 `metric_definitions` / `metric_definition_versions` 的定义治理系统 | 管理业务责任与版本。 |
| Technical Aggregation Registry | `docs/metrics-registry.md` 和 `apps/backend/utils/metrics-registry.ts` | 管理聚合实现点与 B-MF 架构门禁，不代表业务版本或 Owner。 |
| Projection | 对某类指标值的物化/代次计算结果，例如合格率身份投影、供应商快照 | Projection 可引用某个定义版本，但不会替代 Definition。 |
| Dashboard/Report | 指标值消费者和展示层 | 不能以自行推导的展示值冒充新的业务 Definition。 |

因此，`M-A01` 等技术登记 ID 与 `BM-PASS-RATE` 等业务 Metric Code 不可互换；前者定位代码聚合位置，后者定位业务语义和生效版本。

### 3. 最小持久化模型

#### `metric_definitions`

| 字段 | 约束与含义 |
| --- | --- |
| `id` | 主键。 |
| `metricCode` | 唯一、稳定、不可复用的业务指标键。 |
| `metricName` | 当前展示名称。 |
| `domain` | 业务域。 |
| `category` | `A` / `B`（PHASE-1 首批只登记核心经营和过程指标）。 |
| `ownerDeptId` | 可空；未确认时必须为 `null`。 |
| `ownerStatus` | `UNCONFIRMED` 或已确认状态；不能把技术模块名伪装成业务 Owner。 |
| `status` | `DRAFT`、`ACTIVE`、`DEPRECATED`。 |
| `currentVersion` | 当前语义版本号。 |
| `revision` | 乐观并发 CAS 修订号，不是业务公式版本。 |
| `createdAt` / `updatedAt` | 审计辅助时间。 |

#### `metric_definition_versions`

| 字段 | 约束与含义 |
| --- | --- |
| `id` / `metricDefinitionId` / `version` | 版本记录；`(metricDefinitionId, version)` 唯一。 |
| `businessDefinition` | 人可读的业务定义。 |
| `numeratorDefinition` / `denominatorDefinition` | 对比例、率类指标显式描述；非比例指标可为空。 |
| `formulaType` | 仅语义分类，例如 `RATIO`、`SUM`、`SCORE`；不是公式文本。 |
| `sourceModel` / `sourceFields` | 结构化来源模型和字段，不承载查询语句。 |
| `dimensions` / `exclusions` | 结构化可分组维度和排除条件。 |
| `scopePolicy` | `ALL`、`DEPT`、`SELF`、`SOURCE_INHERITED`、`NOT_APPLICABLE` 之一。 |
| `refreshPolicy` | 实时、投影、日/月底批或事件最终一致等刷新语义。 |
| `unit` / `precision` | 单位和展示精度。 |
| `effectiveFromAt` / `effectiveToAt` | 定义版本的生效区间。 |
| `changeReason` | 新版本或状态变化的原因。 |
| `conflictStatus` | `NO_CONFLICT`、`CANONICAL_CANDIDATE`、`BUSINESS_DECISION_REQUIRED`。 |
| `createdBy` / `createdAt` | 创建人和创建时间。版本记录只创建，不就地修改或删除。 |
| `decisionHistoryId` / `approvalEvidence` / `sourceDocument` | 当前 Version 的快速 Decision Trace；必须与不可变 evidence row 一致，不能作为手工替代审批。 |

#### PHASE-1.7A 治理关联表

| 对象 | 约束与含义 |
| --- | --- |
| `metric_approval_evidences` | 追加式的 Decision ID → Metric Version 审批证据。记录批准状态、批准选项、业务定义、来源、`Decision By`、记录时间和来源文档；同一 Version/Decision ID 唯一。 |
| `metric_canonical_mappings` | Legacy Definition → Canonical **Version** 的语义 lineage；带 Decision ID 与 source document。它不删除旧 Definition、不改写历史指标值。 |
| `metric_policy_dependencies` | Version 的不可执行 Policy 依赖。`PENDING` 表示未完成制度确认，必定阻断 `ACTIVE`。 |
| `metric_owner_assignments` | 一个 Definition 的 BUSINESS / POLICY / DATA 多 Owner assignment。`ownerLabel` 可保存批准的业务责任标签；`ownerDeptId` 仍可为空，`UNKNOWN` 必须如实保留。 |

模型禁止 `formula`、`expression`、`sql`、`script` 等可执行字段，也禁止把 SQL/JS/DSL 放入语义字段或 JSON 元数据。公式计算仍是受测试保护的领域代码，而 Definition 只描述其业务契约。

### 4. 生命周期、版本与并发契约

```
DRAFT  --activate-->  ACTIVE  --deprecate-->  DEPRECATED
  |                         |
  |--update draft-----------|--new version--> 新版本 DRAFT/ACTIVE 流程
```

- 仅 `DRAFT` 可原地更新，更新必须携带 `revision` 并进行 CAS；冲突时拒绝覆盖。
- `ACTIVE` 的任意公式、分子分母、来源、排除、维度、范围、精度或策略变化必须创建 `version + 1`，不得更新既有版本行。
- `ACTIVE` 定义不得直接覆盖。新版本创建后按生命周期单独激活；旧版本保留有效期与审计证据。
- `DEPRECATED` 只保留历史读取与审计，不允许物理删除。
- `BUSINESS_DECISION_REQUIRED` 不能由 bootstrap 自动激活；没有明确业务决策时保持 `DRAFT`。

### 5. Owner、权限与 DataScope 边界

PHASE-0 没有确认任何业务 Owner。因此首批 10 个定义统一初始化为 `ownerDeptId = null`、`ownerStatus = UNCONFIRMED`，并保持 `DRAFT`。技术模块（例如 `report`、`supplier`）只是实现维护方，不能替代业务责任部门。

建议在业务治理委员会确认前，允许 `UNCONFIRMED` Owner 的 DRAFT 存在。PHASE-1.6B 的 D13 已批准当前 Suggested Business Owner 作为业务责任归属，因此 PHASE-1.7A 将“当前 Version 至少一条 `BUSINESS` assignment 为 `CONFIRMED` 或 `CONFIRMED_FROM_APPROVAL`”作为 `ACTIVE` 强制门槛；仍不要求或猜测 `ownerDeptId`。Policy / Data Owner 未确认时必须保存为 `UNKNOWN`，不能伪造组织 ID。

### 5.1 ACTIVE Readiness Validator

在状态 CAS 把 Definition 设为 `ACTIVE` 前，校验器必须同时确认：

1. 当前 Version 存在，且其 Decision Trace（`decisionHistoryId`、`approvalEvidence`、`sourceDocument`）完整；
2. 至少一条不可变 `metric_approval_evidences` 记录为 `APPROVED` 或 `APPROVED_WITH_POLICY_PENDING`，并有 `Decision By` 与 source document；
3. 当前 Version 有批准的 `effectiveFromAt`；
4. 至少一条已确认 BUSINESS Owner assignment；
5. 不存在 `PENDING` policy dependency；
6. `conflictStatus` 不是 `BUSINESS_DECISION_REQUIRED`。

任一项失败均以 `CONFLICT` 拒绝激活。PHASE-1.7A 只完成模型和校验器，不调用激活，不填 Effective Date，不解决 Pending Policy。

`scopePolicy` 描述“指标值应继承何种数据范围”，不是授权实现：

- Registry 元数据读取权限与指标值数据权限分离。
- Definition API 的 RBAC 只控制谁能看/改定义；它不会放宽现有数据查询权限。
- 值查询仍使用来源模块既有 `DataScope`、`AnalyticsAccessContext` 或其已批准的范围规则；`SOURCE_INHERITED` 明确要求沿用该来源。
- `ALL`、`DEPT`、`SELF`、`NOT_APPLICABLE` 也只是一条可审计声明，不能绕过原有查询授权。

### 6. 审计与最小 API

所有定义治理操作复用 `SystemLogService.auditLog` / system-log 审计设施，不建设第二套审计表。审计至少记录 actor、`metricCode`、version、action、before、after、`changeReason`。

| 行为 | 审计 action | API 契约 |
| --- | --- | --- |
| 创建 | `CREATE` | `POST /api/qms/metric-governance/definitions` |
| 更新草稿 | `UPDATE_DRAFT` | `PUT /api/qms/metric-governance/definitions/:id`，要求 revision CAS |
| 激活 | `ACTIVATE` | `POST /api/qms/metric-governance/definitions/:id/activate` |
| 创建新版本 | `NEW_VERSION` | `POST /api/qms/metric-governance/definitions/:id/versions` |
| 废止 | `DEPRECATE` | `POST /api/qms/metric-governance/definitions/:id/deprecate` |
| 变更 Owner | `OWNER_CHANGE` | 草稿更新或专用治理路径，始终留审计 |
| 查询列表 | — | `GET /api/qms/metric-governance/definitions` |
| 查询详情与版本历史 | — | `GET /api/qms/metric-governance/definitions/:id` |

写接口必须执行认证、RBAC、对象存在性、状态机和 CAS 校验；Definition 的元数据授权与任何现有 Dashboard/Report 数值接口无耦合。

### 7. Bootstrap 契约

首批 10 个定义采用显式、幂等 bootstrap：以 `metricCode` 识别，重复执行不得创建重复 Definition 或重复 Version。初始化只创建 version 1 的 `DRAFT` 记录；`BUSINESS_DECISION_REQUIRED` 不得自动激活。业务定义不得写入 Prisma migration SQL，迁移只创建结构。

### 8. 首批 Canonical Definition Sheets

下列“候选”代表可治理的登记候选，而非已批准的最终公式。所有 Owner 为 `UNKNOWN`（持久化为 `UNCONFIRMED/null`），所有 Canonical Status 为 `DRAFT/v1`。

#### BM-PASS-RATE — 合格率主口径（A）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 在已确认范围与期间内，满足通过条件的检验数量或批次相对于有效检验总量的比例。 |
| 已有实现 | `report/pass-rate.ts`、`pass-rate-issue-summary.service.ts`、`pass-rate-projection-query.service.ts`、`dashboard.service.ts#getMonthlyTrend`。 |
| 公式变体 | A：`SUM(MAX(quantity-unqualifiedQuantity,0))/SUM(quantity)`；B：检验数量与 NC 数量取 `MIN`；C：投影 `SUM(passCount)/SUM(totalCount)`。 |
| 来源/维度/排除 | `inspections`、`quality_records`、`pass_rate_process_identity_projection`；工序、类别、月份、身份；软删除、无效数量与投影代次规则待定。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME 或 PROJECTED；`%`，2 位。 |
| 消费者 | Pass-rate trend、周/月报、Dashboard、工序下钻。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：以投影为主、legacy 为对账（影响报表/Dashboard/下钻）；Option B：以检验事实为主、投影仅加速（影响投影启用和一致性对账）。技术建议：先明确 source 与代次回退，再激活。 |

#### BM-QUALITY-LOSS-TREND — 质量损失总量与趋势（A）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 指定期间内纳入质量损失范围的金额总和，以及按时间维度分桶后的同口径序列。 |
| 已有实现 | `quality-loss-reporting.service.ts`、`quality-loss.service.ts#getTrendData`、`quality-loss-summary.service.ts`、`report-summary.service.ts`、`dashboard.service.ts`。 |
| 公式变体 | A：`SUM(quality_loss_index.amount)`；B：`quality_records.lossAmount + quality_losses.amount`；C：Dashboard 合并检验、售后、调试、手工来源。 |
| 来源/维度/排除 | `quality_loss_index`、`quality_records`、`quality_losses`、`after_sales`、`vehicle_commissioning_issues`；来源、月/周/年、责任部门；`amount>0`、`isClaim`、状态和索引滞后规则待决。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME/事件最终一致；`CNY`，2 位。 |
| 消费者 | 损失看板、Dashboard、周/月报、趋势图和钻取。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：以 `quality_loss_index` 为总入口（影响损失页/趋势）；Option B：报表继续按领域事实组合（影响 Dashboard/报告总额）。需要确认四源纳入与索引延迟处理。 |

#### BM-PROBLEM-CLOSURE-RATE — 问题结案率（A）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 在约定期间和范围内已完成关闭的问题相对约定问题集合的比例。 |
| 已有实现 | `report-summary.service.ts#fetchPeriodMetrics`、`inspection-issue-stats.service.ts`、`inspection-reporting.service.ts`。 |
| 公式变体 | A：本期 `closedIssues/newIssues`；B：当前 `closedCount/totalCount`；空分母分别返回 100 或 0。 |
| 来源/维度/排除 | `quality_records.createdAt/status/date/isDeleted`；期间、缺陷类别、责任组织；跨期关闭、重开、撤销和零样本待决。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME；`%`，2 位。 |
| 消费者 | 周/月报、NC 页面、日报和 Dashboard 问题卡片。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：本期新增闭环率（影响报告 KPI）；Option B：存量关闭率（影响 NC 页面和管理盘点）。必须确认时间字段、分母和零样本语义。 |

#### BM-AFTER-SALES-NET-LOSS — 售后净损失（A）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 售后责任范围内的物料、人工与差旅成本减去已确认追偿后的经营损失。 |
| 已有实现 | `after-sales-integration.service.ts#getReportPeriodMetrics`、`report-summary.service.ts#fetchPeriodMetrics`。 |
| 公式变体 | 已确认候选：`grossCost - recovered`，其中 `grossCost = materialCost + laborTravelCost`。 |
| 来源/维度/排除 | `after_sales.materialCost/laborTravelCost/actualClaim/occurDate/isDeleted`；月/周、责任部门、供应商；时间归属、撤销单和负追偿待显式记录。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME；`CNY`，2 位。 |
| 消费者 | 周/月报、质量损失汇总、售后分析。 |
| 冲突与 Canonical | `CANONICAL_CANDIDATE`。当前 D1 是唯一已确认的净额关系；仍以 DRAFT 登记，待 Owner、时间归属及排除规则确认后方可激活。 |

#### BM-SUPPLIER-FINAL-SCORE — 供应商最终质量评分（A）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 在指定评分模型和生效窗口中，根据来料、工程和售后质量表现计算并冻结的供应商综合质量分。 |
| 已有实现 | `supplier-scoring.ts#scoreSupplierListItem`、`supplier-score-snapshot.service.ts`、月度 snapshot Worker、前端 `ScoringRulesModal.vue` 静态副本。 |
| 公式变体 | 普通模型 A/B/C 扣分 `15/5/1`、来料失败 `3`；驻厂/外协模型 `12/4/0.5`、未分类 `0.5`、开放项 `2`；冻结、预警与损失阈值另有常量。 |
| 来源/维度/排除 | `supplier_score_snapshots`、`inspections`、`quality_records`、`after_sales`；供应商类型、模型、月份；12 月窗口、无样本、冻结、身份映射待确认。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；PROJECTED/EVENTUAL；`score`，2 位。 |
| 消费者 | 供应商列表、全局统计、月度快照、供应商管理页面。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：分别版本化普通与驻厂/外协模型（影响快照横向比较）；Option B：统一业务评分模型（影响历史快照与现有等级）。扣分、阈值、等级带和奖惩属于 `BUSINESS_POLICY`；纯上下限钳制可标为 `ALGORITHM_CONSTANT`。 |

#### BM-REINSPECTION-RATE — 复检率（B）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 已完成检验的报检任务中，被识别为发生复检的任务占比。 |
| 已有实现 | `inspection-request-stats-identity.ts#createReinspectionRows`、统计合并服务、`InspectionDashboardDetailDrawer.vue`。 |
| 公式变体 | 后端：`reinspectionCount/inspectedCount*100`；前端另有 `row.count/total` 的身份分布占比，不能替代复检率。 |
| 来源/维度/排除 | `qms_inspection_requests` 的提交、关闭、结果与复检关联字段；团队、供应商、部门、期间；取消、未检、重复关联和零分母待确认。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME；`%`，1 位。 |
| 消费者 | Inspection dashboard 团队/供应商/部门卡片与明细抽屉。 |
| 冲突与 Canonical | `CANONICAL_CANDIDATE`。后端比例是候选，前端分布值明确标为 presentation ratio；仍需确认复检识别与空分母后保持 DRAFT。 |

#### BM-WORK-ORDER-INSPECTION-COMPLETION — 工单检验完成率（B）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 工单计划检验点中已完成检验点的比例，独立于生产数量完成率。 |
| 已有实现 | `work-order-aggregate.service.ts#getWorkOrderAggregate`、shared work-order DTO、workspace 生产进度卡。 |
| 公式变体 | A：`min(inspectedPoints, plannedPoints)/plannedPoints*100`；B：`completedQuantity/totalQuantity`。 |
| 来源/维度/排除 | `work_order_requirements.requirementItems`、`inspections.items`、`work_orders`；工单、部件、工序；取消项、N/A、重复检验点与零计划待决。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME；`%`，2 位。 |
| 消费者 | Workspace 工单聚合抽屉、工单过程进度展示、shared DTO。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：明确为“检验点完成率”（影响 workspace）；Option B：另建“生产数量覆盖率”（影响过程卡）。同名字段不得混用。 |

#### BM-VEHICLE-FAILURE-INTENSITY — 车辆故障强度（B）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 保修车辆基数下的车辆调试/售后问题发生强度，必须区分自动事实和人工覆盖。 |
| 已有实现 | `vehicle-failure-rate.service.ts#getVehicleFailureRate`、`vehicle-failure-rate-manual.service.ts`、`VehicleFailureChart.vue`。 |
| 公式变体 | A：`issueCount/avgWarrantyVehicleCount*100`；B：人工月度 `issueCount/warrantyVehicleCount` 覆盖自动序列；C：当前结果集排名百分比。 |
| 来源/维度/排除 | `vehicle_commissioning_issues.occurDate/isWarranty/lossAmount`、`system_settings` 人工 JSON；月份、故障类型；保修基数、人工审批、覆盖优先级待决。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME + MANUAL；`%`，2 位。 |
| 消费者 | Dashboard VehicleFailureChart、车辆质量报告。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：自动事实为主、人工仅经审批校正（影响历史月序列）；Option B：人工运营口径优先（影响自动聚合可见性）。现有车辆域 DataScope 缺口不能被 Registry 绕过。 |

#### BM-ARCHIVE-TIMELINESS — 归档及时率（B）

| 项 | 内容 |
| --- | --- |
| 业务定义 | 需要归档的检验档案项目中，按规定期限完成归档的比例。 |
| 已有实现 | `report-daily-summary.service.ts#buildArchiveStats`、Daily report 页面。 |
| 公式变体 | 当前候选：`archivedCount/requiredCount*100`；模板缺失、逾期后补归档和非适用项目未统一。 |
| 来源/维度/排除 | `inspection_archive_tasks.status/dueAt`、归档模板存在性；日、部门/本人、模板；模板缺失、N/A、取消和超期规则待决。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；DAILY/REAL-TIME；`%`，2 位。 |
| 消费者 | 日报页面、归档提醒与管理检查。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：仅模板已生成的任务入分母（影响可操作性）；Option B：应生成但缺模板的项目也入分母（影响治理压力）。 |

#### BM-DFMEA-RPN-RISK — DFMEA RPN 风险统计（B）

| 项 | 内容 |
| --- | --- |
| 业务定义 | DFMEA 项目的 RPN 平均值、最大值及按已批准阈值划分的高中低风险项目数量。 |
| 已有实现 | DFMEA `stats.get.service.ts`、前端 DFMEA project stats。 |
| 公式变体 | `avgRpn=SUM(rpn)/n`、`maxRpn`；当前阈值 high `>100`、medium `50..100`、low `<=50`。 |
| 来源/维度/排除 | `dfmea.severity/occurrence/detection/rpn`；项目、过程、风险等级；空 RPN、已废止项目与阈值生效日期待决。 |
| 范围/刷新/单位 | `SOURCE_INHERITED`；REAL-TIME；`RPN` / `count`，0 或 2 位。 |
| 消费者 | DFMEA 项目统计、质量策划风险看板。 |
| 冲突与 Canonical | `BUSINESS_DECISION_REQUIRED`。Option A：维持 50/100 阈值并版本化（影响风险分桶）；Option B：按产品/行业标准定义阈值（影响所有历史比较）。阈值是 `BUSINESS_POLICY`，RPN 乘法和数值格式是 `ALGORITHM_CONSTANT`。 |

### 9. 首批冲突决策矩阵

| Metric Code | 冲突状态 | 本阶段是否可 ACTIVE | 必须由业务确认的事项 |
| --- | --- | --- | --- |
| BM-PASS-RATE | BUSINESS_DECISION_REQUIRED | 否 | 主事实源、投影启用/回退、分母、无样本。 |
| BM-QUALITY-LOSS-TREND | BUSINESS_DECISION_REQUIRED | 否 | 四源范围、索引延迟、追偿与状态规则。 |
| BM-PROBLEM-CLOSURE-RATE | BUSINESS_DECISION_REQUIRED | 否 | 新增闭环率或存量关闭率、时间字段、零分母。 |
| BM-AFTER-SALES-NET-LOSS | CANONICAL_CANDIDATE | 否（本阶段 bootstrap 一律 DRAFT） | Owner、时间归属、撤销与追偿规则。 |
| BM-SUPPLIER-FINAL-SCORE | BUSINESS_DECISION_REQUIRED | 否 | 双模型、扣分/阈值/等级/冻结和历史比较。 |
| BM-REINSPECTION-RATE | CANONICAL_CANDIDATE | 否（本阶段 bootstrap 一律 DRAFT） | 复检识别、范围、空分母。 |
| BM-WORK-ORDER-INSPECTION-COMPLETION | BUSINESS_DECISION_REQUIRED | 否 | 点位率与数量率的拆分及名称。 |
| BM-VEHICLE-FAILURE-INTENSITY | BUSINESS_DECISION_REQUIRED | 否 | 自动/人工来源优先级、保修分母、审批。 |
| BM-ARCHIVE-TIMELINESS | BUSINESS_DECISION_REQUIRED | 否 | required 定义、模板缺失、逾期和非适用。 |
| BM-DFMEA-RPN-RISK | BUSINESS_DECISION_REQUIRED | 否 | 50/100 阈值、生效日期、项目适用范围。 |

### 10. 不可突破的治理规则

1. 不使用 Display Name、数组位置或前端文案作为 Metric Code。
2. 不以 Dashboard/Report 展示层的二次计算自动升级为标准指标。
3. 不允许 Definition 保存或执行 SQL、JavaScript、表达式字符串或通用 DSL。
4. 不允许物理删除 Definition/Version，也不允许修改已创建的 Version 行。
5. 不允许绕开既有 DataScope；Definition 元数据权限绝不等于指标值的数据权限。
6. 不将技术模块 Owner、技术 registry ID、projection generation 或 Worker 状态伪装成业务 Owner/业务公式版本。
7. 供应商、焊工等评分中的业务权重、阈值、奖惩、等级带必须作为 `BUSINESS_POLICY` 登记或进入后续 POLICY-GOVERNANCE；不可用“算法常量”掩盖业务决策。
8. `pnpm run check:metric-governance` 以模型字段与 TypeScript AST 的窄范围不变量拦截重复 Code/Version 结构缺口、Approval Evidence / Owner Assignment / Canonical Version lineage 缺口、ACTIVE 绕过 readiness validator、Version 原地变更、物理删除和公式执行入口；它同时对潜在 legacy code 直接消费者给出非阻断 warning，不以全仓正则替代业务审查。

### 11. PHASE-1 验收与遗留

PHASE-1 的完成标准是：模型、生命周期、版本、审计、权限边界、幂等 bootstrap、最小 API、窄不变量和第一批 10 个 DRAFT 定义均可验证；不是让页面数值立刻统一。

仍待业务方确认的包括：所有 65 个指标 Owner、首批 10 项的冲突决议与激活条件、供应商/焊工评分策略归属、车辆人工覆盖审批、归档分母和 DFMEA 阈值。确认后才考虑 PHASE-2 的消费者迁移、projection 关联或指标值治理。
