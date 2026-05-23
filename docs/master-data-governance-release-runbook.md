# 主数据治理上线执行清单（统一治理系统）

## 1. 目标

- 按统一口径在目标环境（测试/预发/生产）复跑治理门禁。
- 固定归档执行日志与证据 JSON，支持审计与回溯。
- 任何关键指标不达标直接阻断发布。

## 2. 前置条件

- 已配置可访问目标数据库的 `DATABASE_URL`。
- 代码分支已合并本次治理改动。
- 具备执行 `pnpm` 与 `node` 环境。

## 3. 一键执行（推荐）

使用统一脚本：

```bash
TARGET_ENV=staging \
DATABASE_URL='mysql://<user>:<password>@<host>:3306/<db>?connection_limit=10&pool_timeout=60' \
scripts/local/master-data-release-audit.sh
```

生产环境示例：

```bash
TARGET_ENV=production \
DATABASE_URL='mysql://<user>:<password>@<host>:3306/<db>?connection_limit=10&pool_timeout=60' \
scripts/local/master-data-release-audit.sh
```

输出目录：

- `tmp/master-data-governance/releases/<targetEnv>-<timestamp>/`
  - `metadata.txt`
  - `logs/*.log`
  - `evidence/*.json`

## 4. 执行内容（脚本内置）

1. `check:master-data-release-gate`
2. `check:master-data-objective-audit`
3. 归档最新证据：

- backlog report
- consistency report
- governance report
- read coverage report
- write coverage report
- objective audit report

## 5. 阻断标准（必须全部满足）

- 发布门禁命令返回 `0`。
- objective audit `summary.fail=0` 且 `summary.warn=0`。
- 一致性指标归零：
- `totalMissingCanonicalId=0`
- `totalInvalidCanonicalId=0`
- `totalOrphanValues=0`
- 覆盖指标归零：
- `read coverage totalMissingHits=0`
- `write coverage totalMissingHits=0`

## 6. 常用控制参数

- `TARGET_ENV`：环境标签（`local/staging/production`）。
- `OUT_ROOT`：归档根目录（默认 `tmp/master-data-governance/releases`）。
- `SKIP_RELEASE_GATE=true`：跳过 release gate（仅调试）。
- `SKIP_OBJECTIVE_AUDIT=true`：跳过 objective audit（仅调试）。
- `DRY_RUN=true`：仅打印命令，不执行。

## 7. 失败处理

- `lint/typecheck` 失败：先修代码质量问题，重新执行。
- `consistency` 失败：先修数据一致性，再重跑。
- `coverage` 失败：补齐治理 helper 接入点并重跑。
- `objective audit` 失败：按报告 `items[].key` 定位未达标项。

## 8. 与主 runbook 关系

- 本文档聚焦“主数据治理专项上线口径”。
- 通用发布规范继续参考：
  - `docs/runbook-production.md`
