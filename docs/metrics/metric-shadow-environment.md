# METRIC-GOVERNANCE-001 / PHASE-2C.1

## Shadow Execution Environment

Shadow execution 必须使用独立的 `DATABASE_URL_SHADOW`，禁止复用生产连接串。

### Database Permissions

- Shadow 数据库使用独立只读账号。
- 账号只允许执行指标来源查询和必要的 `EXPLAIN`/聚合读取。
- 禁止 `INSERT`、`UPDATE`、`DELETE`、DDL、migration、seed 和 projection refresh。
- Shadow 环境不得连接生产数据库；连接串通过受控运行环境注入，不写入仓库。

### Run Configuration

每次运行必须提供：

```text
executionWindow.startDate
executionWindow.endDate
scope: ALL | DEPT | SELF
metricCode
```

`DEPT` 必须提供 department identity，`SELF` 必须提供 user identity；缺失身份直接 `BLOCKED`。

### Preflight

运行前必须同时满足：

1. `DATABASE_URL_SHADOW` 存在且非空；
2. DataScope identity 与 scope 匹配；
3. Metric Adapter 已登记；
4. `startDate < endDate`。

任何校验失败都只生成 `BLOCKED` 状态和原因，不生成 Current/Canonical 数值或 Evidence。

### Security Boundary

该环境只用于 Shadow Validation。禁止激活 Metric、修改 Dashboard/Report/Projection、改变业务计算逻辑、写入生产数据或修改历史指标。
