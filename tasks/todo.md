# QMS PPT 交付任务

- [x] 明确交付物：生成可直接演示的 `.pptx`（含图片、图示、完整讲解文案）
- [x] 准备生成环境（python-pptx）
- [x] 编写自动化生成脚本（统一主题、版式、图示）
- [x] 生成 PPT 文件到 `docs/presentation/QMS-质量卫士-完整版.pptx`
- [x] 校验 PPT 可读取（程序化打开检查）
- [x] 输出交付说明（页面结构、如何修改）

## 验收标准

- 文件存在且可正常打开
- 至少 10 页，覆盖：痛点 -> 构想 -> 方案 -> 预期提升
- 每页包含标题、核心要点，且包含图示/图表元素
- 语言为中文，适合管理汇报

## Review

- 已生成：`docs/presentation/QMS-质量卫士-完整版.pptx`（12 页）
- 图表素材：`docs/presentation/assets/*.png`
- 生成脚本：`scripts/generate_qms_ppt.py`
- 校验结果：文件存在、可读取、页数=12

- 已加入项目截图：`docs/presentation/site-shots/*.png`

## 二次优化（用户新要求）

- [x] 使用线上环境截图（不是本地）
- [x] 改为局部截图，优先展示图表/关键业务区域
- [x] 删除“汇报目标”类文案，仅保留实际业务内容
- [x] 优化排版（统一留白、信息密度、视觉层级）
- [x] 重新生成并校验 PPT 可打开

- 已生成业务数据风 V2：`docs/presentation/QMS-质量卫士-业务数据风-V2.pptx`（12页，70%截图）

## 系统构件图任务

- [ ] 读取PDF并提炼表达思路
- [ ] 结合当前QMS模块梳理系统构件
- [ ] 输出系统构件图与说明
- [ ] 更新任务与经验记录

## PPT插页任务

- [x] 将系统构件图插入业务数据风 V2 PPT 并生成新版本

## 解决思路HTML页面

- [x] 生成 02 解决思路图文结合 HTML 页面
- [x] 校验页面文件可用

## 后续HTML页面

- [x] 生成 03 系统化解决方案 HTML 页面
- [x] 生成 04 预期提升 HTML 页面

## 问题分析页面

- [x] 生成 当前痛点 HTML 页面
- [x] 生成 业务影响 HTML 页面
- [x] 生成 业务根因 HTML 页面
- [x] 生成 合并总页面并嵌入平台截图

## 汇报叙事改版（Excel 升级对比）

- [ ] 将问题分析页改写为“传统方式 vs 系统化平台”对比口径
- [ ] 合并页面补充平台优势与升级收益表达

## 图片缓存优化

- [x] 排查不合格项/售后图片刷新重复拉取原因
- [x] 为 `/uploads/**` 与 `/api/uploads/**` 增加强缓存响应头
- [x] 完成后端类型检查验证

## 图片缓存优化 Review

- 已修改 `apps/backend/nitro.config.ts`，统一对上传图片路径增加 `Cache-Control: public, max-age=31536000, immutable`
- 已修改 `apps/backend/api/uploads/[filename].get.ts`，补充 `immutable` 缓存策略
- 验证通过：`pnpm -F @qgs/backend typecheck`

## Review

- 已生成：`docs/presentation/qms-current-pain-page.html`
- 已生成：`docs/presentation/qms-business-impact-page.html`
- 已生成：`docs/presentation/qms-root-cause-page.html`
- 已生成：`docs/presentation/qms-problem-analysis-combined.html`
- 页面已嵌入真实线上截图：`docs/presentation/online-shots-v2/*.png`
- 校验结果：4 个 HTML 文件存在，标题与截图引用完整

## 图片缩略图优化收尾（2026-03-05）

- [x] 前端售后/不合格项列表接入缩略图优先显示（原图兜底）
- [x] 上传接口生成 `*_thumb.webp` 缩略图并返回 `thumbUrl`
- [x] 历史图片通过 `/api/uploads/[filename]` 按需懒生成缩略图
- [x] 修复 lint 排序与格式规则
- [x] 通过 `pnpm lint`
- [x] 通过 `pnpm check:type`
- [x] 通过 `pnpm check:qms-arch`

## 报表分析月报内容修复（2026-03-05）

- [x] 定位月报“内容不对”根因（接口参数/日期边界/展示口径）
- [x] 修复后端报告日期解析与格式化时区问题
- [x] 回归验证月报 period 与统计结果
- [x] 记录修复结论

### 月报修复 Review

- 根因：`toISOString().split('T')[0]` 按 UTC 截断日期，导致东八区周期起始日回退一天（例如 3 月显示为 `2026-02-28 ~ 2026-03-31`）。
- 修复：统一改为本地日期格式化（`getFullYear/getMonth/getDate`）；`YYYY-MM-DD` 入参改为本地日期解析，避免 UTC 偏移。
- 验证：`GET /api/qms/reports/summary?type=monthly&date=2026-03-01` 返回 `period = 2026-03-01 ~ 2026-03-31`。
- 质量门禁：`pnpm lint`、`pnpm check:type` 均已通过。

## 月报内容增强（系统内模板化，2026-03-05）

- [x] 拆分 `reports/summary/index.vue` 月报区组件（满足 R3）
- [x] 增加“月度总览/关键结论/过程质量/重点问题/供应商表现/行动建议”结构
- [x] 增加图表下方自动数据分析文案
- [x] 联调并通过 lint/typecheck/qms-arch

### 月报内容增强 Review

- 已新增月报独立组件：`apps/web-antd/src/views/qms/reports/MonthlyReportContent.vue`，用于固定月报模板化结构。
- 已将原 `apps/web-antd/src/views/qms/reports/summary/index.vue` 月报内容下沉到独立组件，文件从 599 行降到 311 行，符合 R3。
- 月报页面结构已固定为 7 个章节：月度总览、数据分析结论、缺陷类型分布、过程质量、重点项目问题、供应商表现、下月行动建议。
- 数据分析文案已改为自动生成（基于指标趋势/损失/高频缺陷/供应商风险），可作为每月汇报基础文本。
- 类型已补齐：`packages/qgs-shared/src/modules/qms/reports.ts` 新增 `processPassRates`、`historyLabels`。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 月报工序口径复用修复（2026-03-05）

- [x] 统一 `pass-rate-trend` 与 `reports/summary` 的工序合格率计算口径
- [x] 复用 `apps/backend/utils/pass-rate.ts`，移除重复实现
- [x] 回归验证两接口同月工序数据一致（代码路径已统一为同一计算函数）
- [x] 通过 `pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`

### 口径复用修复 Review

- `apps/backend/api/qms/pass-rate-trend.get.ts` 已改为复用 `createPassRateTargetResolver` 与 `getPassRateDrillDownByRange`。
- `apps/backend/api/qms/reports/summary.get.ts` 的 `fetchProcessPassRates` 已改为复用同一 drillDown 计算，再映射为月报字段结构。
- 已消除两套独立统计实现，后续工序映射/NCR 扣减/目标值策略只需维护一处（`apps/backend/utils/pass-rate.ts`）。

## 工作区盘点（2026-03-07）

- [ ] 收集当前未提交改动
- [ ] 按模块归类为可审查清单
- [ ] 输出建议的整理/提交顺序

## 质量概览故障率口径严谨化（2026-03-08）

- [x] 确认 `after_sales` / `work_orders` 可用于唯一主体统计的字段
- [x] 将“车辆故障率”改为按唯一工单统计的严谨口径
- [x] 同步调整前端标题、图例、提示文案
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 输出新旧口径差异说明

### 故障率口径严谨化 Review

- 现有模型中没有 VIN/车架号，`after_sales` 与 `work_orders` 间唯一稳定公共键只有 `workOrderNumber`。
- 因此将原“车辆故障率”调整为“车型故障工单率”，避免用售后记录条数冒充单车故障率。
- 后端接口 `apps/backend/api/qms/vehicle-failure-rate.get.ts` 已改为按近 12 个月、按月窗口、按唯一 `workOrderNumber` 统计：
  - 分子：当月发生售后的唯一工单数
  - 分母：当月已完成出货的唯一工单数
- 前端图表 `apps/web-antd/src/views/qms/dashboard/components/VehicleFailureChart.vue` 已同步改为“故障工单率 / 出货工单数 / 故障工单数”口径，并在副标题中明确“按唯一工单统计”。
- 国际化文案 `apps/web-antd/src/locales/langs/zh-CN/qms.json` 已同步调整，去掉“车辆故障率”的误导表达。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 质量概览月份筛选口径修正（2026-03-08）

- [x] 将月份筛选窗口从“滚动12个月”改为“当年1月至所选月”
- [x] 同步修正图表标题/副标题文案
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`

### 月份筛选口径修正 Review

- `apps/backend/api/qms/vehicle-failure-rate.get.ts` 已由“滚动12个月”窗口改为“当年1月至所选月”的自然年窗口。
- 选择 `YYYY-MM` 后，趋势图会展示该年 1 月到该月的逐月数据；不会再混入上一年月份。
- 排行榜也统一按同一自然年窗口重算，保证左侧排行与右侧趋势口径一致。
- `apps/web-antd/src/views/qms/dashboard/components/VehicleFailureChart.vue` 已移除旧的 `range=12m` 语义依赖。
- 文案已修正为“年度累计”“当年1月至所选月，按唯一工单统计”。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 质量概览车型范围收口（2026-03-08）

- [x] 将故障工单率接口限制为只统计项目名包含“车”的项目
- [x] 修复车型筛选覆盖默认过滤的问题
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 车型范围收口 Review

- `apps/backend/api/qms/vehicle-failure-rate.get.ts` 已统一限制为仅统计 `projectName` 包含“车”的项目。
- 当存在车型筛选时，若筛选值本身不包含“车”，接口将返回空结果，不再错误统计其他非车辆项目。
- 当筛选值包含“车”时，接口按该项目名精确匹配，避免 `contains` 带来的误命中。

## 质量概览车辆故障率标准化（2026-03-08）

- [x] 按“工单号即车辆唯一 ID”重定义分子分母
- [x] 将趋势与排行统一为年度累计车辆故障率口径
- [x] 同步修正前端图表文案、图例、提示字段
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 车辆故障率标准化 Review

- 用户确认 `workOrderNumber` 即车辆唯一 ID，因此首页指标已从“故障工单率”升级为标准“车辆故障率”。
- `apps/backend/api/qms/vehicle-failure-rate.get.ts` 现改为：
  - 分母：当年 1 月至所选月累计出货的唯一工单号数
  - 分子：这些已出货车辆中，截至所选月累计发生售后的唯一工单号数
- 趋势图每个月均按“当年 1 月起累计”重算，不再使用单月故障数除以单月出货数。
- 排行榜与趋势图口径已统一，且仍只统计项目名包含“车”的项目。
- 前端文案已同步改为“车辆故障率 / 故障车辆数 / 出货车辆数”，副标题明确为“按唯一工单号累计统计”。

## 质量概览车辆故障率趋势标签修复（2026-03-08）

- [x] 修复年度累计窗口下月份标签重复显示为 1 月的问题

## 不合格项责任部门筛选修复（2026-03-08）

- [x] 定位责任部门筛选/搜索失效根因
- [x] 前端搜索表单增加责任部门查询字段
- [x] 表格责任部门列增加筛选项
- [x] 后端列表解析与服务层增加责任部门过滤
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 不合格项责任部门筛选修复 Review

- 根因不是单点失效，而是整条责任部门筛选链路缺失：搜索表单无字段、前端查询未透传、后端 query parser 未解析、service where 未收口。
- 已在 `apps/web-antd/src/views/qms/inspection/issues/data.ts` 增加责任部门搜索字段，支持表单按责任部门关键字搜索。
- 已在 `apps/web-antd/src/views/qms/inspection/issues/composables/useIssueGridOptions.ts` 为责任部门列补充筛选项，并在 query/queryAll/export 全链路透传 `responsibleDepartment`。
- 已在 `apps/backend/utils/inspection-issue.ts` 与 `apps/backend/services/inspection.service.ts` 增加责任部门解析和过滤逻辑：
  - 支持按部门 ID 精确过滤
  - 支持按部门名称关键字匹配后映射到部门 ID 再过滤
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 合格率历史数量回填修复（2026-03-11）

- [x] 确认质量概览下钻 100% 异常的直接根因
- [x] 增加检验记录数量回填脚本，修正历史 `qualifiedQuantity/unqualifiedQuantity`
- [x] 执行本地回填并校验关键分组统计结果
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`

### 合格率历史数量回填修复 Review

- 根因不是新公式本身，而是 30 条历史 `inspections` 记录的 `qualifiedQuantity/unqualifiedQuantity` 仍为 `null`，导致单一口径统计只能按 `result` 兜底，出现分组 100% 的假象。
- 已新增回填脚本：`apps/backend/prisma/inspection-quantity-backfill.js`，规则如下：
  - 有关联不合格项：`unqualifiedQuantity = sum(quality_records.quantity)`，`qualifiedQuantity = quantity - unqualifiedQuantity`，并同步将 `result` 收敛为 `FAIL`
  - 无关联不合格项：按既有 `result` 回填（`PASS => 全合格`，`FAIL => 全不合格`）
- 已执行本地回填，当前本地库 `remainingNullQuantityRows = 0`。
- 已验证关键异常样例：
  - `quantity=10` 行已修正为 `qualifiedQuantity=7 / unqualifiedQuantity=3`
  - `quantity=55` 行已修正为 `qualifiedQuantity=52 / unqualifiedQuantity=3`
- 当前同月分组统计已恢复为真实值，例如：
  - `原材料`：`53 / 56`
  - `机加成品件`：`7 / 10`
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 趋势标签修复 Review

- 根因：`apps/backend/api/qms/vehicle-failure-rate.get.ts` 将累计窗口的 `start` 固定为当年 1 月后，趋势标签仍从 `start` 取月份，导致所有点显示为 `YYYY-01`。
- 修复：趋势标签改为使用循环中的 `monthIndex + 1` 生成，累计窗口仍保持“当年 1 月起”。
- 结果：趋势图现在会正确显示 `2026-01 / 2026-02 / 2026-03 ...`，而不是全部显示 `2026-01`。

## 不合格项周/月筛选联动（2026-03-08）

- [x] 为不合格项列表增加按年/按月/按周时间筛选
- [x] 让统计卡与图表面板同步复用同一时间范围
- [x] 后端列表与统计接口统一支持 `dateMode/dateValue`
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 不合格项周/月筛选联动 Review

- `apps/web-antd/src/views/qms/inspection/issues/index.vue` 已新增按年/按月/按周筛选控件；年模式保留原年份选择，月/周模式改为日期选择器。
- 列表数据、统计卡片和图表面板统一透传 `dateMode/dateValue/year`，避免页面和图表各算各的。
- `apps/backend/utils/inspection-issue.ts` 已新增统一时间解析与范围构建逻辑；周模式按周一到周日、月模式按自然月、年模式按自然年处理。
- `apps/backend/services/inspection.service.ts` 已复用同一时间范围构建列表与统计查询；趋势图在月/周模式下切换为按日统计，年模式保持按月统计。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 售后质量周/月筛选联动（2026-03-08）

- [x] 检查售后页面、图表与后端筛选口径
- [x] 为售后列表与图表增加按年/按月/按周时间筛选
- [x] 后端列表与统计接口统一支持 `dateMode/dateValue`
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 售后质量周/月筛选联动 Review

- `apps/web-antd/src/views/qms/after-sales/index.vue` 已增加按年/按月/按周时间维度切换；年模式保留年份下拉，月/周模式改为日期选择器。
- `apps/web-antd/src/views/qms/after-sales/composables/useAfterSalesGrid.ts` 已让列表查询、全量导出与 `queryAll` 统一透传 `dateMode/dateValue/year`。
- `apps/web-antd/src/views/qms/after-sales/components/AfterSalesCharts.vue` 已随同一时间范围重拉全量数据，自定义图表与列表口径保持一致。
- `apps/backend/utils/after-sales-query.ts` 已新增统一时间解析与范围构建逻辑；周模式按周一到周日，月模式按自然月，年模式按自然年。
- `apps/backend/services/after-sales.service.ts` 与 `apps/backend/api/qms/after-sales/stats.get.ts` 已统一支持 `dateMode/dateValue`，并顺手修复了 `stats` 接口缺少 `await verifyAccessToken` 的鉴权问题。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 质量概览合格率趋势标准化（2026-03-09）

- [x] 确认首页趋势与下钻当前口径及影响范围
- [x] 将首页趋势改为标准合格率算法（合格数/检验总数）
- [x] 同步修正下钻明细口径与说明
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 质量概览合格率趋势标准化 Review

- 首页质量概览的合格率趋势实际走 `apps/backend/api/qms/pass-rate-trend.get.ts`，不是 `apps/backend/services/dashboard.service.ts` 里的旧月度质量算法。
- 已将首页趋势口径改为标准合格率：
  - 分母：周期内检验总数量
  - 分子：周期内 `result = PASS` 的检验数量
  - 公式：`passRate = passCount / totalCount * 100`
- 已同步修正首页下钻数据口径，来料检验 / 过程检验 / 成品检验均按同一标准算法统计，不再扣减 `quality_records` 的 NCR 数量。
- 影响范围仅限首页质量概览合格率趋势与其下钻；月报、工序合格率等其他使用 `utils/pass-rate.ts` 的模块未改口径。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。

## 首页合格率全为100%原因排查（2026-03-10）

- [x] 核对首页合格率趋势当前算法与查询口径
- [x] 核对 inspections.result 的实际写入与不合格项记录关系
- [x] 解释为什么当前数据会全部显示 100%
- [ ] 给出修正方案并完成必要实现
- [x] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

### Review

- 首页当前仅按 `inspections.result = PASS / total` 计算，不再扣减 `quality_records`。
- 不合格项主要记录在 `quality_records`，不会自动回写 `inspections.result`，因此在现有数据下首页容易显示为 100%。

## 首页与月报合格率口径统一（2026-03-10）

- [x] 检查首页合格率趋势与月报工序合格率当前实现差异
- [x] 恢复首页为贴合业务现状的净合格率
- [x] 若月报不是净合格率，同步统一到同一口径
- [x] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

### Review

- 首页趋势已恢复为检验数量扣减 NCR 数量后的净合格率。
- 月报总览“综合合格率”已与月报工序合格率统一为同一净合格率 helper。

## 成品检验展示范围排查（2026-03-10）

- [ ] 检查成品检验在首页下钻与月报工序合格率中的使用位置
- [ ] 检查其他页面/报表是否复用同一工序归类逻辑
- [ ] 给出去掉成品检验展示的影响范围与改法

## 合格率统计隐藏成品检验（2026-03-10）

- [x] 修改合格率统计 helper，首页/月报工序统计排除 SHIPMENT
- [x] 确认仅影响首页下钻与月报工序统计，不影响检验记录分类
- [x] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

### Review

- 已在合格率统计 helper 中排除 SHIPMENT，首页下钻与月报工序统计不再显示成品检验。
- 检验记录模块中的 SHIPMENT 分类与录入逻辑未变。

## 外购件 NCR 别名扣减（2026-03-10）

- [x] 在合格率统计 helper 中将 NCR 的“成品检验”视作“外购件”别名
- [x] 确认仅影响首页/月报工序与来料统计，不改检验记录业务分类
- [x] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

### Review

- 统计口径中，外购件的 NCR 扣减现在同时识别 “外购件” 与 “成品检验” 两个别名。
- 只影响首页/月报的合格率统计展示，不改变检验记录的 SHIPMENT 业务分类。

## 合格率统计隐藏设计工序（2026-03-10）

- [x] 在合格率统计 helper 中排除设计工序
- [x] 确认仅影响首页/月报合格率展示，不影响业务数据
- [x] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

### Review

- 合格率统计 helper 已排除设计工序，首页下钻与月报工序统计不再显示设计。
- 仅影响统计展示，不修改检验数据与业务分类。

## 检验记录与不合格品项口径规范方案（2026-03-10）

- [x] 梳理检验记录与不合格品项当前数据模型与断点
- [x] 设计统一关联主线与字段规范
- [x] 给出分阶段落地方案、风险与验收口径

### Review

- 当前 `inspections` 与 `quality_records` 没有强制主关联，NCR 创建时也不会自动回写检验结果，导致合格率与不合格项统计天然存在口径偏差。
- 规范方案应围绕“检验记录为主线、NCR 为派生闭环对象、统计只认统一主键和统一状态”落地。

## 不合格项责任部门展示与列筛选修复（2026-03-10）

- [x] 定位责任部门列显示部门ID与筛选项为空的根因
- [x] 修复责任部门列展示为部门名称
- [x] 修复责任部门列筛选项生成与筛选提交
- [ ] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

## 不合格项责任部门原生筛选恢复（2026-03-10）

- [ ] 回退责任部门列的非原生单选筛选改法
- [ ] 保留 VXE 原生多选筛选，仅修复选项注入与面板可用性
- [ ] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

## 对照 Vben Admin 原生表格筛选实现（2026-03-11）

- [ ] 查找仓库内已验证可用的 Vben/VXE 列筛选实现
- [ ] 对比不合格项页面当前实现差异
- [ ] 按同一实现方式修复责任部门列筛选
- [ ] 运行 pnpm lint && pnpm check:type && pnpm check:qms-arch

## 不合格项责任部门筛选对齐 Vben 原生实现（2026-03-11）

- [x] 查找仓库内 Vben Admin 原生列筛选实现方式
- [x] 对比当前不合格项责任部门列的差异点
- [x] 按同一模式修正前端列筛选与参数透传
- [x] 联调后端过滤，验证列筛选真实收口
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 原生筛选对齐 Review

- 对照 `apps/web-antd/src/adapter/vxe-table.ts` 与 `packages/effects/plugins/src/vxe-table/use-vxe-grid.vue` 后确认：仓库默认就是 VXE 原生远程筛选，关键在于 `proxyConfig.filter = true` 和 `filterConfig.remote = true`，不需要自定义筛选组件。
- 当前责任部门列筛选失效的核心原因不在 VXE 原生实现，而在请求链路：原生多选筛选透传数组时会落成 `responsibleDepartment[]` 这类查询参数；后端 `parseInspectionIssueListQuery` 之前只读取 `responsibleDepartment`，导致筛选值在 parser 层被丢弃。
- 已在 `apps/backend/utils/inspection-issue.ts` 增加 `getQueryValue(query, key)`，统一兼容 `key` 与 `key[]` 两种参数名，并同步用于 `status`、`severity`、`defectType` 等多选字段，避免同类远程列筛选继续失效。
- 同步将 `apps/web-antd/src/api/qms/inspection.ts` 的 `responsibleDepartment` / `status` 参数类型放宽为 `string | string[]`，与原生列筛选透传形态一致。

## 检验记录与不合格品项一体化规范（2026-03-11）

- [x] 复核 schema、创建链路与页面入口，确认当前是弱关联而非完全无关联
- [x] 输出一阶段最小改造方案：强关联字段、创建入口、统计切换边界
- [x] 明确旧数据兼容与回填策略
- [x] 实现 `quality_records.inspectionId` 强关联字段与 Prisma 关系
- [x] 实现“从检验记录生成不合格项”页面入口与预填逻辑
- [x] 实现不合格项创建时按 `inspectionId` 自动回填主业务字段
- [x] 运行 `pnpm --filter @qgs/backend exec prisma generate`
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 一体化规范 Review

- 当前一阶段改造已将“弱关联”提升为“可选强关联”：`quality_records` 新增 `inspectionId`，并与 `inspections.id` 建立 Prisma 关系；旧数据保持兼容，不强制回填。
- 检验记录页已新增“生成不合格项”入口，前端会预填 `inspectionId`、工单号、项目名、部件名、工序/来料类别、数量、日期、供应商等字段，避免用户在不合格项页重新手工拼装一遍业务上下文。
- 后端创建不合格项时，若带 `inspectionId`，将以关联检验记录为准自动回填 `workOrderNumber`、`projectName`、`supplierName`、`division`、`processName`、`partName`、`quantity`、`category` 等字段，降低检验记录与 NCR 数据漂移风险。
- 这次没有直接切换首页/月报合格率主统计逻辑；现阶段只为“新产生的不合格项”建立强关联基础。后续二阶段应让统计优先认 `inspectionId`，旧数据再走字段兜底，并补历史回填脚本。

## 客户端错误日志可观测性修复（2026-03-11）

- [ ] 定位 `Fetch Issue Chart Dashboard Data failed` 日志丢失真实错误的原因
- [ ] 修复前端错误对象序列化，保留 axios/status/url/response 关键信息
- [ ] 运行 `pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`

## 工单号下拉全模块为空修复（2026-03-11）

- [x] 复核工单下拉公共链路（WorkOrderSelect -> work-order API -> WorkOrderService）
- [x] 修复 ignoreYearFilter 对布尔入参不兼容导致的年份过滤误伤
- [x] 修复工单数据权限在空部门场景下误构造 in [] 条件
- [ ] 运行 `pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`

## 检验记录表单内强关联不合格项（2026-03-11）

- [x] 梳理检验记录新建/编辑表单与不合格项创建链路
- [x] 在检验记录表单内新增“同步创建不合格项”并提供关键字段录入
- [x] 提交时先保存检验记录，再自动创建并绑定 `inspectionId` 的不合格项
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type`
- [x] 运行 `pnpm check:qms-arch`

### 强关联 Review

- 之前“列表页按钮生成不合格项”属于弱入口，用户仍需要跨弹窗二次维护信息；这次改为检验记录表单内一并提交，强关联在同一业务动作完成。
- 当前实现为：勾选“同步创建不合格项”后，保存检验记录成功即调用不合格项创建接口，带上 `inspectionId`，实现检验记录与不合格项一对一业务绑定。
- 关联不合格项的缺陷分类、严重程度、索赔选项复用了现有不合格项模块配置，避免再造一套字段口径。
- 兼容策略：未勾选时保留原检验记录流程；勾选但不合格项创建失败时，不回滚检验记录，前端给出明确告警。

## 检验记录判定驱动不合格项联动（2026-03-11）

- [x] 改为“最终汇总判定=不合格”时自动显示不合格项联动区域
- [x] 工序/责任部门/部件名称优先沿用检验记录，避免重复录入
- [x] 增加合格数量/不合格数量区分，提交时按不合格数量写入不合格项
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type --filter @qgs/web-antd`
- [x] 运行 `pnpm check:qms-arch`

## 检验记录生成不合格项业务口径对齐（2026-03-11）

- [x] 进货检验责任部门按工序映射自动带出（原材料/外购件=采购部，辅材/机加成品件=生产 OBU）
- [x] 供应商名称沿用检验记录已选供应商
- [x] 工序/责任部门/部件名称默认沿用检验记录，避免重复录入
- [x] 不合格项联动表单补齐字段（状态、原因分析、解决方案、检验员、报告日期）
- [x] 数量拆分为合格数量/不合格数量，并按不合格数量写入不合格项
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm check:type --filter @qgs/web-antd`
- [x] 运行 `pnpm check:qms-arch`

## 检验记录不合格默认仍显示合格修复（2026-03-11）

- [x] 定位结果字段前后端不一致根因（前端手工判定未被后端强约束）
- [x] 后端增加 `resolveOverallResult`：明细失败或手工判定失败均落库为 `FAIL`
- [x] 前端在检验明细结果变更时自动同步“最终汇总判定”
- [x] 运行 `pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`

## 检验记录列表三列展示（2026-03-11）

- [x] 后端返回检验记录关联问题聚合字段：issueStatus、unqualifiedQuantity
- [x] 前端列表新增三列：检验结论、问题状态、不合格数量
- [x] 运行 `pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`

- [x] 收敛质量概览合格率统计到检验记录单一数据源
  - [x] inspections 表新增 qualifiedQuantity / unqualifiedQuantity
  - [x] 检验记录前后端提交链路写入数量字段并做一致性校验
  - [x] 合格率趋势/下钻/月报统一改为只基于 inspections 统计
  - [x] 增加或更新相关测试，验证单一数据源口径
  - [x] 运行 pnpm lint、pnpm check:type、pnpm check:qms-arch、相关单测

### 合格率单一数据源 Review

- 质量概览和月报现在统一复用 `apps/backend/utils/pass-rate.ts`，统计只读取 `inspections`，不再使用 `quality_records` 反扣，问题台账与检验统计职责分离。
- 检验记录提交时会把 `qualifiedQuantity` / `unqualifiedQuantity` 一并写入 `inspections`；若旧数据或兼容场景未提供拆分数量，后端会基于 `result + quantity` 做保守兜底，避免上线后立即出现空值断档。
- 首页旧接口 `DashboardService.getMonthlyTrend()` 也已改为复用统一统计函数，避免首页与周月报继续维护两套公式。
- 本地已完成 `prisma db push`，并验证 `pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`、后端相关单测通过。

## 合格率显示精度修复（2026-03-12）

- [x] 统一质量概览/报表合格率保留两位小数
- [x] 运行 pnpm lint
- [x] 运行 pnpm check:type

### 合格率显示精度修复 Review

- 后端 `apps/backend/utils/pass-rate.ts` 已统一将合格率统计值四舍五入到小数点后 2 位。
- 前端质量概览趋势图、下钻表格、月报概览与过程质量区块已统一使用两位小数格式展示，`100` 现在会显示为 `100.00%`。
- 验证通过：`pnpm lint`、`pnpm check:type`。

## 日报查看增加资料整理情况（2026-03-12）

- [x] 定位日报查看模块接口与模板
- [x] 新增资料整理情况字段（工单号/项目名称/工作内容/状态）
- [x] 运行 pnpm lint
- [x] 运行 pnpm check:type

### 日报资料整理情况 Review

- 本次改动已限定在 `报表分析 -> 日报查看`，数据来源为 `/qms/reports/daily-summary`；此前误加到车辆调试日报的改动已撤回。
- 标题已改为“当日资料整理情况”，并从自动生成改为页面内手动录入表格，支持新增、删除。
- 后端新增 `/qms/reports/daily-summary` 保存接口，手动录入内容与日报总结统一存入 `daily_reports.summary`，刷新后可回显。
- 验证通过：`pnpm lint`、`pnpm check:type`、`pnpm check:qms-arch`。
