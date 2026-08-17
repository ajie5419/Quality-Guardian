// Metric registry — single source of truth for aggregation metrics.
// Contract: docs/metrics-registry.md (human-readable dictionary with Chinese
// definitions). Gate B-MF (scripts/check-metric-registration.mjs) enforces that
// every new aggregation in backend code is registered here.
//
// Family prefixes:
//   A  pass-rate (report)      B  quality-loss (three sources)
//   C  after-sales             D  inspection
//   E  supplier score          F  dashboard/workspace
//   G  other domains

export type MetricOwner =
  | 'after-sales'
  | 'dashboard'
  | 'file-storage'
  | 'inspection'
  | 'planning'
  | 'quality-loss'
  | 'report'
  | 'supervision'
  | 'supplier'
  | 'task-dispatch'
  | 'user'
  | 'vehicle-commissioning'
  | 'welder'
  | 'work-order';

export type MetricFreshness = 'daily' | 'monthly' | 'projected' | 'real-time';

export interface MetricRegistration {
  /** Stable metric id, e.g. 'M-A01'. Must match docs/metrics-registry.md table. */
  id: string;
  /** Camel-case metric key used in code. */
  key: string;
  /** Chinese business name. */
  name: string;
  /** Business definition (Chinese). */
  definition: string;
  /** Calculation formula / aggregation rule. */
  formula: string;
  /** Source tables involved. */
  sourceTable: string;
  /** Owning module. */
  owner: MetricOwner;
  /** Consumer endpoints/services. */
  consumers: string;
  /** Data freshness. */
  freshness: MetricFreshness;
}

export const METRIC_REGISTRY: MetricRegistration[] = [
  // ---- A. 合格率族（report 模块） ----
  {
    id: 'M-A01',
    key: 'netPassRate',
    name: '合格率（检验源，实时）',
    definition: '检验批次合格率：按检验数量与不合格数量计算净合格率。',
    formula:
      'passCount = SUM(quantity - unqualifiedQuantity 钳制)；passRate = passCount / SUM(quantity)',
    sourceTable: 'inspections',
    owner: 'report',
    consumers: 'GET /qms/pass-rate-trend；报表汇总 report-summary',
    freshness: 'real-time',
  },
  {
    id: 'M-A02',
    key: 'issuePassRate',
    name: '合格率（不合格品源）',
    definition:
      '以不合格品记录（quality_records）为源的合格率口径，用于对比校验。',
    formula:
      'unqualifiedCount = MIN(inspections SUM quantity, quality_records SUM quantity)；passRate = (total - unqualified) / total',
    sourceTable: 'inspections + quality_records',
    owner: 'report',
    consumers: 'pass-rate.ts getNetPassRateSummaryByRange(source=issue)',
    freshness: 'real-time',
  },
  {
    id: 'M-A03',
    key: 'projectedPassRate',
    name: '合格率（身份投影物化）',
    definition:
      '基于 pass_rate_process_identity_projection 物化表的合格率查询，身份口径统一后的正式口径。',
    formula: '投影表按过程/期间聚合；无活动代时回退 legacy 实时口径（M-A01）',
    sourceTable: 'pass_rate_process_identity_projection',
    owner: 'report',
    consumers: 'pass-rate-trend；报表汇总',
    freshness: 'projected',
  },
  {
    id: 'M-A04',
    key: 'passRateDrillDown',
    name: '合格率钻取（过程维度）',
    definition:
      '按过程/期间下钻的合格率明细，含 legacy 与投影两套实现（影子对账）。',
    formula:
      'getPassRateDrillDownByRange / getLegacyPassRateDrillDownByRange / getProjectedPassRateDrillDownByRange',
    sourceTable: 'inspections + quality_records / 投影表',
    owner: 'report',
    consumers: 'GET /qms/pass-rate-trend',
    freshness: 'projected',
  },
  {
    id: 'M-A05',
    key: 'issuePassRateSummary',
    name: '问题合格率汇总',
    definition:
      '合格率问题汇总（inspections+quality_records 双表聚合），pass-rate 的 issue 源实现。',
    formula: 'getIssuePassRateSummaryByRange',
    sourceTable: 'inspections + quality_records',
    owner: 'report',
    consumers: 'pass-rate.ts',
    freshness: 'real-time',
  },
  {
    id: 'M-A06',
    key: 'projectionFreshness',
    name: '合格率投影新鲜度',
    definition: '投影物化表的新鲜度/覆盖窗口监控指标。',
    formula: 'getPassRateProjectionFreshness（创建截止 + ID 截止）',
    sourceTable: 'pass_rate_projection_refresh_jobs + 投影表',
    owner: 'report',
    consumers: 'GET /system/pass-rate-projection/status',
    freshness: 'real-time',
  },
  {
    id: 'M-A07',
    key: 'vehicleFailureRate',
    name: '车辆故障率',
    definition: '车辆故障率（手工录入与计算口径）。',
    formula: 'vehicle-failure-rate.service（手动录入 + 计算）',
    sourceTable: 'vehicle_failure_rate（手动）',
    owner: 'report',
    consumers: '报表中心',
    freshness: 'real-time',
  },

  // ---- B. 质量损失族（quality-loss 模块，三源） ----
  {
    id: 'M-B01',
    key: 'qualityLossTotal',
    name: '质量损失总量/周量（手工台账源）',
    definition:
      '质量损失看板金额：年度累计与本周金额（quality_losses 手工台账表）。',
    formula:
      'SUM(amount) WHERE occurDate >= yearStart / weekStart AND isDeleted = false',
    sourceTable: 'quality_losses',
    owner: 'quality-loss',
    consumers: 'GET /qms/quality-loss/dashboard',
    freshness: 'real-time',
  },
  {
    id: 'M-B02',
    key: 'manualLoss',
    name: '报告周期手工损失',
    definition: '报表周期内手工台账质量损失金额（内部损失组成部分）。',
    formula: 'SUM(amount) WHERE occurDate in [start,end] AND isDeleted = false',
    sourceTable: 'quality_losses',
    owner: 'quality-loss',
    consumers: 'GET /qms/reports/summary（internalLoss = 检验 + manualLoss）',
    freshness: 'real-time',
  },
  {
    id: 'M-B03',
    key: 'qualityLossTrend',
    name: '质量损失趋势（三源合并）',
    definition:
      '按周/月聚合的质量损失金额趋势，合并检验、售后、车辆三源。**统一口径（2026-08-17 业务确认）：lossAmount > 0 OR isClaim = true**。',
    formula:
      'quality-loss.service mergeTrendData(getQualityLossTrendRows × 3 源)',
    sourceTable: 'quality_records + after_sales + vehicle_commissioning_issues',
    owner: 'quality-loss',
    consumers: 'GET /qms/quality-loss/charts',
    freshness: 'real-time',
  },
  {
    id: 'M-B04',
    key: 'qualityLossDrillDown',
    name: '质量损失钻取（三源）',
    definition: '质量损失明细钻取，合并三源记录。',
    formula: 'getQualityLossDrillDownRecords × 3 源（阶段 2 收敛为统一出口）',
    sourceTable: 'quality_records + after_sales + vehicle_commissioning_issues',
    owner: 'quality-loss',
    consumers: 'GET /qms/quality-loss/charts（钻取）',
    freshness: 'real-time',
  },
  {
    id: 'M-B05',
    key: 'lossRecordsAggregation',
    name: '损失记录分页聚合（三源适配）',
    definition:
      '损失记录列表/计数（工单号过滤 + 分页）。**阶段 2 收敛对象**：三模块同构实现统一为 quality-loss 出口 + 数据源适配。',
    formula:
      'getLossRecordsForAggregation / countLossRecordsForAggregation；统一口径 lossAmount > 0 OR isClaim = true',
    sourceTable: 'quality_records + after_sales + vehicle_commissioning_issues',
    owner: 'quality-loss',
    consumers: '质量损失列表/导出',
    freshness: 'real-time',
  },
  {
    id: 'M-B06',
    key: 'qualityLossDashboard',
    name: '质量损失看板汇总',
    definition: '看板页汇总（含趋势与分布），getDashboardSummary。',
    formula: 'QualityLossService.getDashboardSummary',
    sourceTable: 'quality_losses + 三源',
    owner: 'quality-loss',
    consumers: 'GET /qms/quality-loss/dashboard',
    freshness: 'real-time',
  },

  // ---- C. 售后族（after-sales 模块） ----
  {
    id: 'M-C01',
    key: 'afterSalesKpi',
    name: '售后 KPI（总数/费用/未关闭/平均处理天数）',
    definition:
      '售后统计页 KPI：单量、材料费、人工差旅费、未关闭数、平均处理天数。',
    formula:
      '_count/_sum(materialCost+laborTravelCost)/AVG(DATEDIFF(closeDate, occurDate))',
    sourceTable: 'after_sales',
    owner: 'after-sales',
    consumers: 'GET /qms/after-sales/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-C02',
    key: 'afterSalesDefectDistribution',
    name: '售后缺陷分类分布',
    definition: '按缺陷分类聚合的售后单量分布。',
    formula: 'groupBy(defectCategoryId + 身份快照字段)',
    sourceTable: 'after_sales',
    owner: 'after-sales',
    consumers: 'GET /qms/after-sales/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-C03',
    key: 'afterSalesSupplierDistribution',
    name: '售后供应商分布',
    definition: '按供应商品牌聚合的售后单量分布。',
    formula: 'groupBy(supplierBrandId + 身份快照字段)',
    sourceTable: 'after_sales',
    owner: 'after-sales',
    consumers: 'GET /qms/after-sales/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-C04',
    key: 'afterSalesDeptDistribution',
    name: '售后部门分布',
    definition: '按责任部门聚合的售后单量分布。',
    formula: 'groupBy(respDeptId + 身份快照字段)',
    sourceTable: 'after_sales',
    owner: 'after-sales',
    consumers: 'GET /qms/after-sales/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-C05',
    key: 'afterSalesChartAggregation',
    name: '售后图表聚合（月度/排名）',
    definition: '售后图表：按月聚合指标、Top 排名（维度：缺陷/供应商/部门）。',
    formula:
      'after-sales-chart-aggregation.getChartAggregation + getReportMonthAggregation',
    sourceTable: 'after_sales',
    owner: 'after-sales',
    consumers: 'GET /qms/after-sales/chart-aggregate',
    freshness: 'real-time',
  },
  {
    id: 'M-C06',
    key: 'afterSalesReportPeriodMetrics',
    name: '售后报告周期指标',
    definition:
      '报表周期内的售后净损失（外部损失 KPI = 总成本 - 已回收索赔）。',
    formula: 'getReportPeriodMetrics（after-sales-integration.service:246）',
    sourceTable: 'after_sales',
    owner: 'after-sales',
    consumers: 'GET /qms/reports/summary（externalLoss = netLoss）',
    freshness: 'real-time',
  },

  // ---- D. 检验族（inspection 模块） ----
  {
    id: 'M-D01',
    key: 'inspectionReportStatistics',
    name: '检验报告统计（缺陷分布/风险项目/供应商绩效）',
    definition:
      '检验报告统计页：缺陷分布、Top 风险项目、供应商绩效（quality_records 三维度聚合）。',
    formula:
      'inspection-report-statistics：getDefectDistribution / getTopRiskProjects / getSupplierPerformance',
    sourceTable: 'quality_records',
    owner: 'inspection',
    consumers: '检验报告统计页（经 inspection-reporting 编排）',
    freshness: 'real-time',
  },
  {
    id: 'M-D02',
    key: 'inspectionIssueStats',
    name: '不合格品项统计（总数/损失/关闭率/类型分布）',
    definition: '不合格品页统计：总项数、损失金额、关闭率、按缺陷类型分布。',
    formula:
      'aggregate(_count/_sum lossAmount) + count(closed) + groupBy(defectCategoryId)',
    sourceTable: 'quality_records',
    owner: 'inspection',
    consumers: 'GET /qms/inspection/issues/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-D03',
    key: 'inspectionIssueChartAggregate',
    name: '不合格品图表聚合（count/lossAmount/quantity）',
    definition: '不合格品图表：按维度聚合计数/损失/数量三类指标。',
    formula:
      'inspection-issue-chart-aggregate（metric: count | lossAmount | quantity）',
    sourceTable: 'quality_records',
    owner: 'inspection',
    consumers: 'GET /qms/inspection/issues/chart-aggregate',
    freshness: 'real-time',
  },
  {
    id: 'M-D04',
    key: 'inspectionRequestStats',
    name: '报检任务统计（检验员在办/完成/平均时长/排行）',
    definition:
      '检验员工作负载与排行：在办任务数、完成任务数、总/平均任务时长。',
    formula: 'inspection-request-stats（JS 聚合，CLOSED + closedAt 区间规则）',
    sourceTable: 'qms_inspection_requests',
    owner: 'inspection',
    consumers:
      'GET /qms/inspection/requests/stats；用户管理在办量（阶段 3 收敛）',
    freshness: 'real-time',
  },
  {
    id: 'M-D05',
    key: 'workspaceIssueSummary',
    name: '工作台问题汇总',
    definition: '工作台当日问题汇总（inspection 源）。',
    formula: 'getWorkspaceIssueSummary',
    sourceTable: 'quality_records + inspections',
    owner: 'inspection',
    consumers: 'GET /qms/dashboard',
    freshness: 'real-time',
  },
  {
    id: 'M-D06',
    key: 'inspectionReportPeriodMetrics',
    name: '检验报告周期指标（新问题/关闭/内部损失）',
    definition:
      '报表周期内检验侧指标：新问题数、关闭数、内部损失（内部损失 KPI 组成）。',
    formula: 'getReportPeriodMetrics（inspection-reporting:350）',
    sourceTable: 'quality_records',
    owner: 'inspection',
    consumers: 'GET /qms/reports/summary（internalLoss 组成）',
    freshness: 'real-time',
  },
  {
    id: 'M-D07',
    key: 'qualityLossTrendInspectionSource',
    name: '质量损失趋势（检验源）',
    definition: '按周/月聚合检验侧损失金额（M-B03 的三源之一）。',
    formula:
      'raw SQL：SUM(lossAmount) GROUP BY WEEK/MONTH(date)（inspection-reporting:43）',
    sourceTable: 'quality_records',
    owner: 'inspection',
    consumers: 'quality-loss 趋势合并',
    freshness: 'real-time',
  },

  // ---- E. 供应商族（supplier 模块） ----
  {
    id: 'M-E01',
    key: 'supplierScoreSnapshot',
    name: '供应商评分快照（进料/工程/售后分与损失）',
    definition:
      '供应商评分快照：进料合格率、进料/工程/售后评分、批次与数量、各类损失金额。',
    formula:
      'supplier-score-snapshot.service（scoreSupplierListItem + 快照落库 supplier_score_snapshots）',
    sourceTable:
      'supplier_score_snapshots + inspections + after_sales + quality_records',
    owner: 'supplier',
    consumers: '供应商列表评分列；月度快照 cron',
    freshness: 'projected',
  },
  {
    id: 'M-E02',
    key: 'supplierMonthlySnapshot',
    name: '供应商月度评分快照（cron）',
    definition: '每月 1 日 02:00 全量评分快照任务。',
    formula: 'cron/monthly-snapshot.ts（cronExpr 0 2 1 * *）',
    sourceTable: '全量供应商评分',
    owner: 'supplier',
    consumers: '月度快照留存',
    freshness: 'monthly',
  },
  {
    id: 'M-E03',
    key: 'supplierScoreAggregate',
    name: '供应商快照聚合统计',
    definition: '供应商列表侧的快照聚合（平均分等）。',
    formula: 'supplier.service:150 aggregate(supplier_score_snapshots)',
    sourceTable: 'supplier_score_snapshots',
    owner: 'supplier',
    consumers: '供应商列表',
    freshness: 'real-time',
  },

  // ---- F. 工作台族（dashboard） ----
  {
    id: 'M-F01',
    key: 'dashboardOverview',
    name: '工作台概览（售后/检验+车辆/损失/工单）',
    definition:
      '工作台顶部 KPI：售后单量、检验与车辆单量、质量损失合计、工单量。',
    formula:
      'dashboard.service getStats：afterSales.total + inspection+commissioning + 三源损失合计 + workOrder.total',
    sourceTable:
      'after_sales + inspections + quality_records + vehicle_commissioning_issues + quality_losses + work_orders',
    owner: 'dashboard',
    consumers: 'GET /qms/dashboard（5 个页面复用）',
    freshness: 'real-time',
  },
  {
    id: 'M-F02',
    key: 'monthlyQualityTrend',
    name: '月度质量趋势',
    definition: '工作台月度质量趋势（按月聚合）。',
    formula: 'dashboard.service getMonthlyTrend',
    sourceTable: 'inspections + quality_records',
    owner: 'dashboard',
    consumers: 'GET /qms/dashboard',
    freshness: 'real-time',
  },
  {
    id: 'M-F03',
    key: 'issueDistribution',
    name: '问题分布（工作台）',
    definition: '工作台问题类型分布。',
    formula:
      'dashboard.service getIssueDistribution（经 InspectionService.getStatsForDashboard）',
    sourceTable: 'quality_records',
    owner: 'dashboard',
    consumers: 'GET /qms/dashboard',
    freshness: 'real-time',
  },
  {
    id: 'M-F04',
    key: 'dashboardTargets',
    name: '工作台目标值（KPI 目标）',
    definition: '工作台目标值配置与读取。',
    formula: 'dashboard-targets（get/post）',
    sourceTable: 'dashboard_targets（配置表）',
    owner: 'dashboard',
    consumers: 'GET /qms/dashboard/targets',
    freshness: 'real-time',
  },
  {
    id: 'M-F05',
    key: 'workOrderAggregate',
    name: '工作台工单聚合（身份+统计）',
    definition: '工作台工单聚合：身份归一 + 统计汇总。',
    formula: 'work-order-aggregate.service（+ work-order-aggregate-identity）',
    sourceTable: 'work_orders + 关联表',
    owner: 'work-order',
    consumers: 'GET /qms/workspace/work-order-aggregate',
    freshness: 'real-time',
  },

  // ---- G. 其他族 ----
  {
    id: 'M-G01',
    key: 'welderScoreStats',
    name: '焊工评分统计',
    definition:
      '焊工评分统计（**阶段 4 从 inspection-reporting 迁回 welder 域**）。',
    formula: 'getWelderScoreStats（inspection-reporting:403）',
    sourceTable: 'welders + welder_score',
    owner: 'welder',
    consumers: '焊工评分页面/工作台',
    freshness: 'real-time',
  },
  {
    id: 'M-G02',
    key: 'workOrderStats',
    name: '工单统计',
    definition: '工单列表统计（按状态等维度）。',
    formula: 'work-order.service:249 aggregate(work_orders)',
    sourceTable: 'work_orders',
    owner: 'work-order',
    consumers: 'GET /qms/work-order/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-G03',
    key: 'taskDispatchStats',
    name: '派发任务统计',
    definition: '任务派发统计（按状态/人员）。',
    formula: 'TaskDispatchService.stats',
    sourceTable: 'qms_task_dispatches',
    owner: 'task-dispatch',
    consumers: 'GET /qms/task-dispatch/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-G04',
    key: 'fileStorageStats',
    name: '文件存储统计（总数/占用/类型分布）',
    definition: '文件存储统计：资产总数、占用空间、按类型分布。',
    formula: 'file-asset-query:71-91（aggregate ×2 + groupBy ×2）',
    sourceTable: 'file_assets',
    owner: 'file-storage',
    consumers: 'GET /files/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-G05',
    key: 'vehicleDailyReport',
    name: '车辆每日报告（问题汇总）',
    definition: '车辆每日报告：当日问题汇总（含索赔/损失）落库 daily_reports。',
    formula:
      'vehicle-commissioning.service:125-143 aggregate(vehicle_commissioning_issues)',
    sourceTable: 'vehicle_commissioning_issues → daily_reports',
    owner: 'vehicle-commissioning',
    consumers: '车辆日报列表/详情',
    freshness: 'daily',
  },
  {
    id: 'M-G06',
    key: 'supervisionProjectStats',
    name: '监造项目统计（问题/日报）',
    definition: '监造项目：问题与日报按状态/时间聚合。',
    formula:
      'supervision-project.service:132,137 groupBy(supervision_issues / supervision_daily_reports)',
    sourceTable: 'supervision_issues + supervision_daily_reports',
    owner: 'supervision',
    consumers: '监造项目详情页',
    freshness: 'real-time',
  },
  {
    id: 'M-G07',
    key: 'dfmeaRpnStats',
    name: 'DFMEA 项目 RPN 统计',
    definition:
      'DFMEA 项目风险统计：RPN 均值/最大值、高中低风险计数（JS 内存聚合，数据量小）。',
    formula:
      'stats.get.service.ts：findMany 后 reduce（avg/max/high/medium/low 计数）',
    sourceTable: 'dfmea',
    owner: 'planning',
    consumers: 'GET /qms/planning/dfmea/projects/[id]/stats',
    freshness: 'real-time',
  },
  {
    id: 'M-G08',
    key: 'userInspectorWorkload',
    name: '检验员在办量（用户管理）',
    definition:
      '用户管理页检验员在办任务数（**阶段 3 收敛为调用 M-D04 排行出口**）。',
    formula:
      'user.service:136 groupBy(qms_inspection_requests, inspectorId, 状态 DISPATCHED/INSPECTING)',
    sourceTable: 'qms_inspection_requests',
    owner: 'user',
    consumers: '用户管理列表（在办量列）',
    freshness: 'real-time',
  },
];

export const METRIC_REGISTRY_BY_ID = new Map(
  METRIC_REGISTRY.map((metric) => [metric.id, metric]),
);
