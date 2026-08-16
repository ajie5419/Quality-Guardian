# 统一定时任务框架设计（Cron Scheduler Framework）

> 状态：✅ 已实现（2026-08-16）。本设计文档为 `modules/scheduler/` 的权威依据。
> 相关：`docs/PROJECT_GUIDE.md`、`docs/data-contract.md`（字段治理/错误码规则同样适用本模块）。

## 1. 目标与背景

### 1.1 解决的问题

项目当前**没有统一的定时任务机制**：

- 唯一轮询是焊工评分 worker 的硬编码 `setInterval`（5 秒），无调度注册表、无 cron 概念
- 到期提醒（计量检定、焊工证、不合格品超时）只能靠用户查询时临时计算（如 metrology 的 `expiredCount`），**没有主动扫描 + 推送**
- 周期性任务（供应商月度快照、周报生成）没有挂载点，将来必然散落成各模块手写 setInterval

### 1.2 目标

1. 提供一个**统一调度注册表**：任何模块声明"我的周期任务"（`registerCronJob`），框架负责到点触发
2. 复用现有**租约队列机制**（`metric_refresh_jobs` 的 claim/lease/重试模式），保证分布式安全、幂等、可重试
3. **首个落地的任务**：计量器具检定到期提醒、不合格品超时催办、供应商评分月度快照
4. 与现有 worker 模式一致（nitro plugin 启动、`setInterval` 轮询、`unref`），不引入新依赖

## 2. 架构设计

### 2.1 组件总览

```
apps/backend/plugins/cron-scheduler.ts        ← 启动入口（第 4 个 worker）
        │  每 60 秒轮询一次 cron_jobs 表
        ▼
modules/scheduler/
├── scheduler.module.ts                        ← 模块声明
├── cron-job.service.ts                        ← 注册表 + 执行器（核心）
├── cron-expression.ts                         ← 轻量 cron 表达式解析/匹配
├── scheduler-registry.ts                      ← 内存注册表（key → handler）
└── index.ts                                   ← 对外导出
        │  到点
        ▼
modules/metrology/cron/due-reminder.ts        ← 业务任务 1：计量到期提醒
modules/inspection/cron/nc-overdue.ts         ← 业务任务 2：NC 超时催办
modules/supplier/cron/monthly-snapshot.ts     ← 业务任务 3：供应商月度快照
```

### 2.2 数据表（新增 1 张）

```prisma
model cron_jobs {
  id          String    @id @default(cuid())
  jobKey      String    // 唯一任务键（如 'metrology.due-reminder'）
  cronExpr    String    // cron 表达式（5 段：分 时 日 月 周）
  description String?
  enabled     Boolean   @default(true)
  lastRunAt   DateTime? // 上次执行时间（防止重复触发）
  lastStatus  String?   // 'ok' | 'error'
  lastError   String?   @db.Text
  isDeleted   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([jobKey, isDeleted])
  @@index([enabled, isDeleted])
}
```

> 与 `metric_refresh_jobs` 的分工：`cron_jobs` 是**调度定义**（何时跑），`metric_refresh_jobs` 是**任务执行队列**（跑什么、可重试）。调度器到点后把具体工作**投递进租约队列**消费，保持与现有 worker 完全一致的幂等/重试语义。简单任务也可直接同步执行（见 2.4）。

### 2.3 cron 表达式

采用标准 5 段 cron：`分 时 日 月 周`（`0 8 * * *` = 每天 8:00）。

支持的语法（轻量实现，覆盖本项目需求）：
- 数字：`0 8 * * *`
- 通配：`*`（任意）
- 列表：`1,15`（分钟列表）
- 范围：`1-5`（周内 1-5，即周一至周五）

不支持的（本项目不需要，如遇需求再扩展）：`*/n` 步进、`L`、`W`、`#`。

### 2.4 执行语义

```
每 60s：
  1. 查 cron_jobs 中 enabled && 到点（cron 匹配当前时间 && lastRunAt 早于本分钟）
  2. 对每个到点任务：
     a. 同步执行 handler（简单任务，如到期提醒扫描）
     b. 或投递 metric_refresh_jobs（重量任务，如供应商月度快照全量重算）
  3. 更新 lastRunAt / lastStatus / lastError
```

**防止重复触发**：`lastRunAt` 记录上次执行，同一分钟内只触发一次；多实例部署时用 `updateMany({ where: { id, lastRunAt: 旧值 } })` CAS 抢占（与现有队列 lease 机制同思路）。

### 2.5 注册表 API（业务模块使用）

```typescript
// scheduler-registry.ts
interface CronJobDefinition {
  key: string;          // 全局唯一，如 'metrology.due-reminder'
  cronExpr: string;     // '0 8 * * *'
  description?: string;
  handler: () => Promise<void>;   // 同步执行（适合轻量扫描）
}

export function registerCronJob(def: CronJobDefinition): void;
```

业务模块在自身 `*.module.ts` 加载时调用 `registerCronJob`，或由 cron-scheduler plugin 统一注册。

## 3. 首批任务定义

| key | cron | 行为 | 执行方式 |
| --- | --- | --- | --- |
| `metrology.due-reminder` | `0 8 * * *`（每天 8:00） | 扫 `measuring_instruments` 中 `nextCalibrationDate` 在 30 天内到期且未软删的器具 → Telegram 通知计量管理员 | 同步扫描 + 通知 |
| `inspection.nc-overdue` | `0 9 * * *`（每天 9:00） | 扫 OPEN 状态超过 N 天（默认 7 天）的不合格项 → 通知责任人 | 同步扫描 + 通知 |
| `supplier.monthly-snapshot` | `0 2 1 * *`（每月 1 日 2:00） | 触发供应商评分全量快照（投递 metric_refresh_jobs） | 投递队列 |

> 通知通道：优先复用 `utils/telegram-bot.ts`；后续可扩展微信订阅消息（现有 `wx-subscribe-message`）。

## 4. 实现步骤

1. **schema**：新增 `cron_jobs` 表（`prisma migrate dev --name add_cron_jobs`）
2. **模块**：`modules/scheduler/`（cron-expression.ts → scheduler-registry.ts → cron-job.service.ts → scheduler.module.ts）
3. **plugin**：`plugins/cron-scheduler.ts`（启动轮询）
4. **业务任务**：metrology / inspection / supplier 三个 cron handler + 注册
5. **注册表落库**：启动时把注册表中的定义 upsert 进 `cron_jobs`（保证表里有记录）
6. **测试**：cron-expression 单测 + 调度器触发逻辑单测
7. **门禁**：`pnpm lint && check:type && check:qms-arch && check:docs-drift` 全绿

## 5. 约束与规范

- 本模块遵循项目全部硬约束（cuid、BusinessError、createModuleLogger、软删除、三层架构）
- 调度器只做"调度"：业务逻辑必须留在各业务模块的 service 中，scheduler 不承载业务规则
- 任务 handler 必须幂等（重复触发不产生重复副作用），失败必须 `logger.error` 并记录 `lastError`
- 新任务加入时：定义 key 必须全局唯一（`<module>.<action>` 命名），并在本设计文档登记
- 与四层载体分工一致：本设计文档是 docs 正文，任务清单同步进 PROJECT_STATE

## 6. 验证标准

- [x] `pnpm --dir apps/backend exec vitest run modules/scheduler` 通过（13/13：cron 解析 7 + 调度器 6）
- [x] `QMS_ARCH_SCOPE=all bash scripts/check-qms-architecture.sh` 0 violations
- [x] `bash scripts/check-docs-drift.sh` PASSED
- [x] 相关模块全量回归：108 测试文件 / 1186 用例通过（metrology/inspection/supplier 无回归）
- [ ] 生产环境验证：本地启动后端，观察 cron-scheduler plugin 启动日志与 cron_jobs 表落库（待真实运行）
