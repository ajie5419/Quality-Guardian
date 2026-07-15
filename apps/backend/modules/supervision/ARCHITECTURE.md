# supervision 模块

## 职责

质量监督检查全流程：监督项目立项 → 计划任务分配 → 问题发现与跟踪 → 报告输出。

## 文件结构

- `supervision.service.ts` — 监督主服务（项目级操作）
- `supervision-project.service.ts` — 监督项目 CRUD
- `supervision-plan-task.service.ts` — 计划任务分配与执行
- `supervision-issue.service.ts` — 问题记录与整改跟踪
- `supervision-report.service.ts` — 监督报告生成
- `supervision-shared.ts` — 模块内共享工具函数

## 对外接口

所有子服务通过 `index.ts` 统一导出。调用方按需 import 具体 service。

## 依赖

- `~/utils/prisma`
- `~/modules/data-scope/` — 数据权限

## 特殊约束

- 子服务之间有调用关系（issue 关联 plan-task，report 汇总 issue）
- 监督项目有状态流转：草稿 → 进行中 → 已完成

## 供应商身份契约与治理阶段

- `supervision_projects.supplierId` 是供应商关联 ID，`supplierName` 仅为名称快照；服务端应根据 ID 校验并生成 canonical 名称。
- `supplierName` 查询仅用于关键字搜索和历史数据排查，不得用于画像、统计或跨表关联，也不得以名称作为 ID 缺失时的在线回退。
- 当前 supervision 在线写入已要求 `supplierId`，服务端按 ID 重建 canonical 名称快照；本模块尚未纳入本轮供应商身份存量回填及 unresolved 审计。
- 后续治理 wave 必须补齐 supervision 存量回填、审计和生产指标核对；任何 import/backfill 名称解析都必须建立显式白名单和审计。

本轮 supplier identity governance wave 不代表 supervision 存量或其他主数据已达到全项目 `ID_ONLY`。通用规则见 `docs/master-data-identity-governance.md`。
