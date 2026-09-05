# METRIC-GOVERNANCE-001 / PHASE-0

## Metric Inventory（指标资产清单）

扫描日期：2026-08-21扫描范围：`apps/backend` 全部模块；`apps/web-antd` Dashboard、Report、Analytics/统计页面；`packages/qgs-shared`。扫描关键词：`count`、`sum`、`avg`、`percentage`、`rate`、`ratio`、`score`、`trend`、`groupBy`、`aggregate`、`reduce`。证据规则：本清单只登记可从源码、DTO、既有 `metrics-registry` 或页面消费链路确认的资产；推断项在“业务含义”或“备注”中标为 `INFERRED`。没有持久化治理元数据的字段统一标为 `GAP`，没有可确认责任人的标为 `UNKNOWN`。

### 口径说明

- 一个 Metric ID 表示一个可被业务消费的指标资产或指标族；同一指标在多个服务中计算时只保留一个 ID，并在冲突报告登记所有实现点。
- `Refresh Type`：`REAL-TIME`（请求期查询/短缓存）、`PROJECTED`（物化表/代次）、`DAILY`、`MONTHLY`、`EVENTUAL`（持久队列刷新）、`MANUAL`、`PRESENTATION`。
- `Permission Scope`：`ANALYTICS/SELF`、`ANALYTICS/DEPT`、`ANALYTICS/ALL` 表示经 `AnalyticsAccessContext`/DataScope；`SYSTEM` 表示系统级维护；`UNKNOWN` 表示当前代码未给出可审计的业务范围。
- “来源字段”保留关键过滤字段、分组字段和聚合字段；完整 schema 仍以 `apps/backend/prisma/schema.prisma` 为准。
- 表格中的 `Source Tables / Fields` 使用“表；字段”格式。`Owner` 单元格中的模块名只是技术归属；本阶段没有确认岗位/组织级业务 Owner，因此所有业务 Owner 均为 `UNKNOWN`。

## A. 核心经营指标

| Metric ID | Metric Name | Business Meaning | Domain | Source Tables / Fields | Calculation Location | Formula | Refresh Type | Permission Scope | Current Consumers | Owner | Version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-01 | 合格率（检验源） | 检验批次净合格率 | report/inspection | `inspections.quantity, unqualifiedQuantity, result, inspectionDate` | `modules/report/pass-rate.ts#getLegacyInspectionPassRateSummaryByRange`；`pass-rate-rows.ts` | `SUM(MAX(quantity-unqualifiedQuantity,0))/SUM(quantity)*100` | REAL-TIME | ANALYTICS/\* | pass-rate trend、报表、Dashboard | report | GAP（registry M-A01） |
| A-02 | 合格率（不合格品源） | 以 NC 数量校验的合格率 | report/inspection | `inspections.quantity` + `quality_records.quantity, isDeleted, date` | `modules/report/pass-rate-issue-summary.service.ts#getIssuePassRateSummaryByRange` | `MIN(SUM inspection qty,SUM issue qty)`；`(total-unqualified)/total*100` | REAL-TIME | ANALYTICS/\* | issue-source trend、影子对账 | report | GAP（registry M-A02） |
| A-03 | 合格率（身份投影） | canonical 身份统一后的正式合格率 | report | `pass_rate_process_identity_projection.totalCount, passCount, generationId` | `pass-rate-projection-query.service.ts#getProjectedPassRateSummaryByRange` | `SUM(passCount)/SUM(totalCount)*100`；无活动代次回退 A-01 | PROJECTED | ANALYTICS/ALL（当前 raw 查询只允许 ALL） | pass-rate trend、报表 | report | generation；业务版本 GAP（M-A03） |
| A-04 | 工序合格率/目标达成 | 按工序、类别查看合格率并与目标比较 | report/dashboard | A-01/A-03 + `dashboard_targets.targetValue` | `pass-rate-projection-query.service.ts#getProjectedPassRateDrillDownByRange`；`dashboard.service.ts#getPassRateTargets` | 分组 `passRate`；`targetGap=passRate-targetPassRate` | REAL-TIME/PROJECTED | ANALYTICS/\*；目标写入 SYSTEM | Dashboard、周/月报 | report/dashboard | GAP（M-A04/M-F04） |
| A-05 | 车辆故障率/故障强度 | 保修车辆问题发生强度及缺陷占比 | report/vehicle | `vehicle_commissioning_issues.occurDate, defectType, isWarranty, lossAmount`；系统设置人工月值 | `modules/report/vehicle-failure-rate.service.ts#getVehicleFailureRate` | `percentage=count/total*100`；`intensityPct=issueCount/avgWarrantyVehicleCount*100` | REAL-TIME + MANUAL override | UNKNOWN（vehicle commissioning 未声明 DataScope） | Dashboard VehicleFailureChart、报表 | report | GAP（M-A07） |
| A-06 | 质量损失总量/周量 | 年度累计、本周质量损失金额 | quality-loss | `quality_loss_index.amount, occurDate, source, isDeleted` | `quality-loss-reporting.service.ts#getStatsForDashboard` | `SUM(amount)` by year/week | REAL-TIME | ANALYTICS/\* | Dashboard、损失看板 | quality-loss | GAP（M-B01） |
| A-07 | 质量损失趋势 | 按月/周/年查看四类质量损失趋势 | quality-loss | `quality_loss_index.amount, actualClaim, occurDate, source` | `quality-loss.service.ts#getTrendData`；`quality-loss-format.ts#mergeTrendData` | 各 period `SUM(amount)`、`SUM(actualClaim)`；统一索引口径 | REAL-TIME | ANALYTICS/\* | Dashboard、损失图表、下钻 | quality-loss | GAP（M-B03） |
| A-08 | 质量损失看板汇总 | 损失总额、已追偿额、待追偿额和部门分布 | quality-loss | `quality_loss_index.amount, actualClaim, status, respDeptId` | `quality-loss-summary.service.ts#getDashboardSummary`；`quality-loss.service.ts#getDashboardSummary` | `recoveryRate=claim/amount*100`；`pending=amount-claim` | REAL-TIME | ANALYTICS/\* | LossKpiCards、LossCharts | quality-loss | GAP（M-B06） |
| A-09 | 售后 KPI | 售后单量、成本、未关闭量、平均处理天数 | after-sales | `after_sales.materialCost, laborTravelCost, occurDate, closeDate, claimStatus` | `after-sales-analytics.service.ts#buildKpiSummary` | `total=COUNT(id)`；`cost=SUM(materialCost+laborTravelCost)`；`avgTime=AVG(DATEDIFF(closeDate,occurDate))` | REAL-TIME | ANALYTICS/\* | 售后统计页、Dashboard | after-sales | GAP（M-C01） |
| A-10 | 售后净损失（外部损失） | 售后总成本扣减已追偿的经营损失 | after-sales/report | `after_sales.materialCost, laborTravelCost, actualClaim, occurDate` | `after-sales-integration.service.ts#getReportPeriodMetrics`；`report-summary.service.ts#fetchPeriodMetrics` | `netLoss=grossCost-recovered` | REAL-TIME | ANALYTICS/\* | 周/月报、质量损失 | after-sales | D1 only；业务版本 GAP（M-C06） |
| A-11 | 不合格项经营汇总 | NC 数量、损失金额、关闭率和缺陷分布 | inspection | `quality_records.status, lossAmount, defectCategoryId, date, isDeleted` | `inspection-issue-stats.service.ts#getIssueStats` | `COUNT`、`SUM(lossAmount)`、`closed/total`、`GROUP BY defectCategoryId` | REAL-TIME | ANALYTICS/\* | NC 页面、报表 | inspection | GAP（M-D02） |
| A-12 | 供应商最终质量评分 | 供应商综合质量分、等级、状态 | supplier | `supplier_score_snapshots.finalQualityScore, finalRating, finalStatus`；源检验/NC/售后字段 | `supplier-scoring.ts#scoreSupplierListItem`；`supplier-score-snapshot.service.ts#toSnapshotData` | 普通模型/驻厂外协模型分别按问题等级扣分后 `clamp(100-deduction)`；冻结=0 | EVENTUAL/PROJECTED | ANALYTICS/\*；维护 SYSTEM | 供应商列表、月度快照 | supplier | `SUPPLIER_V4` / `IN_HOUSE_OUTSOURCING_V4` |
| A-13 | 供应商平均分/合格与预警数 | 供应商总体质量画像 | supplier | `supplier_score_snapshots.finalQualityScore, finalStatus` | `supplier.service.ts#buildSupplierGlobalStats` | `AVG(finalQualityScore)`；按 status/score 阈值计数 | REAL-TIME（读快照） | ANALYTICS/\* | SupplierStats cards | supplier | GAP（M-E03） |
| A-14 | 工作台经营概览 | 现场问题、过程问题、质量损失、工单总量/周量 | dashboard | after_sales、quality_records、vehicle_commissioning_issues、quality_loss_index、work_orders | `dashboard.service.ts#getStats` | 跨域结果相加；`openIssues=weekly field+process+commissioning` | REAL-TIME（60s cache） | ANALYTICS/\*（cache key userId） | QMS Dashboard、workspace | dashboard | GAP（M-F01） |
| A-15 | 月度质量趋势 | 月度合格率趋势 | dashboard/report | A-01/A-03 monthly points | `dashboard.service.ts#getMonthlyTrend` | 先按月累加 `passCount,totalCount`，再 `passCount/totalCount*100` | REAL-TIME（1h cache） | ANALYTICS/\* | Dashboard PassRateTrendChart | dashboard | GAP（M-F02） |
| A-16 | 质量损失追偿率 | 质量损失中已追偿比例 | quality-loss | `quality_loss_index.amount, actualClaim` | `quality-loss-summary.service.ts#getDashboardSummary` | `SUM(actualClaim)/SUM(amount)*100`，零金额=0 | REAL-TIME | ANALYTICS/\* | LossKpiCards、报表潜在复用 | quality-loss | GAP（未进入 registry） |
| A-17 | 问题结案率 | 本期关闭问题 / 本期新增问题 | report/inspection | `quality_records.createdAt, status, isDeleted` | `report-summary.service.ts#fetchPeriodMetrics` | `closedIssues/newIssues*100`；无新增=100 | REAL-TIME | ANALYTICS/\* | 周报/月报 metric card | report | GAP（未进入 registry） |
| A-18 | 制造损失 | NCR 报废/工时等内部损失 | report/inspection/quality-loss | `quality_records.lossAmount, date` + `quality_losses.amount, occurDate` | `report-summary.service.ts#fetchPeriodMetrics` | `internalLoss=inspection.internalLoss+manualLoss` | REAL-TIME | ANALYTICS/\* | 周报/月报 | UNKNOWN | GAP（未进入 registry） |
| A-19 | 售后损失 | 本期售后净损失 | report/after-sales | `after_sales.materialCost, laborTravelCost, actualClaim` | `report-summary.service.ts#fetchPeriodMetrics` | `externalLoss=AfterSalesPeriodMetrics.netLoss` | REAL-TIME | ANALYTICS/\* | 周报/月报 | report | D1 only；版本 GAP |
| A-20 | 缺陷 TOP5 | 本期缺陷类别出现次数排名 | report/inspection | `quality_records.defectCategoryId, defectType, date` | `report-summary.service.ts#fetchDefectDistribution` | `COUNT(*) GROUP BY canonical defectCategoryId`，降序取 5 | REAL-TIME | ANALYTICS/\* | MonthlyReportContent、ReportSummary | report | GAP（未进入 registry） |
| A-21 | 报表工序目标达成率 | 各工序当前合格率相对目标的达成 | report/dashboard | A-04 `passRate,targetPassRate` | `report-summary.service.ts#fetchProcessPassRates`；前端仅展示 | `passRate/targetPassRate*100`（当前仅返回两值，未统一计算达成率） | REAL-TIME/PROJECTED | ANALYTICS/\* | 周/月报工序表 | UNKNOWN | GAP（定义未固化） |

## B. 过程指标

| Metric ID | Metric Name | Business Meaning | Domain | Source Tables / Fields | Calculation Location | Formula | Refresh Type | Permission Scope | Current Consumers | Owner | Version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B-01 | 报表周期手工损失 | 报表周期内手工台账金额 | quality-loss/report | `quality_losses.amount, occurDate, isDeleted` | `quality-loss-reporting.service.ts#getReportPeriodMetrics` | `SUM(amount)` in period | REAL-TIME | ANALYTICS/\* | ReportSummary internalLoss | quality-loss | GAP（M-B02） |
| B-02 | 质量损失钻取 | 按来源/期间返回损失明细 | quality-loss | `quality_loss_index.source, amount, occurDate, workOrderNumber` | `quality-loss-record-maintenance.service.ts#getDrillDown` | scoped rows；不再由前端合并三源 | REAL-TIME | ANALYTICS/\* | Dashboard drilldown、charts | quality-loss | GAP（M-B04） |
| B-03 | 损失记录聚合 | 质量损失列表计数/分页总数 | quality-loss | `quality_loss_index.workOrderNumber, amount, isDeleted` | `quality-loss.service.ts#getAllLosses` | `COUNT` + bounded list；统一 `amount>0 OR isClaim=true` | REAL-TIME | ANALYTICS/\* | Loss list/export | quality-loss | GAP（M-B05） |
| B-04 | 售后缺陷分布 | 售后单按缺陷分类的数量分布 | after-sales | `after_sales.defectCategoryId, defectType, isDeleted` | `after-sales-analytics.service.ts#formatStatsResponse` | `COUNT(id) GROUP BY canonical defect id` | REAL-TIME | ANALYTICS/\* | AfterSalesCharts | after-sales | GAP（M-C02） |
| B-05 | 售后供应商分布 | 售后单按供应商的数量排名 | after-sales | `after_sales.supplierBrandId, supplierBrand` | `after-sales-analytics.service.ts#formatStatsResponse` | `COUNT(id) GROUP BY supplierBrandId` | REAL-TIME | ANALYTICS/\* | AfterSalesCharts | after-sales | GAP（M-C03） |
| B-06 | 售后责任部门分布 | 售后单按责任部门的数量分布 | after-sales | `after_sales.respDeptId, respDept` | `after-sales-analytics.service.ts#formatStatsResponse` | `COUNT(id) GROUP BY respDeptId` | REAL-TIME | ANALYTICS/\* | AfterSalesCharts | after-sales | GAP（M-C04） |
| B-07 | 售后趋势 | 售后单量、关闭量、成本趋势 | after-sales | `occurDate, closeDate, materialCost, laborTravelCost` | `after-sales-analytics.service.ts#buildTrendData` | period arrays of `issues`, `closed`, `costs` | REAL-TIME | ANALYTICS/\* | AfterSalesCharts、报表 | after-sales | GAP（M-C05） |
| B-08 | 检验报告统计 | 缺陷分布、Top 风险项目、供应商绩效 | inspection | `quality_records.defectCategoryId, projectName, supplierId, lossAmount` | `inspection-report-statistics.service.ts#getDefectDistribution/getTopRiskProjects/getSupplierPerformance` | `COUNT/GROUP BY`；风险项目按 issue count/loss | REAL-TIME | ANALYTICS/\* | Reports summary | inspection | GAP（M-D01） |
| B-09 | NC 图表聚合 | 按维度查看 NC 数量/损失/数量 | inspection | `quality_records.defectCategoryId, lossAmount, quantity, date` | `inspection-issue-chart-aggregate.get.service.ts`；`inspection-issue-stats.service.ts#getIssueChartAggregation` | `metric ∈ {count,lossAmount,quantity}` + groupBy | REAL-TIME | ANALYTICS/\* | IssueChartDashboard | inspection | GAP（M-D03） |
| B-10 | 报检任务工作量 | 检验员在办、完成、平均时长和排行 | inspection | `qms_inspection_requests.status, submittedAt, closedAt, inspectorId` | `inspection-request-stats.service.ts#getRequestStats` | active/completed `COUNT`；`avgTaskMinutes=SUM(duration)/completed` | REAL-TIME | ANALYTICS/\* | Inspection dashboard、用户列表 | inspection | GAP（M-D04/M-G08） |
| B-11 | 工作台问题汇总 | 今日检验数、今日问题数、开放问题数 | inspection/dashboard | `inspections.createdAt`；`quality_records.createdAt,status` | `inspection-reporting.service.ts#getWorkspaceIssueSummary` | `COUNT` by today/open; recent list is context | REAL-TIME | ANALYTICS/\* | workspace/dashboard | inspection | GAP（M-D05） |
| B-12 | 报表周期检验指标 | 新问题、已关闭问题、内部损失 | inspection | `quality_records.createdAt,status,date,lossAmount` | `inspection-reporting.service.ts#getReportPeriodMetrics` | `COUNT(new)`、`COUNT(CLOSED)`、`SUM(lossAmount)` | REAL-TIME | ANALYTICS/\* | ReportSummary | inspection | GAP（M-D06） |
| B-13 | 工作台缺陷分布 | 工作台年度缺陷类型分布 | dashboard/inspection | `quality_records.defectCategoryId, defectType, date` | `dashboard.service.ts#getIssueDistribution` → `InspectionService.getStatsForDashboard` | defect group counts | REAL-TIME | ANALYTICS/\* | Dashboard issue chart | dashboard | GAP（M-F03） |
| B-14 | 工单质量聚合 | 工单部件/工序计划点、已检点、缺失点 | work-order | `work_order_requirements.requirementItems` + `inspections.items` | `work-order-aggregate.service.ts#getWorkOrderAggregate` | `completionRate=min(inspected,planned)/planned*100` | REAL-TIME | ANALYTICS/\* | WorkspaceWorkOrderAggregateDrawer | work-order | GAP（M-F05） |
| B-15 | 焊工质量评分 | 按责任焊工和严重度扣分 | welder/inspection | `quality_records.responsibleWelderId, responsibleWelder, severity` | `inspection-score-data.service.ts#getWelderScoreStats`；`welder-score.ts` | score starts 12; critical -4, major -2, other -1; clamp 0..12 | EVENTUAL | ANALYTICS/\*; worker SYSTEM | Welder page、worker | welder | GAP（M-G01） |
| B-16 | 工单状态统计 | 工单按状态的数量统计 | work-order | `work_orders.status,isDeleted,createdAt` | `work-order.service.ts#getStatsForDashboard` | `COUNT`/`GROUP BY status` | REAL-TIME | ANALYTICS/\* | Work-order dashboard | work-order | GAP（M-G02） |
| B-17 | 派发任务统计 | 派发任务按状态/人员的数量 | task-dispatch | `qms_task_dispatches.status,assigneeId` | `task-dispatch.service.ts#stats` | `COUNT`/`GROUP BY` | REAL-TIME | ANALYTICS/\* | Task dispatch page | task-dispatch | GAP（M-G03） |
| B-18 | 车辆日报问题汇总 | 每日报告中的问题数与损失 | vehicle-commissioning | `vehicle_commissioning_issues.occurDate, lossAmount, isClaim` → `daily_reports` | `vehicle-commissioning.service.ts#getStatsForDashboard`；daily report service | `COUNT` + `SUM(lossAmount)` | DAILY | UNKNOWN（缺 DataScope） | 车辆日报 | vehicle-commissioning | GAP（M-G05） |
| B-19 | 监造项目问题/日报统计 | 项目问题和日报按状态/时间的统计 | supervision | `supervision_issues.status, createdAt`；`supervision_daily_reports` | `supervision-project.service.ts#listProjects` | `GROUP BY status/date` | REAL-TIME | UNKNOWN（需核对模块 scope） | 监造项目详情 | supervision | GAP（M-G06） |
| B-20 | DFMEA RPN 风险统计 | RPN 均值、最大值和高中低风险计数 | planning | `dfmea.severity, occurrence, detection, rpn` | `stats.get.service.ts`（findMany + reduce） | `avgRpn=SUM(rpn)/n`；high `>100`、medium `50..100`、low `<=50` | REAL-TIME | ANALYTICS/\* | DFMEA project stats | planning | GAP（M-G07） |
| B-21 | 用户检验员在办量 | 用户列表中每个检验员当前在办任务数 | user/inspection | `qms_inspection_requests.status, inspectorId` | `inspection-request-stats-workload.ts#getInspectorActiveTaskCounts` | `COUNT(status IN DISPATCHED,INSPECTING)` | REAL-TIME | SYSTEM/USER_LIST | User management | inspection/user | GAP（M-G08） |
| B-22 | 复检率 | 已检报检任务中发生复检的比例 | inspection | `qms_inspection_requests` submission/result/reinspection linkage | `inspection-request-stats-identity.ts#createReinspectionRows` | `reinspectionCount/inspectedCount*100`，一位小数 | REAL-TIME | ANALYTICS/\* | Inspection dashboard team/supplier/dept cards | inspection | GAP（未进入 registry） |
| B-23 | 工单检验完成率 | 工单计划检验点的完成比例 | work-order | `work_order_requirements.requirementItems`；`inspections.items` | `work-order-aggregate.service.ts#completionRate` | `min(inspectedPoints,plannedPoints)/plannedPoints*100` | REAL-TIME | ANALYTICS/\* | workspace aggregate | work-order | GAP（与 M-F05 同一族，未单列） |
| B-24 | 生产过程覆盖率 | 过程已完成数量相对总数量 | work-order/inspection | `inspections.category, quantity, inspectionDate` | `work-order-aggregate.service.ts#processProgressMap` | `completedQuantity/totalQuantity`，状态 COMPLETE/PARTIAL | REAL-TIME | ANALYTICS/\* | workspace production progress | work-order | GAP（未进入 registry） |
| B-25 | 监造计划加权进度率 | 监造计划按任务权重汇总的完成进度 | supervision | `supervision_plan_tasks.progressPercent,weight,status` | `supervision-shared.ts`；`supervision-core.ts`；`SupervisionManagementView.vue` | `SUM(progressPercent*weight)/SUM(weight)`；无权重=0 | REAL-TIME | UNKNOWN（未见 DataScope） | 项目计划、进度卡片 | supervision | GAP（前后端双实现） |
| B-26 | 监造逾期/到期健康度 | 计划任务延期、临期、风险及健康率 | supervision | `plannedEndAt,status,progressPercent,weight` | `supervision-deadline-board.service.ts`；`DeadlineBoard.vue` | 延期/临期/风险计数；`healthyPercent=healthy/total*100`；风险阈值为实际进度 < 时间期望进度×0.7 | REAL-TIME | UNKNOWN（未见 DataScope） | DeadlineBoard | supervision | GAP（定义未固化） |
| B-27 | 归档及时率 | 要求归档项中已归档比例 | report/inspection-archive | `inspection_archive_tasks.status,dueAt`；template existence | `report-daily-summary.service.ts#buildArchiveStats` | `archivedCount/requiredCount*100` | DAILY/REAL-TIME | ANALYTICS/SELF | Daily report page | report | GAP（未进入 registry） |
| B-28 | 计量器具状态概览 | 器具总数、有效、过期、临期、停用 | metrology | `measuring_instruments.status,calibrationDueDate,isDeleted` | `metrology.service.ts#getOverview` | `COUNT` by validity/status buckets | REAL-TIME | RBAC/ROW_SCOPE GAP | `/qms/metrology/overview`、概览卡片 | metrology | GAP |
| B-29 | 检定计划概览 | 检定计划总数、完成、逾期、本月、临期及月分布 | metrology | `metrology_calibration_plans.status,dueDate,isDeleted` | `metrology-calibration-plan-query.service.ts#getOverview` | `COUNT` by status/time bucket；月度 `GROUP BY` | REAL-TIME | RBAC/ROW_SCOPE GAP | calibration plan overview | metrology | GAP |
| B-30 | 器具借用概览 | 借用、逾期、今日借还、待归还及月分布 | metrology | `metrology_borrow_records.status,borrowedAt,dueAt,returnedAt` | `metrology-borrow-query.service.ts#getOverview` | `COUNT` by loan/return/overdue/time bucket | REAL-TIME | RBAC/ROW_SCOPE GAP | borrow overview、metrology cards | metrology | GAP |

## C. 技术指标

| Metric ID | Metric Name | Business Meaning | Domain | Source Tables / Fields | Calculation Location | Formula | Refresh Type | Permission Scope | Current Consumers | Owner | Version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | 合格率投影新鲜度 | 投影代次是否覆盖事实表及变更边界 | report/ops | `pass_rate_projection_refresh_jobs`、projection rows、`inspections.count` | `pass-rate-projection-query.service.ts#getPassRateProjectionFreshness` | row counts/updatedAt/createdAt/ID watermark comparison | REAL-TIME | SYSTEM/ALL | projection rollout status、feature gate | report | GAP（M-A06） |
| C-02 | 供应商月度快照新鲜度 | 月度评分快照是否完成全量刷新 | supplier/ops | `supplier_score_snapshots.calculatedAt, scoringModel` | `supplier/cron/monthly-snapshot.ts`；reconciliation service | processed supplier count / eligible supplier count | MONTHLY | SYSTEM | release maintenance、供应商列表 | supplier | V4 model; freshness version GAP（M-E02） |
| C-03 | 文件存储统计 | 文件资产数量、字节数和 provider/type 分布 | file-storage | `file_assets.size,status,provider,mimeType` | `file-asset-query.ts#getFileStorageStats` | `COUNT`、`SUM(size)`、`GROUP BY` | REAL-TIME | ANALYTICS/\* | FileStorageStatsCards、ops | file-storage | GAP（M-G04） |
| C-04 | 指标刷新队列健康度 | 派生指标任务待处理、失败、重试和租约状态 | metric-refresh | `metric_refresh_jobs.status, metricType, attempts, availableAt, leaseUntil` | `metric-refresh-queue.service.ts#countOutstanding* / claim* / fail*` | outstanding count、failed count、attempt histogram | EVENTUAL | SYSTEM | release gate、worker logs | metric-refresh | GAP |
| C-05 | 质量损失索引 Worker 追平度 | 源事实到 `quality_loss_index` 的处理积压 | quality-loss/ops | `quality_loss_index_jobs.status, attempts, source` | `quality-loss-index-worker.service.ts#drain` | pending/failed/completed job count；未形成 API 指标 | EVENTUAL | SYSTEM | worker/release maintenance | quality-loss | GAP |
| C-06 | 供应商评分 Worker 追平度 | 源变更到 supplier snapshot 的处理积压 | supplier/ops | `metric_refresh_jobs.metricType=SUPPLIER_SCORE,status` | `supplier-score-worker.service.ts#drain` | outstanding/processed/failed jobs | EVENTUAL | SYSTEM | worker/reconciliation | supplier | V4 model; queue metric GAP |
| C-07 | Dashboard 缓存年龄 | 看板统计/趋势数据距上次计算的时间 | dashboard/ops | in-memory cache `expiresAt`（无持久来源表） | `dashboard.service.ts#getCachedDashboardStats/getCachedDashboardTrend` | `expiresAt-now`; TTL 60s/3600s | REAL-TIME cache | ANALYTICS/\* | dashboard service only | dashboard | GAP（未暴露为业务指标） |

## D. 临时分析指标

| Metric ID | Metric Name | Business Meaning | Domain | Source Tables / Fields | Calculation Location | Formula | Refresh Type | Permission Scope | Current Consumers | Owner | Version |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | 车辆故障人工月度覆盖值 | 运营人员对自动车辆故障数/保修车辆数的手工覆盖 | report/vehicle | `system_settings` JSON keys for month/count/warrantyVehicleCount | `vehicle-failure-rate-manual.service.ts`；manual POST service | manual value replaces automatic monthly series | MANUAL | SYSTEM/REPORT_EDIT | VehicleFailureChart | UNKNOWN | GAP |
| D-02 | 自定义售后图表指标 | 用户自定义图表选择的 count/cost/closed 等分析维度 | after-sales/web | API chart aggregation response + user preference | `views/qms/after-sales/composables/useChartAggregation.ts`、CustomChartBuilderModal | selected `metric` passed to backend; semantics depend on chart config | REAL-TIME | ANALYTICS/\* | AfterSalesCharts | UNKNOWN | GAP |
| D-03 | 报表环比趋势变化 | 报表卡片展示的相对上期变化百分比 | report/web | current/previous metric values from report summary | `report-summary.service.ts#calculateTrend` | `(current-previous)/previous*100`；损失类取反 | PRESENTATION | ANALYTICS/\* | Weekly/Monthly report cards | UNKNOWN | GAP |
| D-04 | 缺陷排名相对条宽 | 报表页面将 TOP 缺陷绘制为相对最大值的进度条 | web report | `QualityReportSummary.defects[].value` | `views/qms/reports/MonthlyReportContent.vue` | `value/max(top.value)*100`；仅视觉比例，不是经营 KPI | PRESENTATION | ANALYTICS/\* | MonthlyReportContent | UNKNOWN | GAP |
| D-05 | 工序目标状态色 | Dashboard 用固定阈值给合格率卡片着色 | web dashboard | `passRate` + local constants | `views/qms/dashboard/index.vue:49-56,440-451` | `>=98 green; >=95 orange; else red`；未使用 A-04 的 `targetPassRate` | PRESENTATION | ANALYTICS/\* | Dashboard status color | UNKNOWN | GAP |
| D-06 | 报表总质量损失 | 月报把制造损失和售后损失相加的展示值 | web report | `QualityReportSummary.metrics[1..2]` | `views/qms/reports/MonthlyReportContent.vue:86-94` | `totalLoss=internalLoss+externalLoss`；依赖数组位置，无稳定 Metric ID | PRESENTATION | ANALYTICS/\* | MonthlyReportContent | UNKNOWN | GAP |
| D-07 | 平均每日报检量 | 选定统计窗口内的日均报检提交量 | web inspection | `todaySubmittedCount`, `dailyTrend.length` | `views/qms/inspection/dashboard/index.vue:169-173` | `periodSubmittedCount/dailyTrendDays`；当前字段命名为 today | PRESENTATION | ANALYTICS/\* | Inspection dashboard | inspection | GAP |

## 资产数量汇总

| 分类 | 数量 | 说明 |
| --- | --: | --- |
| A 核心经营指标 | 21 | 包含已有 registry 核心族与报表派生 KPI |
| B 过程指标 | 30 | 包含统计、趋势、任务、复检、完成、及时性、风险和计量过程指标 |
| C 技术指标 | 7 | 队列、Worker、投影、缓存和文件存储运行指标 |
| D 临时分析指标 | 7 | 人工覆盖、可配置图表和前端展示派生值 |
| **总指标资产** | **65** | 41 个已有 `metrics-registry` 资产族 + 24 个 PHASE-0 新识别/拆分资产 |

## 证据索引（关键计算点）

- 合格率及投影：`apps/backend/modules/report/pass-rate.ts`、`pass-rate-rows.ts`、`pass-rate-issue-summary.service.ts`、`pass-rate-projection-query.service.ts`。
- Dashboard 自算：`apps/backend/modules/dashboard/dashboard.service.ts:259-289` 重新按月累加 pass/total 并计算 `passRate`；这与 A-01/A-03 形成重复实现。
- 质量损失追偿率：`apps/backend/modules/quality-loss/quality-loss-summary.service.ts:14-57`。
- 报表结案率/内部损失/外部损失：`apps/backend/modules/report/report-summary.service.ts:161-193`。
- 复检率：`apps/backend/modules/inspection/inspection-request-stats-identity.ts:103-131`。
- 工单完成率：`apps/backend/modules/work-order/work-order-aggregate.service.ts:339-351`。
- 供应商评分模型和权重：`apps/backend/modules/supplier/supplier-scoring.ts:7-12,94-179,220-292`。
- 焊工扣分：`packages/qgs-shared/src/domain-modules/qms/welder-score.ts:11-20` 与 `apps/backend/modules/welder/welder-score-refresh.service.ts`。
- 归档及时率：`apps/backend/modules/report/report-daily-summary.service.ts:328-341`。
- 车辆强度：`apps/backend/modules/report/vehicle-failure-rate.service.ts:192-206,343-366`。
- 指标队列：`apps/backend/modules/metric-refresh/metric-refresh-queue.service.ts`、`apps/backend/modules/quality-loss/quality-loss-index-worker.service.ts`、`apps/backend/modules/supplier/supplier-score-worker.service.ts`。
- 共享 DTO：`packages/qgs-shared/src/modules/qms/dashboard.ts`、`reports.ts`、`work-order.ts`、`supplier.ts`、`after-sales.ts`。

## PHASE-0 结论

1. `apps/backend/utils/metrics-registry.ts` 的 41 个资产是聚合门禁登记，不覆盖所有业务 KPI；本普查补出了 24 个派生、过程、技术和临时资产。
2. 代码已经存在“同一指标的统一出口”建设（质量损失索引、合格率投影、供应商 V4 快照、报检统计预聚合），但治理元数据仍只有 `id/key/name/formula/source/owner/consumer/freshness`，缺少 Permission Scope、Owner 责任人、业务版本和生效日期。
3. Dashboard、Report 和前端组件仍有展示层重算（尤其 A-01/A-03 的月度合并、D-03/D-04），因此“后端已登记”不能视为“全链路单一口径”。

## PHASE-1 Registry 映射（2026-08-21）

PHASE-1 没有重算、替换或删除上表任何实现，只把其中优先级最高的 10 个资产建立为 Business Metric Governance Registry 的 `DRAFT` Definition。该 Registry 与 `docs/metrics-registry.md` / `utils/metrics-registry.ts` 的技术聚合登记分离：前者管理业务 Code、版本、Owner、冲突和生效；后者继续管理聚合实现点与 B-MF 门禁。

| PHASE-0 资产 | Business Metric Code | 分类 | Definition v1 | Conflict Status | Owner | Canonical Status |
| --- | --- | --- | --- | --- | --- | --- |
| A-01/A-02/A-03/A-04/A-15 | `BM-PASS-RATE` | A | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 未选择最终公式 |
| A-06/A-07/A-08/A-18 | `BM-QUALITY-LOSS-TREND` | A | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 未选择最终公式 |
| A-17/B-11/B-12 | `BM-PROBLEM-CLOSURE-RATE` | A | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 未选择最终公式 |
| A-10/A-19 | `BM-AFTER-SALES-NET-LOSS` | A | DRAFT | CANONICAL_CANDIDATE | UNKNOWN / UNCONFIRMED | D1 候选，未激活 |
| A-12/A-13 | `BM-SUPPLIER-FINAL-SCORE` | A | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 双模型待业务决策 |
| B-22 | `BM-REINSPECTION-RATE` | B | DRAFT | CANONICAL_CANDIDATE | UNKNOWN / UNCONFIRMED | 后端率候选，未激活 |
| B-14/B-23/B-24 | `BM-WORK-ORDER-INSPECTION-COMPLETION` | B | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 点位率/数量率待拆分 |
| A-05/D-01 | `BM-VEHICLE-FAILURE-INTENSITY` | B | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 自动/人工来源待决 |
| B-27 | `BM-ARCHIVE-TIMELINESS` | B | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 分母与模板规则待决 |
| B-20 | `BM-DFMEA-RPN-RISK` | B | DRAFT | BUSINESS_DECISION_REQUIRED | UNKNOWN / UNCONFIRMED | 风险阈值待决 |

首批以外的 55 个资产保持 PHASE-0 清单状态，不会因为未入库而被自动废弃。C 类技术指标与 D 类临时分析指标进入第二批评审：它们需要先判断是 Observability/Analysis Registry，还是可升级为业务指标，不能直接混入 A/B 的经营定义。

完整的 Canonical Definition Sheet、生命周期、DataScope 边界、审计和 bootstrap 规则见 [metric-registry.md](./metric-registry.md)。
