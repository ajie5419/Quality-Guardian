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
