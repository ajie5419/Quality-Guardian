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
