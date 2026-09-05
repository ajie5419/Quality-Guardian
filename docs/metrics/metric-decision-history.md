# METRIC-GOVERNANCE-001 / Metric Decision History

## 1. Decision Timeline

| Phase | Event | Evidence | Registry / Consumer Impact |
| --- | --- | --- | --- |
| PHASE-0 | 指标资产普查与冲突识别 | metric-inventory.md、metric-conflict-report.md | 只读，无迁移 |
| PHASE-1 | 建立 Metric Registry 与首批 10 项 DRAFT/v1 | metric-registry.md、Registry bootstrap | 未激活、未迁移消费者 |
| PHASE-1.5 | 形成业务决策准备包 | metric-business-decisions.md | Decision 尚未批准 |
| PHASE-1.6 | 形成 Approval Sheet | metric-approval-sheet.md | 原始表格保留待决字段 |
| PHASE-1.6B | 人工决策固化为 Approval Evidence | metric-approval-sheet.md §9 | 不改 Registry，不进入 PHASE-2 |

## 2. Previous Proposal

此前提案包含：合格率、质量损失、问题结案、工单完成和 DFMEA 的概念拆分；供应商统一指标概念并保留双 Policy；复检优先 Request-level；车辆指标在缺少可靠 exposure 时降级为 Count；归档使用模板任务分母候选；Owner 使用 Suggested Matrix 但不自动写入 Owner ID。

## 3. Final Decision

| Decision ID | Final decision | Status | Decision By |
| --- | --- | --- | --- |
| D01 | PASS RATE 拆分为 First Pass Yield / Final Pass Rate | APPROVED | Human Business Approval |
| D02 | 建立独立 Final Pass Rate | APPROVED | Human Business Approval |
| D03 | QUALITY LOSS 拆分 Gross / Net / Claim Recovery | APPROVED | Human Business Approval |
| D04 | PROBLEM CLOSURE 拆分 Closure / On-time Closure | APPROVED | Human Business Approval |
| D05 | Supplier Score 统一概念、保留 Standard/Resident 两套 Policy | APPROVED | Human Business Approval |
| D06 | 复检优先 Request-level，revision 不稳定时不得自动换方案 | APPROVED_WITH_POLICY_PENDING | Human Business Approval |
| D07 | 工单完成拆分 Point Completion / Quantity Coverage | APPROVED | Human Business Approval |
| D08 | 车辆当前只发布 Failure Count | APPROVED | Human Business Approval |
| D09 | 归档分母为模板已生成且非取消/N/A 任务 | APPROVED | Human Business Approval |
| D10 | 归档使用 task dueAt，日历规则待定 | APPROVED_WITH_POLICY_PENDING | Human Business Approval |
| D11 | DFMEA 拆分 RPN Value / Risk Band | APPROVED | Human Business Approval |
| D12 | Risk Band 阈值暂不批准 | APPROVED_WITH_POLICY_PENDING | Human Business Approval |
| D13 | Suggested Business Owner 作为业务责任归属，不强制唯一 Owner ID | APPROVED | Human Business Approval |
| D14 | PHASE-2 前必须完成历史可计算性与 DataScope 验证 | APPROVED | Human Business Approval |

## 4. Impact

- Canonical metric 概念已获得人工批准，但尚未写入 Definition Version。
- 旧 BM Registry 记录仍保持 PHASE-1 的生命周期状态；本记录不执行 DEPRECATE、NEW_VERSION 或 ACTIVE。
- Dashboard、Report、Projection、API stats、Export、Worker、Supplier Score、DFMEA 和其他消费者均不迁移。
- D13 不写入 ownerDeptId；联合责任保持联合，UNKNOWN Policy/Data Owner 保持 UNKNOWN。
- D14 形成 PHASE-2 前置验证要求，不代表 PHASE-2 已开始。

## 5. Remaining Policy Pending

1. D06：request revision 的稳定识别与复检去重执行 Policy。
2. D10：自然日/工作日及节假日日历 Policy。
3. D12：Risk Band 阈值、版本和生效日期。
4. 所有指标的正式 Effective Date、Definition Version、历史回算结果和 DataScope 验证证据。

## 6. Record Boundary

本文件是审计历史记录，不是可执行公式、SQL、JavaScript、DSL 或 Registry Version。下一阶段如需 Registry finalization，必须依据本文件和 PHASE-2 Gate 单独执行。
