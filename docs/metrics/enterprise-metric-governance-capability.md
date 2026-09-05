# METRIC-GOVERNANCE-001 / PHASE-5

## Enterprise Metric Governance Capability

本文定义企业级指标治理能力基线，整合 Metric Registry、Canonical Metric、Approval Evidence、Shadow Validation 和 Consumer Migration Framework。本文是治理设计与运行边界，不代表任何业务规则已获自动批准。

## 1. 分层审批体系

| Layer | Approval Object | Evidence | Scope |
| --- | --- | --- | --- |
| Metric Policy Approval | 业务定义、公式、Scope、边界、容差 | Policy Approval Evidence | 指标全生命周期 |
| Version Approval | Definition Version、来源字段、公式 Hash、有效期 | Version Approval Evidence | 指定 Version |
| Consumer Cutover Approval | 指定 Consumer 的 Legacy → Canonical 切换 | Consumer Cutover Evidence | 指定 Metric + Consumer |
| Historical Backfill Approval | 批量回算窗口、Scope、执行方式和结果 | Backfill Approval Evidence | 指定 Batch Job |

审批必须逐层完成。上层批准不自动批准下层动作；所有证据 append-only、可审计、可追溯。

## 2. Historical Recalculation Governance

历史回算以 Batch Job 为单位，禁止逐历史记录审批。

### Batch Backfill Job

每个 Job 固定记录：

- `batchJobId`、`metricCode`、`version`
- execution window 与 ALL/DEPT/SELF Scope
- source snapshot、formula Hash、DataScope identity
- startedAt、completedAt、operator、execution mode
- rowCount、successCount、exceptionCount、result checksum

### Evidence 与 Validation Summary

正常数据由批量流程自动处理，并生成 Batch Job Evidence。Validation Summary 必须核对：

- 成功数 + 异常数 = 输入数。
- Formula、Version、Policy 和 Scope 与批准证据一致。
- 时间、软删除、去重和来源边界符合定义。
- Legacy/Canonical 差异分类可解释且在批准容差内。
- 结果可重复计算，checksum 一致。

### Exception Queue 与 Manual Review

身份无法解析、数据重复、来源缺失、公式/Version 不匹配、超出容差或执行失败的记录进入 Exception Queue。异常记录保留原值、候选值、原因、Batch Job 和处理状态；只有异常需要人工复核，复核结果追加 Evidence，不覆盖批次原始证据。

## 3. Metric Lifecycle

```text
DRAFT → ACTIVE → DEPRECATED → ARCHIVED
```

| State | Meaning | Governance Rule |
| --- | --- | --- |
| ACTIVE | 已完成 Policy、Version、Owner、Scope、Approval 和必要 Validation | 可被已批准 Consumer 使用 |
| DEPRECATED | 不再接受新 Consumer，但保留历史可追溯性 | 禁止新增依赖，允许受控回滚/历史查询 |
| ARCHIVED | 生命周期终止，仅保留审计和历史证据 | 禁止生产消费和新 Version |

生命周期转换必须使用 CAS、Audit Record 和不可变 Version；不得覆盖历史 Formula、Evidence 或历史结果。

## 4. 批量治理运行模型

```text
Approved Policy
  ↓
Approved Version
  ↓
Batch Backfill / Shadow Validation
  ↓
Validation Summary
  ├─ Normal → automatic completion
  └─ Exception → manual review queue
  ↓
Consumer Cutover Approval
  ↓
Controlled Consumer Migration
```

正常数据自动处理，异常数据 fail-closed。Consumer 切换必须同时具备 Approval Evidence、Shadow/Dual Run Evidence、DataScope 一致性和可执行 Rollback。

## 5. 企业级边界

- 不修改现有业务指标结果或历史事实数据。
- 不自动批准业务规则、容差、Owner、Effective Date 或 Decision By。
- 不以批量处理绕过 Policy、Version 或 Consumer Approval。
- 不删除 Legacy Calculation；Deprecated/Archived 仍保留完整 lineage 和审计轨迹。
- 所有历史回算、异常复核和消费者切换均可按 Batch Job、Evidence 和 Audit Record 追溯。

## 6. 当前实施状态

本阶段完成企业级能力基线和运行规则汇总；现有具体指标仍须按其审批证据和 Readiness Gate 单独推进。未执行消费者切换、历史回算或业务规则自动批准。
