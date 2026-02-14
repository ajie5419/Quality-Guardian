# Production Runbook

## 1. 发布前检查（每次发布必须执行）

1. 代码质量检查

- `pnpm lint`
- `pnpm -C apps/backend typecheck`
- `pnpm test:unit`

2. 发布元信息记录

- `git log --oneline -3`
- `git rev-parse --short HEAD`

3. 回滚可行性确认

- 确认最近一次数据库变更是否向后兼容
- 确认存在明确回滚提交点（commit/tag）

## 2. 发布后健康检查（5 分钟内）

1. 基础健康检查

- `curl -i 'http://<host>/api/status?status=204'` 期望 `204`

2. 鉴权检查

- 无 token 访问鉴权接口，期望返回 `401`

3. 关键业务接口抽查

- `task-dispatch` 列表/创建
- `quality-loss` 列表/更新
- 导入接口任一（验证返回结构）

## 3. 告警阈值（建议）

- `5xx rate > 1%` 持续 5 分钟：`P1`
- `P95 latency > 1.5s` 持续 10 分钟：`P2`
- 导入接口 `errorCount / totalCount > 20%`：`P2`
- DB 连接错误连续 3 次：`P1`
- Redis 连接错误连续 3 次：`P2`（强依赖场景可升 `P1`）

## 4. 日志字段要求

基础字段：

- `traceId`
- `userId`
- `endpoint`
- `method`

业务上下文字段：

- `source`
- `targetId`
- `row`
- `field`
- `reason`

导入接口：

- 至少输出前 50 条 `rowErrors`

## 5. 数据一致性巡检（每日）

1. task-dispatch

- `level = 2` 的任务必须存在有效 `parentId`
- 对应父任务必须为 `level = 1`

2. quality-loss

- `source = Internal` 只更新 `quality_records`
- `source = External` 只更新 `after_sales`
- `source = Manual` 只更新 `quality_losses`

3. 导入统计

- `totalCount = successCount + errorCount`

## 6. 回滚预案

1. 代码回滚

- `git revert <deploy_commit>`
- 或回滚到上一个稳定 tag

2. 数据库策略

- 仅允许向后兼容变更
- 不可逆变更必须准备补偿脚本

3. 回滚后校验

- 重新执行“发布后健康检查”

## 7. 值班响应

- `P1`：5 分钟内响应，15 分钟内给出止损动作
- `P2`：15 分钟内响应，1 小时内给出修复计划
- 每次事故需输出复盘：原因、影响、修复、预防
