# METRIC-GOVERNANCE-001 / PHASE-6

## Core Business Metrics Migration Plan

本阶段复用既有企业级治理能力，为四项核心指标建立统一迁移路径。本文是批量迁移计划，不代表已完成 Shadow、业务批准或 Consumer Cutover。

## 1. Unified Migration Pipeline

每项指标按以下顺序执行：

1. Legacy Calculation Inventory
2. Canonical Definition Mapping
3. Shadow Validation（ALL/DEPT/SELF 或适用范围）
4. Dual Run Evidence
5. Business Approval（Policy / Version / Tolerance）
6. Consumer Migration（逐 Consumer Cutover Approval）

历史回算统一使用 Batch Backfill Job、Validation Summary 和 Exception Queue；正常记录批量处理，只有异常人工复核。

## 2. Metric Migration Matrix

| Metric | Canonical Definition | Current Governance | Shadow/Dual Run | Business Approval | Consumer Migration |
| --- | --- | --- | --- | --- | --- |
| BM-PROBLEM-CLOSURE-RATE | 约定问题集合中已关闭问题的比例；需与 On-time Closure 分离 | ACTIVE v1 结构存在；零分母、跨期和分母制度仍需确认 | Adapter 已登记；需按 issue source 与 Scope 运行 | D04 已批准拆分，但最终 cohort/deadline 规则需确认 | Inspection issue stats、NC Dashboard、周/月报；ADAPTER_LAYER + DUAL_RUN_REQUIRED |
| BM-SUPPLIER-FINAL-SCORE | 统一最终评分概念，保留普通供应商与驻厂外协两套 Policy | ACTIVE/Policy 需逐项确认；两套 Policy 不得硬合 | 需按 Supplier Policy、等级、阈值分别运行 | Policy、权重、扣分、阈值、等级和冻结规则需业务批准 | Supplier score、等级、预警、冻结、快照；ADAPTER_LAYER + DUAL_RUN_REQUIRED |
| BM-REINSPECTION-RATE | 推荐 Request-level 复检事件 / eligible 已检验任务 | Policy pending：revision key 与 deduplication rule 未关闭 | 阻塞直到 request revision 稳定可识别；不得自动改选 Object-level | D06 已批准优先 Request-level，仍需制度确认空分母和去重 | Inspection Dashboard、供应商/部门卡片、趋势；DUAL_RUN_REQUIRED |
| BM-VEHICLE-FAILURE-COUNT | 车辆故障事件数量，不宣称 Rate/Intensity | Count 口径已批准；不引入 exposure denominator | 需验证事件去重、保修范围和人工覆盖 | D08 已批准 Count only；Rate/Intensity 保持独立 Pending | Vehicle failure Dashboard、Report、Export；ADAPTER_LAYER，Rate/Intensity LEGACY_KEEP |

## 3. Per-Metric Execution Requirements

### BM-PROBLEM-CLOSURE-RATE

- Inventory：`inspection-issue-stats.service.ts`、NC 页面和报告入口分别记录新增/存量分母与关闭状态。
- Canonical：问题 ID 去重；Closure Rate 与 On-time Closure Rate 不混用。
- Shadow：核对 closed status、跨期问题、零分母和 ALL/DEPT/SELF。
- Approval：先完成 cohort、deadline、zero-denominator Policy，再允许消费者切换。
- Backfill：按窗口批量回算；跨期和无 deadline 项进入 Exception Queue。

### BM-SUPPLIER-FINAL-SCORE

- Inventory：供应商评分服务、快照、等级判断和前端规则展示均需记录 Policy 来源。
- Canonical：共享输出结构，但保留 `STANDARD_SUPPLIER_SCORE_POLICY` 与 `RESIDENT_OUTSOURCING_SCORE_POLICY`。
- Shadow：分别对两套 Policy 做 Dual Run，比较原始分数、等级、冻结和预警结果。
- Approval：权重、扣分、阈值、等级、冻结和历史比较必须由供应链/品质批准。
- Backfill：历史快照按 Policy Version 批处理；Policy 缺失或身份冲突进入 Exception Queue。

### BM-REINSPECTION-RATE

- Inventory：识别现有 request stats、复检展示和趋势入口，禁止把分布占比当复检率。
- Canonical：优先 Request-level；revision key 不稳定时保持 BLOCKED，不自动选择其他定义。
- Shadow：验证一次 Request 的去重、eligible population、取消/未结论排除和零分母。
- Approval：完成 revision key、deduplication rule、空分母和 Scope Policy 后才可继续。
- Backfill：无法稳定识别 revision 的历史行只进 Exception Queue，不猜测复检事件。

### BM-VEHICLE-FAILURE-COUNT

- Inventory：车辆调试、售后和故障报告入口记录事件来源与去重键。
- Canonical：只发布 Count；不将车辆数、里程或保修 exposure 推导为 Rate/Intensity。
- Shadow：比较事件数、时间窗口、保修范围、重复事件和人工录入覆盖。
- Approval：确认故障事件定义和去重规则；Rate/Intensity 另行 Policy Approval。
- Backfill：按事件窗口批处理；缺少车辆身份或重复事件进入 Exception Queue。

## 4. Governance Gates

每项指标必须通过以下 Gate 才能进入下一步：

| Gate | Required Evidence | Failure Result |
| --- | --- | --- |
| Policy | Metric Policy Approval、边界、Scope、容差 | 保持 DRAFT/BLOCKED |
| Version | Immutable Version Approval、formula/source trace | 不创建 ACTIVE Consumer |
| Shadow | ALL/DEPT/SELF 结果和 DataScope 证据 | BLOCKED，不猜测结果 |
| Dual Run | Legacy/Canonical、Diff Classification、可解释差异 | BUSINESS_REVIEW_REQUIRED |
| Consumer | Consumer Cutover Approval、Rollback 配置和 Audit | 保持 Legacy |
| Historical | Batch Evidence、Validation Summary、异常关闭 | 不标记批次完成 |

## 5. Hard Boundaries

- 不重复建设治理模型，复用既有四层审批和历史回算治理。
- 不逐条审批正常历史数据。
- 不删除 Legacy Logic、Legacy Query 或历史 Evidence。
- 不修改历史事实数据；历史回算仅能通过已批准的 Batch Job 写入独立派生结果。
- 未完成业务批准、Shadow/Dual Run 或 Rollback 校验时，不迁移任何消费者。
