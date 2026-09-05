# METRIC-GOVERNANCE-001 / PHASE-4G

## First Pass Yield Report Canonical Cutover

### 1. 范围与当前边界

本阶段只为 Report Consumer 建立双轨验证和受控切换准备。现有报告输出继续使用 Legacy Result；未修改历史报告、Metric Definition 或 ACTIVE Version。

| Consumer | 当前实现 | Target | 分类 | 风险 | Rollback |
| --- | --- | --- | --- | --- | --- |
| ReportSummaryService / `/qms/reports/summary` | `getNetPassRateSummaryByRange`，基于检验聚合并四舍五入 | BM-FIRST-PASS-YIELD | NEEDS_MIGRATION / DUAL_RUN_REQUIRED | HIGH | `useCanonical=false`，回到 Legacy |
| Scheduled Report（daily/weekly） | 复用 ReportSummaryService 的 Legacy passRate | BM-FIRST-PASS-YIELD | NEEDS_MIGRATION / DUAL_RUN_REQUIRED | HIGH | 保留原调度及 Legacy 结果 |
| Export Report | 当前导出链路未发现已注册 Canonical Metric 消费 | BM-FIRST-PASS-YIELD | UNKNOWN | MEDIUM | 不切换，继续原导出 |
| Quality Summary | 复用 ReportSummaryService 的 Legacy passRate | BM-FIRST-PASS-YIELD | NEEDS_MIGRATION / DUAL_RUN_REQUIRED | HIGH | `useCanonical=false` |

### 2. 双轨结果

观察窗口：`2025-08-01` 至 `2026-07-31`。

| Scope | Legacy Result | Canonical Result | Classification | 说明 |
| --- | --: | --: | --- | --- |
| ALL | 99.96 | 99.95880078595424 | MATCH | 采用既有 display precision policy（2 位小数）后相同 |
| DEPT | NULL | NULL | MATCH | 分母为 0，按 Zero Denominator Policy 返回 NULL |
| SELF | NULL | NULL | MATCH | 分母为 0，按 Zero Denominator Policy 返回 NULL |

Evidence 来源：PHASE-4C/4D 的 Dual Run Evidence；本阶段 Report Adapter 可复用相同窗口、scope 和持久化证据链。

### 3. Report Adapter

实现位置：`apps/backend/modules/metric-governance/metric-first-pass-yield-consumer-adapter.ts`。

- Forward：Report Consumer → `getFirstPassYieldForReport({ useCanonical: true })` → Canonical Metric Adapter。
- Rollback：`useCanonical: false` → `getLegacyInspectionPassRateSummaryByRange`，保留原公式和原数据源。
- Adapter 不改写历史报告，不删除 Legacy Calculation，也不改变 ACTIVE Version。

### 4. Cutover Gate

只有同时满足以下条件，才允许后续报告消费者切换：

1. 每个窗口和 ALL/DEPT/SELF scope 均有完整 evidence（metricCode、version、window、scope、result、classification）。
2. Diff 属于 MATCH 或有业务负责人确认的可解释 MINOR_DIFF；`BUSINESS_REVIEW_REQUIRED` 和 `BLOCKED` 均阻止切换。
3. Forward 与 Rollback 均可执行，并保留 Legacy Calculation。
4. Report、Scheduled Report、Export Report 和 Quality Summary 的数据范围一致。

当前观察窗口满足双轨对账和回滚条件，但 Report Consumer 尚未实际切换；Export Report 仍需单独确认其 Canonical 依赖。

### 5. 保护边界

- 不删除 Legacy Calculation。
- 不修改历史报告或历史指标数据。
- 不修改 Metric Definition、Definition Version 或 ACTIVE 状态。
- 不执行 Dashboard、Report、Projection 的实际输出切换。
