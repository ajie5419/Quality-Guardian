# supplier 模块

## 职责

供应商质量评分体系：供应商/外协准入档案、来料合格率、质量损失金额、连续不合格追踪、黑名单/观察期管理、画像历史使用项目，以及供应商/外协列表指标快照排序。

## 文件结构

- `supplier.service.ts` — 供应商写入、导入、列表查询与统计入口
- `supplier-history-projects.get.service.ts` — 供应商画像历史使用项目路由服务
- `supplier-score-snapshot.service.ts` — 生成和刷新供应商评分快照
- `supplier-scoring.ts` — 评分纯计算逻辑
- `supplier-query.ts` — 入参解析、导入归一化与主数据写入组装

## 对外接口

- `SupplierService.findAll(params)` — 供应商/外协列表 + 快照字段排序 + 统计
- `SupplierService.getHistoryProjects(id)` — 按供应商 ID 或 TEAM 映射读取画像历史使用项目
- `SupplierService.getInspectionHistory(id, params)` — 按供应商类型读取规范化检验履历
- `SupplierScoreSnapshotService.refreshBySupplierNames(names)` — legacy maintenance 兼容入口；禁止接入在线事件和画像请求，后续治理 wave 应删除
- `SupplierScoreSnapshotService.refreshAll()` — 全量 backfill 历史评分指标
- `SupplierQueryParams` — 查询参数类型

## 调用方

- `api/qms/supplier/` — 供应商和外协路由
- `modules/inspection/` — 不合格品和质量损失变更后刷新快照
- `modules/after-sales/` — 售后问题和质量损失变更后刷新快照

## 依赖

- `~/utils/prisma` — 访问 suppliers 与 supplier_score_snapshots
- `~/modules/inspection` — 获取供应商检验、工程问题评分数据与画像历史使用项目
- `~/modules/after-sales` — 获取供应商售后评分数据
- `~/modules/file-storage` — 登记准入手续附件引用
- `~/modules/supplier-identity` — 通过 `supplier_identity_links` 解析驻厂队伍 TEAM 身份

## 特殊约束

- 列表远程排序必须映射到 `suppliers` 字段或 `supplier_score_snapshots` 字段，禁止当前页内存排序
- 准入手续文件存储在 `suppliers.admissionDocuments`，创建/更新后必须同步登记 `file_references(bizType=supplier, fieldName=admissionDocuments)`
- 检验来源由共享 `resolveSupplierInspectionPolicy()` 唯一决定：普通供应商和外部加工读取 `INCOMING + supplierId`；驻厂队伍和外部服务读取 `PROCESS + teamId`，再通过 `supplier_identity_links` 映射到供应商。名称只保留为快照或搜索条件，评分、画像和前端不得自行复制判断或名称回退。
- 画像检验履历必须通过 `SupplierService.getInspectionHistory()` 返回统一 `partName` 和服务端分页；禁止前端用关键字拼接通用检验列表。
- 画像历史使用项目必须通过 `InspectionService.getSupplierHistoryProjects()` 从报检任务聚合，并通过关联检验记录的 `supplierId/teamId` 过滤；禁止按供应商名称查询，也禁止前端基于当前页结果拼接。
- 检验记录创建、编辑、删除和报检关闭事务提交后必须发布 `inspection_record.changed`，刷新关联快照。
- 历史数据快照回填必须随生产 Docker image 发布；deploy workflow 的 `missing` 模式同时刷新无快照和非当前 `*_V2` 评分模型的记录，保证规则升级后已有快照重算。
- `engineeringIssueCount` 展示全部历史工程问题；评分扣分、损失和连续问题仍使用最近 12 个月窗口，禁止用评分窗口数量冒充实际总数。
- 无有效检验批次时 API 合格率返回 `null`，页面显示 `-`；真实 0% 必须保留为 0%。`NA` 不进入分母，`CONDITIONAL` 进入分母但不计为 PASS。
- `supplierBrandId`、`inspections.supplierId` 和 `quality_records.supplierId` 均使用 `suppliers.id`；`suppliers.nameId` 属于名称字典，禁止跨命名空间复用。
- 评分逻辑保持纯计算，快照 service 只负责聚合来源数据和落库
- 黑名单判定：连续 3 次 A/B 类不合格 或 单次损失 > 80000

## 身份治理

- 供应商档案主键 `suppliers.id` 是供应商域唯一身份；`nameId` 只属于名称字典命名空间。
- 普通供应商和外部加工的画像、评分、质量问题和历史项目按 `supplierId` 读取。
- 驻厂队伍和外部服务通过 `SupplierIdentityService.teamIdsForSupplier()` 获得 TEAM ID 集合后读取，缺失映射时不回退名称。
- 名称只用于展示、关键字搜索和事件诊断，不得作为供应商画像聚合键。
- 跨身份域映射、回填、审计与阶段准入见 `docs/master-data-identity-governance.md`。

## 供应商身份治理 wave 状态

- 画像历史项目、检验履历、评分聚合和售后评分已按供应商 ID 查询；TEAM 数据先经过 `supplier_identity_links` 映射，再按 TEAM ID 查询过程检验。
- 检验、不合格项和售后变更事件只用 ID 驱动快照刷新。`EventEmitter` 当前为单进程、fire-and-forget；监听器失败只记录日志，没有持久化队列或自动重试。
- `refreshBySupplierNames()` 仅用于受控 legacy maintenance，不是在线兼容策略；after-sales 和 supervision 在线供应商写入已要求 ID，名称解析只允许存在于审核过的 import/backfill 入口。
- 本 wave 不代表部门、项目、工序等其他主数据已完成全项目 `ID_ONLY`；未解析审计和 TEAM 映射管理也尚无前端处置界面。
