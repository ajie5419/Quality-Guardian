# supplier 模块

## 职责

供应商质量评分体系：来料合格率、质量损失金额、连续不合格追踪、黑名单/观察期管理。

## 文件结构

- `supplier.service.ts`（677 行）— findAll 做查询 + 7 路并行聚合 + 评分计算 + 排序 + 分页
- `supplier.definition.ts` — 模块定义（待删除，精简计划第 1 步）

## 对外接口

- `SupplierService.findAll(params, userinfo)` — 供应商列表 + 评分 + 统计
- `SupplierQueryParams` — 查询参数类型

## 调用方

- `api/qms/supplier/` — 供应商路由
- `modules/dashboard/` — 概览统计

## 依赖

- `~/utils/prisma` — 直接查询（绕过 data-scope，供应商数据全员可见）
- `~/core/master-data/` — canonical 解析
- `~/utils/supplier` — 评分常量与工具函数（精简后迁入本目录）

## 特殊约束

- findAll 直接用 prisma 而非 DataScopeService（供应商无部门归属）
- 评分逻辑是纯计算，未来可移到 `packages/qgs-domain/`
- 黑名单判定：连续 3 次 A/B 类不合格 或 单次损失 > 80000
