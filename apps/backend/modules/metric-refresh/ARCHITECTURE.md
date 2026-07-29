# metric-refresh 模块

## 职责

持久化派发派生指标刷新任务，提供并发安全的租约抢占、完成确认、失败重试和发布清零检查。

## 业务边界

- 本模块只管理任务生命周期，不读取业务源表，也不计算任何指标。
- 业务模块必须在修改指标来源数据的同一个数据库事务内写入任务。
- 指标消费者负责幂等重算，并且只有在重算成功后才能确认任务完成。
- 过期租约必须可重新抢占，进程退出不能导致任务永久丢失。
- 失败任务必须持久化错误并延迟重试，禁止吞掉异常或仅写日志。

## 对外接口

- `MetricRefreshQueue.enqueueSupplierScores(client, supplierIds, reason)` — 在指定 Prisma client/事务内追加供应商评分刷新任务。
- `MetricRefreshQueue.claimSupplierScoreJobs(options)` — 以租约方式抢占一批待处理或可重试任务。
- `MetricRefreshQueue.completeSupplierScoreJobs(jobIds, workerId)` — 确认当前 Worker 持有的任务已完成。
- `MetricRefreshQueue.failSupplierScoreJobs(jobs, workerId, error)` — 记录失败并按尝试次数延迟重试。
- `MetricRefreshQueue.countOutstandingSupplierScoreJobs()` — 返回发布门禁需要清零的任务数。

## 依赖

- `~/utils/prisma` — 持久化任务并执行抢占条件更新。

## 调用方

- `inspection/`、`after-sales/`、`supplier-identity/`、`team/` — 在源数据事务内派发任务。
- `supplier/` — 消费任务并重算供应商评分快照。
- 发布维护脚本 — 建立全量覆盖任务、同步消费并执行清零门禁。
