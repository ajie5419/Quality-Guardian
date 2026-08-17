# 可用年份服务设计（Available Years）

> 权威文档：2026-08-17 成文（系统级年份查询统一方案）。
> 关联：docs/data-lifecycle.md §3.5（年份查询含归档）、docs/metrics-registry.md（指标登记）。

## 1. 背景与问题

按年份查询是各业务模块的共性需求（不合格项/售后/工单/检验记录/计量/质量损失），此前各自为政：

| 问题 | 现状 | 影响 |
| --- | --- | --- |
| 年份选项硬编码 | 检验记录页 [2024,2025,2026] | 年份不会自动更新，历史年份选不到 |
| 年份数据源错误 | /qms/common/years 只查 work_orders.deliveryDate | 不合格项/售后页下拉缺历史年份，追溯入口断 |
| 无系统级概念 | 各模块 year 语义靠默契 | 新增模块重复造轮子 |

## 2. 设计：年份来源注册表 + 统一接口 + 统一前端 hook

### 2.1 年份来源注册表（后端单一声明）

```ts
// modules/data-lifecycle/available-years.service.ts
YEAR_SOURCES = [
  { scope: 'inspection-record', table: 'quality_records', column: 'date' },
  { scope: 'inspection', table: 'inspections', column: 'inspectionDate' },
  { scope: 'after-sales', table: 'after_sales', column: 'occurDate' },
  { scope: 'work-order', table: 'work_orders', column: 'deliveryDate' },
  { scope: 'quality-loss', table: 'quality_loss_index', column: 'occurDate' },
  { scope: 'metrology-plan', table: 'metrology_calibration_plans', column: 'planYear' },
  { scope: 'vehicle-commissioning', table: 'vehicle_commissioning_issues', column: 'date' },
  // 新模块年份需求 = 注册表加一行
]
```

### 2.2 统一接口

```
GET /api/qms/common/years?scopes=inspection-record,after-sales
→ { data: [2026, 2025, 2024, ...] }   // 降序去重

- 无 scopes：合并全部来源（系统可用年份）
- 带 scopes：按模块过滤（统计页传自己的 scope）
- 含归档数据（追溯入口不断，见 data-lifecycle §3.5）
- 60s 内存缓存（年份低频变动）；预留 userContext（数据范围开启后按用户过滤）
```

### 2.3 前端统一 hook

```ts
// hooks/useAvailableYears.ts
useAvailableYears(scopes?: string[])  // 传 scopes 按模块取，不传取全量
- 模块级缓存（同 scopes 不重复请求）
- 错误容错：回退当前年 + 前一年
- 替换所有硬编码年份下拉
```


> 说明：质量策划（planning：BOM/DFMEA/ITP/项目文档）无业务日期列（仅 createdAt/updatedAt），暂不注册年份来源；如业务需要按年份管理，先为相关表补充业务日期字段再注册。

## 2.4 新模块接入指南（三步）

任何模块需要按年份查询时：

```ts
// 第 1 步：注册表加一行（apps/backend/modules/data-lifecycle/available-years.service.ts）
YEAR_SOURCES = [
  // ...现有来源
  { scope: 'my-module', table: 'my_table', column: '业务日期列' },
]

// 第 2 步：前端页面接 hook（传自己的 scope）
const { years } = useAvailableYears(['my-module']);

// 第 3 步：查询接口用 year 参数（业务日期年份语义）
// 完成——接口、缓存、容错、归档追溯全部自动生效
```

**要求**：

1. `column` 必须是**业务日期列**（记录所述年份），且表有 `isDeleted` 字段（年份查询含归档数据）
2. 表无业务日期列（仅 createdAt）时，**先补业务日期字段**再注册（如质量策划 planning 当前状态）
3. 禁止在页面里硬编码年份数组；禁止另写年份查询接口（一律走 `/qms/common/years`）

## 3. 年份语义统一约定

1. `year` 参数统一 = **业务日期年份**（记录所述年份，非创建年份）
2. 年份下拉选项 = 统一年份服务，**含归档数据**
3. 统计默认 year = 当前年（现状保留，不做自动切换）
4. 新模块需要年份查询：注册表加一行 + 前端 hook 传 scope，禁止再硬编码

## 4. 性能与扩展

- 多表 DISTINCT YEAR 直查（业务日期列均有索引；百万级秒内）
- 数据超千万级后再评估物化年份表（cron 维护，仿 quality_loss_index 模式）
- 数据范围开启后：接口加 userContext 过滤年份选项（预留，当前年份选项不受数据范围限制——年份是导航入口，明细查询才受范围约束）

## 5. 实施清单

| 项 | 内容 | 状态 |
| --- | --- | --- |
| 1 | docs/available-years.md（本文档） | ✅ |
| 2 | 后端 YEAR_SOURCES 注册表（6 来源）+ 接口升级（scopes）+ 60s 缓存 | ✅ 2026-08-17 |
| 3 | 前端 useAvailableYears 泛化（scopes + 模块级缓存）+ 检验记录页替换硬编码 | ✅ 2026-08-17 |
| 4 | 售后/不合格项/工单页传 scopes（数据源修正） | ✅ 2026-08-17 |
