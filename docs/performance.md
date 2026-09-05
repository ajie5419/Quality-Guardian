# 性能基线（Performance Baseline）

> 权威文档：承载 PERF-QMS-001 统一性能模型的落地页。每个阶段完成后在此登记结论与实施范式；业务代码遵守本页规则，Architecture Guard（R-BOUNDED-READ）与 query-shape 测试强制增量不回归。

## 1. 统一 Bounded Read 原则（PERF-QMS-001 / PHASE-1A）

任何用户请求不得「DB 无界读取 → 内存后再判断数量是否过大」。必须：

- **Interactive List**：数据库层分页（`skip` + `take`），`count.where` 与 `findMany.where` 必须完全一致（同一 scoped where），pageSize 统一 cap `INTERACTIVE_PAGE_SIZE_MAX = 100`。
- **Export**：独立受控入口，走 `findAllForExport / getExportRows / getListForExport`，读取 `EXPORT_QUERY_TAKE = EXPORT_ROWS_MAX + 1` 行；返回 N+1 行即判定 `EXPORT_LIMIT_EXCEEDED`。**禁止**复用 `parsePagination()`（cap 100）处理 Export。
- **ListDTO**：列表禁止默认加载详情级 relation / 大 JSON / 未消费长文本；详情 API 保持完整。
- **Bound rows + Bound columns**：行数与列宽两个维度都受限。

统一契约（`apps/backend/utils/export-constants.ts`）：

| 常量                        | 值     | 语义                    |
| --------------------------- | ------ | ----------------------- |
| `INTERACTIVE_PAGE_SIZE_MAX` | 100    | 交互列表最大 pageSize   |
| `EXPORT_ROWS_MAX`           | 20_000 | 导出最大行数            |
| `EXPORT_QUERY_TAKE`         | 20_001 | 导出查询 take = MAX + 1 |

导出超限错误：`badRequestResponse(event, EXPORT_LIMIT_EXCEEDED_MESSAGE, exportLimitExceededError())`，`ErrorCode.EXPORT_LIMIT_EXCEEDED` + `maxRows`，不返回敏感 total。

## 2. PHASE-1A 落地清单

| 入口 | 修复前 | 修复后 |
| --- | --- | --- |
| after-sales `getList` | DB 全量读取 + include + 长文本 photos，Node `slice` 伪分页 | DB 分页（`skip`/`take`）+ 同一 scoped where 的 `count` + 稳定排序（`createdAt desc, id desc`）+ ListDTO `select`（不读 `actualSolution`/`remarks` 等未消费长文本，保留 `photos`/`solution`/`issueDescription`/`version`） |
| inspection `findAll` | 列表 include 完整 `items`（百万行膨胀） | 列表不再 include `items`；`qualityRecords` 仅 select `quantity/status`；`archiveTask` 最小 select |
| inspection export | `forExport=true` 无 limit，含 items 全量加载后检查 | 独立 `findAllForExport`：DataScope + filters + `take: EXPORT_QUERY_TAKE`，不 include items |
| quality-loss export | `loadAllScopedItems()` 全量加载后判断 20k | 独立 `getExportRows`：同一 scope builder + `take: EXPORT_QUERY_TAKE` |
| supplier export | `pageSize = MAX+1` 被内部 cap 100 截断 | 独立 `findAllForExport`：`take: EXPORT_QUERY_TAKE`，不走 list pagination |
| work-order export | 同上，cap 100 导致导出结果错误 | 独立 `getListForExport`：`take: EXPORT_QUERY_TAKE` + DataScope |

## 3. DataScope 约束

任何性能修改不得改变权限：分页查询与 count 共用同一 scoped where；export 保持既有 scope builder；禁止为减少 JOIN/OR 绕过 DataScope。

## 4. R-BOUNDED-READ Guard（已固化）

`scripts/check-qms-source-rules.mjs` 新增窄规则 **R-BOUNDED-READ**，只保护已确认的高风险入口（file + function 双维度定位）：

- `modules/after-sales/after-sales.service.ts` `getList`：`findMany` 必须带 `skip` + `take`。
- `modules/inspection/inspection-record-query.service.ts` `findAllForExport`：`findMany` 必须 `take: EXPORT_QUERY_TAKE`。
- `modules/quality-loss/quality-loss.service.ts` `getExportRows`：`findMany` 必须 `take: EXPORT_QUERY_TAKE`。

不扩展到全仓 findMany 无 take 的禁止（DB aggregate / 维护读取合法）。Guard fixture：`scripts/check-qms-architecture.test.ts` bounded-read-001/002。

## 5. DB Aggregation 统一范式（PERF-QMS-001 / PHASE-1B，已落地）

数据库负责：`filter / aggregate / group / count / sum / avg / top-N`；Node.js 只做轻量结果组合、格式化、展示层转换。**禁止** `findMany` 大量业务行 → Node reduce/map/group，除非确有无法下推的业务算法（见 5.2 PERF LEGACY）。

### 5.1 已下推入口

| 入口 | 修复前 | 修复后 | Guard |
| --- | --- | --- | --- |
| quality-loss `getDashboardSummary` | `loadAllScopedItems()` 全量 → Node SUM | 3 个并行 DB 查询（2×aggregate + 1×groupBy occurDate 推年份） | R-DB-AGGREGATION |
| quality-loss `getYearlyCharts` | 全年行 → Node 分月/分部门 | 2×groupBy（respDeptId/respDept + occurDate 趋势），Node 仅展示层分桶 | R-DB-AGGREGATION |
| quality-loss `getTrendData` | `WHERE YEAR(occurDate)=?` 非 sargable | `occurDate >= yearStart AND occurDate < nextYearStart`（上海 +08:00 窗口） | R-DB-AGGREGATION |
| inspection issue chart | findMany 18 字段 → Node 分桶 | `groupBy`（维度字段 + snapshot 字段）+ `_count/_sum` | R-DB-AGGREGATION |
| after-sales `getReportMonthAggregation` | findMany 全量 → Node 月聚合 | `groupBy(['occurDate'])` + `_count/_sum`，≤366 行/年 | R-DB-AGGREGATION |
| work-order `getDashboardStats` | findMany 5 字段 → Node reduce | 3 个并行 groupBy（status / divisionId / warranty），warranty 用 `deliveryDate >= now-1y` 等价转换 | R-DB-AGGREGATION |
| pass-rate legacy drilldown | `inspections.findMany` + `quality_records.findMany` 全量 → Node 分桶 | scoped raw SQL 预聚合（`pass-rate-rows.ts`，LEFT JOIN processes，GROUP BY 身份列，per-row 钳制 SUM） | R-DB-AGGREGATION + R-SCOPE-RAW |
| dashboard `getMonthlyTrend` | 12× `getNetPassRateSummaryByRange` fanout | 1 次全年 `GROUP BY inspectionDate` legacy 聚合（或 1 次 projection 聚合），Node 按本地月分桶 | R-DB-AGGREGATION（含 fanout 检测） |
| inspection-request-stats active | `qms_inspection_requests.findMany`（active 窗口） | scoped raw SQL `GROUP BY inspectorId`（COUNT + MIN(COALESCE(dispatchedAt, submittedAt))），Node 只做时长换算 | R-SCOPE-AGG |
| inspection-request-stats period（PERF-QMS-001 / PHASE-2A） | scoped `findMany` 全量 period 行 → Node 逐行 submitted/closed 双桶聚合（O(N)） | 2× scoped raw SQL `GROUP BY`（submitted/closed 各自预聚合 COUNT + 时长 SUM，O(groups)），Node 用 `classifyPeriodSubmittedRow/ClosedRow` + `applyPeriod*Group` 纯函数组合 | R-DB-AGGREGATION + R-SCOPE-AGG + R-SCOPE-RAW |

### 5.2 PERF LEGACY（保留 JS 聚合，登记原因）

✅ **已清零**（PERF-QMS-001 / PHASE-2A）：inspection-request-stats 的 `periodRequests` 行级聚合已下推为 DB 预聚合；身份归一（supplier/team/process→department 治理解析）与复检口径保留在 Node 纯函数 `classifyPeriodSubmittedRow / classifyPeriodClosedRow` 中，但输入为 O(groups) 分组行而非 O(N) 全量行。累计/时长口径通过 oracle 测试（`inspection-request-stats-period.test.ts`）与逐行路径做等价验证。

### 5.3 时区口径

- quality-loss 趋势/年度图表使用**上海 +08:00** 日期窗口（`buildShanghaiYearWindow`），与旧实现「格式化日期字符串取年」在本地时区非 UTC 部署下等价；代码注释已说明。
- dashboard 月度趋势按**服务器本地时区**月分桶（`new Date(inspectionDate).getMonth()`），与旧 12 次按本地月区间查询完全一致。

### 5.4 金额与空数据

- DB `SUM`（Decimal）→ `Number(value || 0)`，涉及金额的展示沿用 `toFixed(2)` 格式。
- DB 聚合无行（null）→ 保持 0 / `[]`，与旧 JS 聚合空集一致。

### 5.5 INDEX CANDIDATES（未建，登记评估）

> 已由 PERF-QMS-001 / PHASE-2B 完成 Query Plan & Index Validation，决策见第 8 节。候选已逐项评估，不再作为未建清单保留。

## 8. Query Plan & Index Validation（PERF-QMS-001 / PHASE-2B）

### 8.1 验证环境（LOCAL_PLAN_ONLY）

- 本地 MySQL 8.4.6（scratch 验证库，非生产）：`qms_perf`，7 张目标表共约 244 万行（inspections 25 万 / inspection_items 161 万 / quality_records 15 万 / after_sales 12 万 / quality_loss_index 6 万 / qms_inspection_requests 20 万 / work_orders 5 万），3.5 年日期跨度，isDeleted 3~4%，status/category 分布对齐生产形状。
- 所有计划均为 `EXPLAIN FORMAT=JSON` + 关键查询 `EXPLAIN ANALYZE` 实测；结论标注 `LOCAL_PLAN_ONLY`，生产数据量级（千万级）必须用生产 EXPLAIN 复核。
- 覆盖查询：inspection list/supplier history/export/items detail、quality_records stats、after_sales list/analytics trend、quality_loss_index list/trend/dashboard、inspection-request-stats（PHASE-2A 两个 raw SQL）、work_orders list/dashboard/countCreatedSince。

### 8.2 Index Decision Matrix（CREATE / KEEP / REJECT）

| 表 | 候选索引 | 决策 | 证据（LOCAL_PLAN_ONLY） |
| --- | --- | --- | --- |
| quality_loss_index | `(respDeptId, isDeleted, occurDate)` | **CREATE** | yearly trend：全扫/单列索引 12.1ms → 3.76ms（3.2x，扫 6198 → 1632 行）；dashboard groupBy date rows 29678 → 5897 |
| work_orders | `(isDeleted, createdAt)` | **CREATE** | 列表：Sort 全表 49764 行 9.1ms → 覆盖索引反向扫描 0.014ms（~650x）；countCreatedSince：ALL → range 15230 行 |
| inspections | `(category, inspectionDate, isDeleted)` | REJECT | planner 不选（Q1c 仍走单列 category_idx，rows 123281） |
| inspections | `(inspectionDate, isDeleted, category)` | REJECT | planner 不选（仍走单列 inspectionDate_idx） |
| inspections | `(supplierId, category, inspectionDate)` | REJECT | planner 不选（现有 supplierId_idx rows 1306 已够用） |
| inspection_items | `(inspectionId, order)` | REJECT | baseline 已无 filesort（rows 9），未来亿级写放大收益为负 |
| quality_records | `(isDeleted, date, status)` / `(date, status, isDeleted)` / `(date, isDeleted)` / `(isDeleted, date)` | REJECT | 均不被选用（stats 仍 ALL 全扫，本地 15 万行 cost ~16k） |
| after_sales | `(occurDate, isDeleted)` / `(isDeleted, occurDate)` | REJECT | 不被选用（仍走 isDeleted_idx rows 59346）；DEPT 三列 OR scope 是瓶颈，见 8.5 |
| qms_inspection_requests | `(isDeleted, status, submittedAt)` | REJECT | EXPLAIN ANALYZE 实测**变慢**（119ms vs baseline 53.5ms，回表 43249 行） |
| qms_inspection_requests | `(submittedAt, isDeleted, status)` / `(isDeleted, submittedAt, status)` / `(status, isDeleted, submittedAt)` | REJECT | planner 不选（仍全扫） |
| qms_inspection_requests | `(isDeleted, closedAt, status)` / `(closedAt, status)` | REJECT | planner 仍选 status_idx（rows ~98k），无实测改善 |

### 8.3 保留的现有索引（KEEP）

- `quality_loss_index(isDeleted, occurDate)`：ALL scope 趋势/汇总使用（无 respDeptId 过滤场景），与新增 `(respDeptId, isDeleted, occurDate)` 互补。
- `qms_inspection_requests(submittedAt)`：近 30 天窄窗口统计实测 7640 行（~5ms）有效，保留。
- `qms_inspection_requests(status)`：closed stats 实测仍由它驱动（80698 行），保留。
- `after_sales` 单列集合（含 `isDeleted`）：isDeleted 单列选择性低，但现有查询无替代覆盖，保留。

### 8.4 DROP CANDIDATE（未实施，需生产确认 + 独立 migration）

- `quality_loss_index(respDeptId)`：被新增 `(respDeptId, isDeleted, occurDate)` 左前缀覆盖；实施 CREATE 时评估是否随迁删除。
- `quality_records(status)`：被现有 `(status, isDeleted)` 左前缀覆盖。
- `quality_records(serialNumber)`：非唯一索引，与 `serialNumber` unique key 重复。

> 本专项不实施任何 DROP；仅登记候选。删除索引必须走独立 migration 并确认 Prisma schema 不管理该索引。

### 8.5 SCOPE_PERFORMANCE_GAP（登记，不在本专项处理）

- `after_sales` DEPT scope 为 `division IN (...) OR feedbackDept IN (...) OR respDept IN (...)` 三列 OR，单复合索引无法服务，observed index_merge/全扫；**禁止**为性能改权限模型（SEC-DATASCOPE 基线不变）。
- `qms_inspection_requests` DEPT scope 走 `responsibleDepartment IN (...)` 名称列，过滤性受名称分布影响。

### 8.6 Production Validation Required

- **CREATE 前**：`quality_loss_index(respDeptId, isDeleted, occurDate)` 与 `work_orders(isDeleted, createdAt)` 必须在生产数据量级跑 `EXPLAIN ANALYZE` 复核（大表建议 `ALGORITHM=INPLACE, LOCK=NONE`，独立 migration）。
- **REJECT 反转风险**：`inspections` / `quality_records` / `after_sales` / `qms_inspection_requests` 的复合候选在本地（3.5 年 / 25 万行）不被选用；生产千万级 + 窄日期窗口下 `(inspectionDate, ...)` / `(occurDate, ...)` / `(submittedAt, ...)` 前缀可能反转结论，需生产 EXPLAIN 重新评估。
- 写入成本：work_orders 工单创建低频（LOW）；quality_loss_index 索引维护中频（LOW/MEDIUM）。磁盘成本均为相对值 LOW（本地几 MB 级）。

## 6. Guard（已固化）

- **R-BOUNDED-READ**（PHASE-1A）：见第 4 节。
- **R-DB-AGGREGATION**（PHASE-1B）：file + function + model 三维度窄规则，拦截已下推入口重新出现 `findMany` 全量聚合；dashboard `getMonthlyTrend` 额外拦截 `getNetPassRateSummaryByRange` 12 次 fanout 回归。不泛化为「全仓禁止 findMany」。
- **B-MF**：所有新增聚合点已登记 `utils/metrics-registry.ts`（M-A01/M-A02/M-B06/M-C05/M-D03/M-D04/M-F01/M-F02），`docs/metrics-registry.md` 同步。
- Guard fixture：`scripts/check-qms-architecture.test.ts` db-aggregation-001/002/003（003 覆盖 inspection-request-stats period 入口：拦截 `findMany` 回归，放行 scoped raw GROUP BY 路径）。
- **R-DB-AGGREGATION（PHASE-2A 增量）**：`inspection-request-stats.service.ts#getRequestStats` 与 `inspection-request-stats-data.ts#loadInspectionRequestStatsData` 禁止对 `qms_inspection_requests` 使用 `findMany`。

## 7. 不在本专项范围

索引 / cursor pagination / Redis 缓存 / 流式 Excel / 异步导出 / 生命周期冷热分层：**明确不在本专项范围**，未验证的索引不写入正式基线（见 5.5 INDEX CANDIDATES）。
