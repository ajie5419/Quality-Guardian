# quality-loss 模块

## 职责

质量损失记录与分析：损失金额统计、缺陷分类（A/B/C 级）、供应商关联、趋势追踪。

## 文件结构

- `quality-loss.service.ts` — 主 service，CRUD + 统计 + 导入
- `quality-loss.definition.ts` — 模块定义（待删除）

## 对外接口

- `QualityLossService.findAll(params, userinfo)` — 列表查询（分页、筛选、数据权限）
- `QualityLossService.create(data, userinfo)` — 创建损失记录
- `QualityLossService.update(id, data, userinfo)` — 更新
- `QualityLossService.importBatch(rows, userinfo)` — 批量导入

## 调用方

- `api/qms/quality-loss/` — 质量损失路由
- `modules/supplier/` — 供应商评分聚合损失金额
- `modules/dashboard/` — 概览统计

## 依赖

- `~/utils/prisma`
- `~/core/master-data/` — 主数据治理写入
- `~/modules/data-scope/` — 数据权限
- `~/utils/quality-loss-*` — 工具函数（精简后迁入本目录）

## 特殊约束

- 损失分级：A 级 > 5000 元，B 级 1000~5000，C 级 < 1000
- 与供应商评分联动：A/B 级损失影响供应商质量评分
- 导入时必须校验供应商名称是否存在于主数据
