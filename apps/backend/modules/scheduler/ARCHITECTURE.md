# scheduler 模块

## 职责

统一定时任务框架：轻量 cron 表达式解析、任务注册表、调度执行器。业务模块通过 `registerCronJob` 声明周期任务，调度器到点执行。设计文档：`docs/scheduler-design.md`。

## 文件结构

```
scheduler/
├── cron-expression.ts        # 5 段 cron 表达式解析与匹配（纯函数）
├── scheduler-registry.ts     # 内存注册表（key → handler）
├── cron-job.service.ts       # 调度执行器：定义落库、到点触发、CAS 防重、错误记录
└── scheduler.module.ts       # 模块声明
```

## 对外接口

- `registerCronJob({ key, cronExpr, description, handler })` — 业务模块注册周期任务
- `runSchedulerTick()` — 单次调度 tick（plugin 轮询调用）
- `syncCronJobDefinitions()` — 注册表落库 cron_jobs 表
- `matchesCronExpression(expr, date)` — 表达式匹配（供测试/工具用）

## 依赖

- `~/utils/prisma` — cron_jobs 表
- `~/utils/logger`
- 业务任务 handler 由各业务模块提供（metrology/inspection/supplier 的 cron/ 子目录），经 `plugins/cron-scheduler.ts` 统一注册

## 特殊约束

- 调度器只做调度，业务规则留在各业务模块 service
- handler 必须幂等；失败必须 logger.error + 记录 lastError
- 多实例部署防重：`lastRunAt` 的 updateMany CAS（同一分钟内只触发一次）
- 新任务：key 全局唯一（`<module>.<action>`），并登记进 `docs/scheduler-design.md` §3
