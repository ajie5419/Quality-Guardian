# METRIC-GOVERNANCE-001 / PHASE-2C.4

## Shadow Environment Provisioning & Real Run Preparation

本手册定义 Shadow Environment 的正式运行准备流程。Shadow Environment 只允许读取隔离数据，不改变生产数据、指标输出或消费者。

## Shadow Database Architecture

- 使用独立 Shadow Database，与生产数据库实例、账号和连接串隔离。
- 运行任务只调用已登记的 Metric Calculation Adapter。
- Shadow 查询必须沿用来源模块的 DataScope 和身份约束。
- 输出为 append-only Shadow Evidence，不写入业务指标表。

## Shadow Connection Configuration

运行环境必须显式注入 `DATABASE_URL_SHADOW`。连接串不得写入仓库、日志或文档。

禁止：

- fallback 到 `DATABASE_URL`
- 连接生产数据库
- 自动创建 Shadow Database
- 执行 migration、seed 或 projection refresh

## Readonly Account Requirements

Shadow 账号必须具备：

- 独立数据库身份
- 来源表的 SELECT 权限
- 必要的聚合查询权限
- 明确拒绝 INSERT、UPDATE、DELETE、DDL 和 migration 权限

账号只读验证失败时，运行状态必须为 `BLOCKED`。

## Required Tables

首批指标的来源依赖至少包括：

- `quality_loss_index`
- `inspections`
- `quality_records`

实际执行前必须按 Adapter 的 Source Query 再次核对表、字段和最小读取权限。任一依赖表缺失时不得生成结果。

## Metric Adapter Dependencies

| Metric | Adapter | Source Dependency |
| --- | --- | --- |
| `BM-GROSS-QUALITY-LOSS` | Quality Loss Adapter | `quality_loss_index`、质量损失趋势查询 |
| `BM-FIRST-PASS-YIELD` | Pass Rate Adapter | `inspections`、检验合格率查询 |
| `BM-PROBLEM-CLOSURE-RATE` | Problem Closure Adapter | `quality_records`、问题关闭统计查询 |

Adapter 未注册、不可导入或 Source Query 不可访问时，状态为 `BLOCKED`。

## DataScope Identity Requirements

执行必须分别准备：

- `ALL`：具备允许全量读取的已认证身份
- `DEPT`：具备有效部门身份及部门范围
- `SELF`：具备有效用户身份及个人范围

身份缺失、范围不匹配或无法解析时，不得降级为更宽范围，必须 `BLOCKED`。

## Preflight Checklist

执行 Real Shadow Run 前逐项确认：

- [ ] `DATABASE_URL_SHADOW` 已注入
- [ ] Database Identity 已核对为独立 Shadow DB
- [ ] Connection Status 为 `CONNECTED`
- [ ] Readonly Permission 验证为 `PASS`
- [ ] Required Tables 全部可读
- [ ] 三个 Metric Adapter 均已注册且可访问
- [ ] `ALL` Scope Identity 已确认
- [ ] `DEPT` Scope Identity 已确认
- [ ] `SELF` Scope Identity 已确认
- [ ] execution window 已明确

任一项失败，整体状态为 `BLOCKED`，禁止生成 Current Result、Canonical Result 或 Shadow Evidence。

## Status Definition

### READY

全部 Preflight Checklist 通过，可进入 Real Shadow Run。

### BLOCKED

以下任一情况成立：

- `DATABASE_URL_SHADOW` 缺失
- 数据库不可连接
- 账号非只读
- 依赖表缺失
- Adapter 未注册或不可访问
- Scope Identity 缺失或不匹配

## Operating Flow

1. 配置隔离 Shadow DB 与只读账号
2. 执行 Environment Validation
3. 确认 Preflight 状态为 `READY`
4. 执行固定窗口的 ALL/DEPT/SELF Real Shadow Run
5. 生成带窗口、范围、Current、Canonical、Diff 和 Classification 的 Shadow Evidence
6. 由业务负责人完成 Business Review
7. 在 Evidence 和 Approval 均满足前，保持 Metric 为 DRAFT

本阶段不激活 Metric，不迁移 Dashboard、Report 或 Projection。
