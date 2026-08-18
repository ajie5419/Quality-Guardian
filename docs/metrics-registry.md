# 指标字典（Metrics Registry）

> 权威文档：2026-08-17 成文。**一个指标，全世界只有一个定义**。任何聚合（groupBy / aggregate / 含聚合的 SQL）必须先查本字典：已存在则复用，不存在则登记后再写代码。代码版登记表（门禁输入，必须与本文档一致）：`apps/backend/utils/metrics-registry.ts`。门禁：B-MF（scripts/check-metric-registration.mjs）——新增聚合未登记即拦截（2026-08-17 立项，随阶段 1 落地）。关联：docs/data-contract.md（字段级治理）、apps/backend/utils/master-data-fields.ts（字段治理登记）。

---

## 1. 治理规则

1. **新增聚合必须登记**：新增 `groupBy(` / `.aggregate(` / 含 `SUM|COUNT|GROUP BY` 的 `$queryRaw`，须在本字典登记并同步代码版登记表，否则 B-MF 门禁拦截。
2. **同名指标禁止第二实现**：先查字典，已存在即复用（跨模块走对方模块 index.ts 出口）。
3. **口径修改必须走对账**：修改已登记指标的口径，先与旧口径影子对比（参考 pass-rate 投影对账先例），并在本字典更新 formula。
4. **字段治理优先**：聚合涉及的受控字段先满足 docs/data-contract.md（canonical ID 聚合，B-ID8/B-ID9）。
5. **登记字段**：id / key / 名称 / 业务定义 / 口径 / 来源表 / 负责模块 / 消费接口 / 时效。

## 2. 指标总览

| 族         | 编号段        | 指标数 | 负责模块               |
| ---------- | ------------- | ------ | ---------------------- |
| A 合格率   | M-A01 ~ M-A07 | 7      | report                 |
| B 质量损失 | M-B01 ~ M-B06 | 6      | quality-loss           |
| C 售后     | M-C01 ~ M-C06 | 6      | after-sales            |
| D 检验     | M-D01 ~ M-D06 | 6      | inspection             |
| E 供应商   | M-E01 ~ M-E03 | 3      | supplier               |
| F 工作台   | M-F01 ~ M-F05 | 5      | dashboard / work-order |
| G 其他     | M-G01 ~ M-G08 | 8      | 各域                   |

**合计 41 个登记指标**（覆盖 51 处聚合点的全部聚合函数；同名聚合函数如 M-B03/M-B04/M-B05 为多源适配，由阶段 2 收敛）。

## 3. 指标明细

### A. 合格率族（report 模块）

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-A01 | netPassRate | 合格率（检验源，实时） | passCount=SUM(quantity−unqualifiedQuantity 钳制)；passRate=passCount/SUM(quantity) | inspections | /qms/pass-rate-trend；报表汇总 | 实时 |
| M-A02 | issuePassRate | 合格率（不合格品源） | unqualified=MIN(检验 SUM quantity, 记录 SUM quantity)；passRate=(total−unqualified)/total | inspections+quality_records | pass-rate.ts issue 源 | 实时 |
| M-A03 | projectedPassRate | 合格率（身份投影物化） | 投影表按过程/期间聚合；无活动代回退 M-A01 | pass_rate_process_identity_projection | pass-rate-trend；报表汇总 | 物化 |
| M-A04 | passRateDrillDown | 合格率钻取（过程维度） | getPassRateDrillDownByRange / legacy / projected 三实现（影子对账） | inspections+quality_records/投影表 | /qms/pass-rate-trend | 实时/物化 |
| M-A05 | issuePassRateSummary | 问题合格率汇总 | getIssuePassRateSummaryByRange（双表聚合） | inspections+quality_records | pass-rate.ts | 实时 |
| M-A06 | projectionFreshness | 合格率投影新鲜度 | getPassRateProjectionFreshness（创建截止+ID 截止） | 投影刷新任务表+投影表 | /system/pass-rate-projection/status | 实时 |
| M-A07 | vehicleFailureRate | 车辆故障率 | 手工录入 + 计算 | 车辆故障率录入 | 报表中心 | 实时 |

### B. 质量损失族（quality-loss 模块，三源）

> **统一口径（2026-08-17 业务确认）：`lossAmount > 0 OR isClaim = true`**——阶段 2 将三源同构实现收敛为统一出口。

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-B01 | qualityLossTotal | 损失总量/周量（手工台账） | SUM(amount) WHERE occurDate≥yearStart/weekStart | quality_losses | /qms/quality-loss/dashboard | 实时 |
| M-B02 | manualLoss | 报告周期手工损失 | SUM(amount) WHERE occurDate∈[start,end] | quality_losses | /qms/reports/summary（internalLoss 组成） | 实时 |
| M-B03 | qualityLossTrend | 损失趋势（统一出口） | **getTrendData 查 quality_loss_index 按 source 分组**（四源口径写入时统一，2026-08-17 三源直查函数退役） | quality_loss_index | /qms/quality-loss/charts | 实时 |
| M-B04 | qualityLossDrillDown | 损失钻取（统一出口） | getDrillDown 查 quality_loss_index | quality_loss_index | charts 钻取 | 实时 |
| M-B05 | lossRecordsAggregation | 损失记录分页聚合（统一出口） | getAllLosses 查 quality_loss_index；口径 lossAmount>0 OR isClaim=true | quality_loss_index | 损失列表/导出 | 实时 |
| M-B06 | qualityLossDashboard | 质量损失看板汇总 | getDashboardSummary | quality_losses+三源 | /qms/quality-loss/dashboard | 实时 |

### C. 售后族（after-sales 模块）

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-C01 | afterSalesKpi | 售后 KPI（总数/费用/未关闭/平均处理天数） | \_count/\_sum(materialCost+laborTravelCost)/AVG(DATEDIFF(closeDate,occurDate)) | after_sales | /qms/after-sales/stats | 实时 |
| M-C02 | afterSalesDefectDistribution | 售后缺陷分类分布 | groupBy(defectCategoryId+身份快照) | after_sales | /qms/after-sales/stats | 实时 |
| M-C03 | afterSalesSupplierDistribution | 售后供应商分布 | groupBy(supplierBrandId+身份快照) | after_sales | /qms/after-sales/stats | 实时 |
| M-C04 | afterSalesDeptDistribution | 售后部门分布 | groupBy(respDeptId+身份快照) | after_sales | /qms/after-sales/stats | 实时 |
| M-C05 | afterSalesChartAggregation | 售后图表聚合（月度/排名） | getChartAggregation + getReportMonthAggregation | after_sales | /qms/after-sales/chart-aggregate | 实时 |
| M-C06 | afterSalesReportPeriodMetrics | 售后报告周期指标 | getReportPeriodMetrics（netLoss=总成本−已回收索赔） | after_sales | /qms/reports/summary（externalLoss） | 实时 |

### D. 检验族（inspection 模块）

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-D01 | inspectionReportStatistics | 检验报告统计（缺陷分布/风险项目/供应商绩效） | getDefectDistribution/getTopRiskProjects/getSupplierPerformance | quality_records | 检验报告统计页 | 实时 |
| M-D02 | inspectionIssueStats | 不合格品项统计（总数/损失/关闭率/类型分布） | aggregate(\_count/\_sum lossAmount)+count(closed)+groupBy(defectCategoryId) | quality_records | /qms/inspection/issues/stats | 实时 |
| M-D03 | inspectionIssueChartAggregate | 不合格品图表聚合 | metric: count/lossAmount/quantity | quality_records | /qms/inspection/issues/chart-aggregate | 实时 |
| M-D04 | inspectionRequestStats | 报检任务统计（检验员负载/排行） | JS 聚合；CLOSED+closedAt 区间规则 | qms_inspection_requests | /qms/inspection/requests/stats；用户管理在办量（阶段 3 收敛） | 实时 |
| M-D05 | workspaceIssueSummary | 工作台问题汇总 | getWorkspaceIssueSummary | quality_records+inspections | /qms/dashboard | 实时 |
| M-D06 | inspectionReportPeriodMetrics | 检验报告周期指标 | getReportPeriodMetrics（新问题/关闭/内部损失） | quality_records | /qms/reports/summary（internalLoss 组成） | 实时 |

### E. 供应商族（supplier 模块）

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-E01 | supplierScoreSnapshot | 供应商评分快照 | scoreSupplierListItem+快照落库 supplier_score_snapshots | 快照表+inspections+after_sales+quality_records | 供应商列表评分列 | 物化 |
| M-E02 | supplierMonthlySnapshot | 供应商月度评分快照（cron） | cron/monthly-snapshot.ts（每月 1 日 02:00） | 全量评分 | 月度快照留存 | 月度 |
| M-E03 | supplierScoreAggregate | 供应商快照聚合统计 | supplier.service:150 aggregate(快照表) | supplier_score_snapshots | 供应商列表 | 实时 |

### F. 工作台族（dashboard）

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-F01 | dashboardOverview | 工作台概览 | afterSales.total+inspection+commissioning+三源损失合计+workOrder.total | 6 张表 | /qms/dashboard（5 页复用） | 实时 |
| M-F02 | monthlyQualityTrend | 月度质量趋势 | getMonthlyTrend | inspections+quality_records | /qms/dashboard | 实时 |
| M-F03 | issueDistribution | 问题分布（工作台） | getIssueDistribution（经 getStatsForDashboard） | quality_records | /qms/dashboard | 实时 |
| M-F04 | dashboardTargets | 工作台目标值 | dashboard-targets get/post | 目标配置表 | /qms/dashboard/targets | 实时 |
| M-F05 | workOrderAggregate | 工作台工单聚合 | work-order-aggregate（身份归一+统计） | work_orders+关联 | /qms/workspace/work-order-aggregate | 实时 |

### G. 其他族

| ID | key | 名称 | 口径 | 来源表 | 消费 | 时效 |
| --- | --- | --- | --- | --- | --- | --- |
| M-G01 | welderScoreStats | 焊工评分统计 | getWelderScoreStats（阶段 4 迁回 welder 域） | welders+评分 | 焊工评分页/工作台 | 实时 |
| M-G02 | workOrderStats | 工单统计 | work-order.service:249 aggregate | work_orders | /qms/work-order/stats | 实时 |
| M-G03 | taskDispatchStats | 派发任务统计 | TaskDispatchService.stats | qms_task_dispatches | /qms/task-dispatch/stats | 实时 |
| M-G04 | fileStorageStats | 文件存储统计 | file-asset-query:71-91（aggregate×2+groupBy×2） | file_assets | /files/stats | 实时 |
| M-G05 | vehicleDailyReport | 车辆每日报告 | aggregate(issues) 落库 daily_reports | vehicle_commissioning_issues→daily_reports | 车辆日报 | 每日 |
| M-G06 | supervisionProjectStats | 监造项目统计 | supervision-project:132,137 groupBy | supervision_issues+日报 | 监造项目详情 | 实时 |
| M-G07 | dfmeaRpnStats | DFMEA RPN 统计 | findMany 后 JS reduce（avg/max/高中低计数） | dfmea | /qms/planning/dfmea/projects/[id]/stats | 实时 |
| M-G08 | userInspectorWorkload | 检验员在办量（用户管理） | **getInspectorActiveTaskCounts（inspection-request-stats 统一出口，2026-08-17 收敛完成）** | qms_inspection_requests | 用户管理列表 | 实时 |

## 4. 已知待收敛项（阶段 2/3/4）

| 项 | 现状 | 目标 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| ~~M-B03/M-B04/M-B05 三源同构实现~~ | **✅ 2026-08-17 完成**：getTrendData/getDrillDown/getAllLosses 统一走 quality_loss_index 物化表（口径写入时统一：Internal amount>0、External/Commissioning isClaim |  | amount>0、Manual amount>0）；三模块 12 个直查函数 + 转发链已删除 | — | 阶段 2 ✅ |
| ~~M-G08 排行双实现~~ | **✅ 2026-08-17 完成**：user.service 改调 inspection-request-stats 的 getInspectorActiveTaskCounts（统一出口） | — | 阶段 3 ✅ |
| ~~M-G01 跨域实现~~ | **✅ 2026-08-17 完成（判断修正）**：3 个函数数据源均为检验域表（inspections/quality_records），按模块自包含原则**留在 inspection 模块**，从 inspection-reporting.service.ts 拆出至 inspection-score-data.service.ts（报表中心文件 428→287 行） | — | 阶段 4 ✅ |

## 5. 维护说明

- 登记新指标：先在本文件加行（保持 ID 顺序），再同步 `apps/backend/utils/metrics-registry.ts`；两者不一致由 B-MF 门禁拦截。
- 修改口径：更新两处 formula，并附修改日期与原因。
- 指标废弃：从两处删除并标注 CHANGELOG。
