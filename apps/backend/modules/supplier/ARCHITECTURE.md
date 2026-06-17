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
- `SupplierService.getHistoryProjects(id)` — 读取供应商画像历史使用项目
- `SupplierScoreSnapshotService.refreshBySupplierNames(names)` — 按供应商名称刷新评分指标
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
- `~/utils/canonical-master-data` — 供应商名称 canonical ID 解析

## 特殊约束

- 列表远程排序必须映射到 `suppliers` 字段或 `supplier_score_snapshots` 字段，禁止当前页内存排序
- 准入手续文件存储在 `suppliers.admissionDocuments`，创建/更新后必须同步登记 `file_references(bizType=supplier, fieldName=admissionDocuments)`
- 画像历史使用项目必须通过 `InspectionService.getSupplierHistoryProjects()` 从报检任务聚合，禁止前端基于当前页列表或检验记录页结果拼接
- 历史数据快照回填必须随生产 Docker image 发布，并由 deploy workflow 在 Prisma migration 后自动运行 `apps/backend/scripts/backfill-supplier-score-snapshots.ts`
- 评分逻辑保持纯计算，快照 service 只负责聚合来源数据和落库
- 黑名单判定：连续 3 次 A/B 类不合格 或 单次损失 > 80000
