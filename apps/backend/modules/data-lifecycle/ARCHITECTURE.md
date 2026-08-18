# data-lifecycle 模块

## 职责

数据生命周期治理：保留期规则登记（data_retention_rules）、归档框架（P3 起）、到期处置（P5）。

## 关键表

- data_retention_rules：数据类 → 保留天数 + 处置动作（ARCHIVE/DELETE/PURGE），幂等种子 DEFAULT_RETENTION_RULES
- data_lifecycle_jobs：归档任务队列（预留，当前处置直接执行）

## 对外接口

- DataRetentionRuleService.listRules / updateRule
- runLifecycleArchive（ARCHIVE 打标记 + 快照 DELETE，每日 02:00 cron data-lifecycle.daily-archive）
- ensureDefaultRetentionRules（启动/首次调用时补齐默认规则）

## 关联

- docs/data-lifecycle.md（设计文档）
- modules/system-log/cron/audit-log-cleanup.ts（P1 审计日志清理任务）
