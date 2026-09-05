# 数据完整性基线（Data Integrity）

> 权威文档：承载 DATA-INTEGRITY-001 统一治理模型的落地页。每个专项完成后在此登记分类结论与实施范式；业务代码遵守本页规则，Architecture Guard 与测试强制增量不回归。

## 1. 统一目标范式（DATA-INTEGRITY-001 / PHASE-0 结论）

按业务风险分类，不搞「所有表都加 version / 所有操作都加幂等键」的过度设计：

| 场景 | 范式 |
| --- | --- |
| A. 普通低风险资料 | Last Write Wins |
| B. 多人协同关键质量记录 | Optimistic Lock（version 进 WHERE，成功后 increment） |
| C. 状态转换 | CAS + Explicit State Machine（409 非法跳转） |
| D. 唯一创建 | DB Unique + Upsert / Conflict Handling |
| E. 可重复请求 | Idempotency Key（专项另行实施） |
| F. DB 内多表一致性 | Transaction（同库副作用入同一事务） |
| G. DB + 外部副作用 | Transactional Outbox / After Commit（专项另行实施） |
| H. Worker / Scheduler | Lease + CAS + Idempotent Consumer |

## 2. 副作用三分类（判断事务边界）

任何跨步骤副作用先分类，再决定实现：

- **MUST_SAME_TRANSACTION**：失败即「业务数据不完整」的 DB 写 → 与主操作同一事务。
- **AFTER_COMMIT_IDEMPOTENT**：允许稍后补偿、不影响主业务正确性 → post-commit，幂等 + 可重试 + 不得覆盖新数据。
- **BEST_EFFORT_EXTERNAL**：外部通知等 → 独立可靠性策略，绝不塞进 DB 事务。

## 3. CLOSE-EFFECTS-INTEGRITY-001 应用实例

Inspection Request Close 链路分类与实现，详见 `apps/backend/modules/inspection/ARCHITECTURE.md` 「关闭副作用一致性」与 `docs/permission-module.md` §18。要点：

- 请求行/检验记录/不合格项/关联/派单任务/队列信号 → MUST_SAME_TRANSACTION。
- 附件 JSON 快照合并 + `file_references` 登记 → AFTER_COMMIT_IDEMPOTENT（乐观 CAS + 有限重试；`file_references` 为 canonical source，`inspections.documents` 为兼容快照）。
- 审计/焊工评分 → AFTER_COMMIT_IDEMPOTENT；无外部通知副作用。
- 事务内文件引用登记必须透传 `tx`（record create/update 已强制）。

## 3.1 CLOSE-EFFECTS-RECONCILE-001 附件历史一致性审计与受控修复

背景：close 链路已确立 `file_references(bizType=inspection_record, fieldName in documents|selfCheckDocuments)` 为 canonical source，`inspections.documents / selfCheckDocuments` 为兼容快照。存量数据可能残留四类不一致，本专项提供「审计 → 计划 → 人工复核 → 受控修复」的完整 SOP，禁止自动修生产数据。

四类漂移修复权威（drift × asset 状态 → 动作）：

| drift | asset 状态 | 动作 |
| --- | --- | --- |
| json_without_reference | ACTIVE | REPAIR_REFERENCE（`createMany + skipDuplicates` 补 canonical） |
| json_without_reference | DELETED/MISSING 且无 canonical | REMOVE_INVALID_SNAPSHOT（只删 JSON 项） |
| json_without_reference | UNKNOWN（无 file_assets 行） | MANUAL_REVIEW |
| reference_without_json | ACTIVE | REBUILD_SNAPSHOT（按 canonical 重建 JSON） |
| reference_without_json | 非 ACTIVE | MANUAL_REVIEW |
| duplicate_json_id | — | DEDUPE_SNAPSHOT（首次出现保留，不删 canonical） |
| invalid_file_id 且已有 canonical | — | MANUAL_REVIEW |

实施范式（AFTER_COMMIT_IDEMPOTENT 补充工具化）：

- SOP：`audit:inspection-document-drift`（只读）→ dry-run 生成 plan → 人工 review → `reconcile:inspection-document-drift --apply --plan-file`。禁止一条命令扫描+修复；apply 前逐条按 live 行重算，确保计划不脱手。
- Apply 幂等：live 行已一致 → `ALREADY_CONSISTENT`；重复执行不产生重复 canonical/JSON 项。
- CAS：事务内 `updateMany({ where: { id, documents, selfCheckDocuments }, data })` 双列快照锚定，count=0 → `SKIPPED_CONCURRENT_CHANGE`（下一轮重试），不覆盖并发用户改动；canonical 补写用 `createMany + skipDuplicates`。
- 回滚：apply 报告携带 `rollback`（snapshot CAS where/data + createdReferences），供人工复核与回退。
- 批处理：分页游标 `--after-id / --batch-size / --limit`，记录输出 `--output-file / --report-file`，可断点续跑。
- 禁止：删除合法 canonical 以适配 JSON；OSS/local storage 操作；schema/migration（本专项零迁移）。
- 生产执行 SOP（本专项不实际操作生产，仅固化为受控流程）：STEP 1 只读 audit → STEP 2 生成 reconcile plan → STEP 3 人工审核 MANUAL_REVIEW → STEP 4 小批 apply（`--limit` 抽样）→ STEP 5 重新 audit → STEP 6 全量 apply → STEP 7 最终 audit = 0 actionable drift。
- 代码：`apps/backend/scripts/inspection-document-drift-core.ts`（分类器/计划/apply，audit 与 reconcile 共用同一 core，四类漂移永不发散）、 `apps/backend/scripts/audit-inspection-document-drift.ts`、 `apps/backend/scripts/reconcile-inspection-document-drift.ts`。
- 测试：`apps/backend/scripts/reconcile-inspection-document-drift.test.ts`（24 例：权威表全分支、幂等、CAS 并发、回滚结构、批处理参数）。

## 4. 专项登记

| 专项 | 状态 | 覆盖模块 | 说明 |
| --- | --- | --- | --- |
| DATA-INTEGRITY-001 / PHASE-0 | 审计完成 | 全系统 | 普查与分类报告，未改代码 |
| SCHEDULER-INTEGRITY-001 | 已关闭 | scheduler | jobKey unique + upsert + tick CAS（H 类） |
| OPTIMISTIC-LOCK-001 | 已关闭 | after-sales/supplier/work-order | 用户编辑/删除乐观锁（B 类） |
| STATE-MACHINE-001 | 已关闭 | task-dispatch/vehicle-commissioning/quality-loss | 状态机 + CAS（C 类） |
| METROLOGY-BORROW-001 | 已关闭 | metrology | 资源互斥 CAS（C/F 类） |
| CLOSE-EFFECTS-INTEGRITY-001 | 本文档 | inspection close 链路 | 严格关单 CAS + 附件合并 CAS + tx 传播（F 类） |
| CLOSE-EFFECTS-RECONCILE-001 | 已关闭 | inspection 附件历史 | audit→plan→review→apply 受控修复 + 四类漂移权威表 + CAS/幂等/回滚/批处理（F 类补充） |
