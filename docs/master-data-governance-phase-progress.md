# 主数据治理阶段进展（当前工作区）

统一执行蓝图（目标、阶段、门禁、最终验收）已固化到：

- `docs/master-data-governance-execution-plan.md`

## 核心结论

当前已完成 **Phase A 治理内核** 与 **Phase B 最小脚手架/门禁** 的可执行落地，且支持按字段/按波次运行统一治理流水线。  
本轮已完成 `team` canonical 首字段样板（schema/seed/backfill/dual-write/read-canonical/audit），并在可连库环境通过 release gate 全量校验。  
后续重点转入：按同样模板推进 Wave1 余下字段与 Wave2/Wave3 的 canonical 收口，减少 name-only 读路径。

## 本轮新增关键进展（2026-05-22）

1. Wave1 `team` canonical 全链路落地

- schema 新增：
  - `inspections.teamId`
  - `qms_inspection_requests.teamId`
  - `welders.teamId`
- 迁移文件：
  - `apps/backend/prisma/migrations/20260522000100_add_team_id_governance/migration.sql`
- 注册中心升级：
  - `team` 从 `name-only` 升级为 `dual-write + canonical-first + canonical-id + canonical-id-and-orphan`
  - canonical relation 指向 `dictionaries(id/dictKey)`，并限定 `dictType='team'`。

2. 统一执行器与解析能力扩展

- 新增 `team` 解析器：`apps/backend/utils/team-resolver.ts`
  - `resolveTeamIdForWrite`
  - `resolveTeamIdsByNames`
  - `buildTeamContainsWhere`
  - 支持治理故障降级（failover cooldown）
- 内核修复：
  - `apps/backend/utils/master-data-governance-kernel.ts`
  - 修复 canonical `activeWhere` 在 join 场景下的列歧义（`status` 等）；
  - 增加字典 canonical 字段 seed 能力（process 之外可复用）。

3. 写入与读取主路径完成 teamId 接入

- 写入双写：
  - `services/inspection.service.ts`（inspections create/update）
  - `api/qms/inspection/requests/index.post.ts`
  - `api/qms/public/inspection/requests/index.post.ts`
  - `utils/welder.ts` + welder create/update/import API（异步 teamId 解析）
- 读取 canonical-first：
  - `api/qms/inspection/requests/index.get.ts`
  - `services/welder.service.ts`
  - where 条件统一走 `teamId OR team contains` 兼容策略。

4. 证据与门禁结果（可连库实跑）

- consistency：
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=team-canonical`
  - 结果：`allAligned=true`，全字段 `missing/invalid/orphan` 全部为 0。
- team evidence gate：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=team --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=team-canonical`
  - 结果：
    - seed executed
    - backfill executed（`inspections=22`, `qms_inspection_requests=30`, `welders=0`）
    - audit pass（`missing=0 invalid=0 orphan=0`）
- release gate：
  - `pnpm run check:master-data-release-gate`
  - 结果：PASS（含 wave0~wave3 evidence gate、read/write coverage、derived rules、一致性与趋势门禁）。

## 已完成（可验证）

1. 统一治理注册中心（字段无关）

- 文件：`apps/backend/utils/master-data-governance-registry.ts`
- 覆盖字段：
  - Wave0: `processName`
  - Wave1: `team`, `defectType`, `defectSubtype`, `division`
  - Wave2: `supplierName`, `responsibleDepartment`
  - Wave3: `projectName`, `partName`
- 注册项包含：`source`、`targets`、`canonical`（如有）、`writeStrategy`、`readStrategy`、`backfillPolicy`、`auditPolicy`、`rolloutWave`

2. 统一治理执行器（单一入口）

- 文件：`apps/backend/utils/master-data-governance-kernel.ts`
- 已提供能力：
  - `rename`
  - `auditOrphans`
  - `resolveCanonicalIdForWrite`
  - `resolveCanonicalNameById`
  - `resolveCanonicalIdsByNames`
  - `buildNameWhere`
  - `seedCanonicalFromSource`
  - `backfillCanonicalIds`
  - `auditMissingCanonicalIds`
  - `auditInvalidCanonicalIds`
  - `runFieldGovernance`
  - `runGovernanceByFields`

3. 旧入口兼容接入新内核

- 文件：
  - `apps/backend/utils/process-resolver.ts`
  - `apps/backend/services/master-data-rename.service.ts`
- 结果：现有调用方可保持接口不变，底层统一走治理内核。

4. 脚手架与流水线命令

- 文件：
  - `apps/backend/scripts/generate-master-data-governance-template.ts`
  - `apps/backend/scripts/run-master-data-governance.ts`
  - `apps/backend/scripts/export-master-data-governance-baseline.ts`
  - `apps/backend/scripts/check-master-data-consistency.ts`
  - `apps/backend/scripts/backfill-process-id.ts`
  - `apps/backend/scripts/check-process-id-consistency.ts`
- 能力：
  - 模板生成支持 `--field` / `--wave` / `--all`
  - 流水线支持 `--fields` / `--wave` 与 `seed/backfill/audit` 开关
  - 可导出基线盘点 JSON 到 `tmp/master-data-governance/baseline.json`

5. 防回退门禁与 CI 接入

- 文件：
  - `scripts/check-master-data-governance.mjs`
  - `.github/workflows/ci-gate.yml`
  - `package.json`
- 结果：
  - 已新增 `check:master-data-governance`
  - 已接入 CI Gate 独立 job：`Master Data Governance Check`
  - 新增发布总闸命令：`check:master-data-release-gate`
    - 顺序强制执行：`check:type` -> `lint` -> `check:qms-arch` -> `db:check-master-data-consistency`
    - 任一失败直接阻断（fail-closed）

6. 已通过的本地验证

- `pnpm -C apps/backend typecheck`
- `pnpm -C apps/backend exec vitest run utils/process-resolver.test.ts utils/master-data-governance-registry.test.ts`
- `node ./scripts/check-master-data-governance.mjs`
- `node --import tsx apps/backend/scripts/generate-master-data-governance-template.ts --wave=1`
- `node --import tsx apps/backend/scripts/run-master-data-governance.ts --wave=1 --seed=false --backfill=false --audit=false --failOnAuditError=false`

7. Phase C（Wave1）业务写入路径收口首批落地

- 新增统一写入 helper：
  - `apps/backend/utils/master-data-governance-write.ts`
  - `apps/backend/utils/master-data-governance-write.test.ts`
- 已接入真实写路径：
  - `apps/backend/services/inspection.service.ts`
    - `inspections.create` / `inspections.update` 的 `team` 写入走治理 helper
  - `apps/backend/utils/inspection-issue.ts`
    - `quality_records` create/update/upsert 的 `defectType/defectSubtype/division` 走治理 helper
  - `apps/backend/api/qms/inspection/requests/index.post.ts`
    - `qms_inspection_requests.create` 的 `team` 走治理 helper
  - `apps/backend/api/qms/public/inspection/requests/index.post.ts`
    - 公共入口 `qms_inspection_requests.create` 的 `team` 走治理 helper
  - `apps/backend/api/qms/inspection/requests/[id]/close.post.ts`
    - 关闭报检流程中 linked issue 的 `defectType/defectSubtype/division` 走治理 helper
  - `apps/backend/api/qms/work-order/index.post.ts`
    - `work_orders.create` 的 `division` 走治理 helper
  - `apps/backend/api/qms/work-order/index.put.ts`
    - `work_orders.update` 的 `division` 走治理 helper
  - `apps/backend/api/qms/work-order/import.post.ts`
    - `work_orders.upsert` 的 `division` 走治理 helper
  - `apps/backend/api/qms/after-sales/index.post.ts`
    - `after_sales.create` 的 `defectType/defectSubtype/division` 走治理 helper
  - `apps/backend/api/qms/after-sales/[id].put.ts`
    - `after_sales.update` 的 `defectType/defectSubtype/division` 走治理 helper
  - `apps/backend/api/qms/after-sales/import.post.ts`
    - `after_sales.create`（导入） 的 `defectType/defectSubtype/division` 走治理 helper
- 本轮验证通过：
  - `pnpm -C apps/backend exec vitest run services/__tests__/inspection.service.test.ts utils/inspection-issue.test.ts utils/master-data-governance-write.test.ts`
  - `node ./scripts/check-master-data-governance.mjs`
  - `pnpm -C apps/backend exec vitest run utils/master-data-governance-write.test.ts services/__tests__/inspection.service.test.ts utils/inspection-issue.test.ts`

8. Phase C（Wave2）并行启动（supplierName、responsibleDepartment）

- 已接入真实写路径：
  - `apps/backend/services/inspection.service.ts`
    - `inspections.create` / `inspections.update` 的 `supplierName` 走治理 helper
  - `apps/backend/utils/inspection-issue.ts`
    - `quality_records` create/update/upsert 的 `supplierName/responsibleDepartment` 走治理 helper
- 辅助能力扩展：
  - `apps/backend/utils/master-data-governance-write.ts`
    - `inspection` 与 `quality_record` helper 已支持 `supplierName/responsibleDepartment`
- 测试验证：
  - `apps/backend/utils/master-data-governance-write.test.ts`
  - `apps/backend/utils/inspection-issue.test.ts`

9. Phase C（Wave2）写入路径继续收口（跨模块目标表）

- 本轮新增治理 helper 扩展：
  - 文件：`apps/backend/utils/master-data-governance-write.ts`
  - 新增入口：
    - `buildGovernedSupervisionProjectWriteFields`（`supplierName`）
    - `buildGovernedVehicleCommissioningIssueWriteFields`（`responsibleDepartment`）
    - `buildGovernedQualityLossWriteFields`（`respDept -> responsibleDepartment`）
    - `buildGovernedMetrologyBorrowWriteFields`（`borrowerDepartment -> responsibleDepartment`）
    - `buildGovernedWelderWriteFields`（`team`）
- 本轮已接入真实写路径：
  - `apps/backend/services/supervision-project.service.ts`
    - `supervision_projects.create/update` 的 `supplierName` 走治理 helper
  - `apps/backend/services/vehicle-commissioning.service.ts`
    - `vehicle_commissioning_issues.create/update` 的 `responsibleDepartment` 走治理 helper
  - `apps/backend/services/metrology-borrow.service.ts`
    - `metrology_borrow_records.create` 的 `borrowerDepartment` 走治理 helper（为满足 Prisma 必填输入保留显式字段，已加治理白名单注释）
  - `apps/backend/utils/quality-loss-payload.ts`
    - `quality_losses.create` 的 `respDept` 走治理 helper
  - `apps/backend/api/qms/quality-loss/[id].put.ts`
    - `quality_losses.update` 的 `respDept` 走治理 helper
  - `apps/backend/utils/welder.ts`
    - `welders.create/update/upsert` 统一通过 `buildWelderCreateData/buildWelderUpdateData` 接入 `team` 治理 helper
- 测试验证：
  - `apps/backend/utils/master-data-governance-write.test.ts` 新增覆盖上述 helper
  - `pnpm -C apps/backend exec vitest run utils/master-data-governance-write.test.ts utils/quality-loss-payload.test.ts utils/quality-loss-update.test.ts services/__tests__/quality-loss.service.test.ts`

10. 本轮门禁验证结果

- 通过：
  - `pnpm run lint`
  - `pnpm -C apps/backend typecheck`
  - `pnpm run check:qms-arch`
  - `node ./scripts/check-master-data-governance.mjs`
  - `pnpm --dir apps/backend run db:audit-master-data-write-coverage`
- 未完成：
  - `db:check-master-data-consistency` 仍受 `127.0.0.1:3306` 不可达阻塞（环境限制）

11. Wave1/Wave2 写入覆盖审计能力（新增）

- 文件：`apps/backend/scripts/audit-master-data-write-coverage.ts`
- 命令：`pnpm --dir apps/backend run db:audit-master-data-write-coverage`
- 规则：
  - 从注册中心自动提取 Wave1/Wave2 字段目标表与目标列；
  - 扫描 `create/update/upsert` 写入调用；
  - 仅当调用块中出现治理字段且未出现治理 helper/内核上下文时判定为缺口；
  - 结果 `totalMissingHits > 0` 直接失败（exitCode=1）。
- 本轮结果：
  - `totalWriteHits=45`
  - `totalSkippedNonFieldWrites=43`
  - `totalMissingHits=0`
  - 结论：当前 Wave1/Wave2 目标表写路径已无未治理缺口（按脚本扫描范围）。
  - 现已接入根门禁与 CI：
    - `package.json` -> `check:master-data-write-coverage`
    - `.github/workflows/ci-gate.yml` -> `Master Data Write Coverage Check`
    - `scripts/check-master-data-release-gate.mjs` -> `master-data-write-coverage`
  - 验证命令已通过：
    - `pnpm --dir apps/backend run db:audit-master-data-write-coverage`
    - `pnpm run lint`
    - `pnpm -C apps/backend typecheck`
    - `node ./scripts/check-master-data-governance.mjs`
    - `pnpm run check:qms-arch`

12. Phase 0 基线盘点能力升级（冻结产物）

- 文件：`apps/backend/scripts/export-master-data-governance-baseline.ts`
- 升级点：
  - baseline 增加 `phase0` 节点，包含：
    - `fieldCatalog`（字段与波次）
    - `sourceCatalog`（主数据来源）
    - `pathInventory`（现有读写路径证据，含 file/line/snippet/read-write 分类）
    - `frozenGuardrails`（冻结新增手写映射入口状态）
  - 输出固定为仓库根：`tmp/master-data-governance/baseline.json`
  - 兼容两种执行目录：仓库根与 `apps/backend` 目录

13. 一致性检查能力升级（覆盖 name-only 字段）

14. 发布门禁口径收紧（wave 证据全开）

- 文件：`scripts/check-master-data-release-gate.mjs`
- 变更：
  - `master-data-evidence-gate-wave1/2/3` 全部改为
    - `--seed=true --backfill=true --audit=true --failOnAuditError=true`
  - 不再允许通过发布总闸参数把 wave 证据降级为 `seed=false/backfill=false`。
- 结果：
  - canonical 字段在对应 wave 必须产出 `seed/backfill/audit` 执行证据；
  - name-only 字段仍由执行器按策略自动 skip，但审计证据强制保留。

15. read-canonical 缺口根因修复（非白名单绕过）

- 根因：
  - `check:master-data-read-coverage` 报告 3 处缺口，集中在 defect 维度统计查询未统一回治理内核。
- 修复：
  - `apps/backend/utils/master-data-governance-kernel.ts`
    - 新增 `resolveCanonicalNamesByIds`（批量 canonical id -> canonical name）。
  - `apps/backend/services/inspection.service.ts`
    - `getIssueChartAggregation` 改为调用内核批量解析 `defectType/defectSubtype` canonical 名称。
  - `apps/backend/api/qms/reports/summary.get.ts`
    - `fetchDefectDistribution` 改为调用内核批量解析 `defectType` canonical 名称。
  - `apps/backend/api/qms/vehicle-failure-rate.get.ts`
    - `buildRanking` 改为调用内核批量解析 `defectType` canonical 名称。
- 结果：
  - `pnpm run check:master-data-read-coverage` 由 `totalMissingHits=3` 降为 `0`。

16. 本轮门禁复跑结果（2026-05-22）

- 通过：
  - `pnpm -C apps/backend typecheck`
  - `pnpm run lint`
  - `pnpm run check:qms-arch`
  - `pnpm run check:master-data-governance`
  - `pnpm run check:master-data-template`
  - `pnpm run check:master-data-write-coverage`
  - `pnpm run check:master-data-read-coverage`
  - `pnpm run check:master-data-release-gate`
- 关键报告：
  - `tmp/master-data-governance/consistency/consistency-report-2026-05-22T05-21-51-155Z-release.json`
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T05-21-58-776Z-release-wave1.json`
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T05-21-59-402Z-release-wave2.json`
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T05-22-00-135Z-release-wave3.json`

17. 全项目剩余字段台账与门禁（新增）

- 新增脚本：
  - `apps/backend/scripts/export-master-data-governance-backlog.ts`
  - `apps/backend/scripts/check-master-data-governance-backlog.ts`
- 新增配置：
  - `apps/backend/config/master-data-governance-backlog.json`
- 新增命令：
  - `apps/backend/package.json`:
    - `db:check-master-data-backlog`
  - `package.json`:
    - `check:master-data-backlog`
    - 根 `check` 已纳入 `check:master-data-backlog`
  - `scripts/check-master-data-release-gate.mjs`:
    - 新增 `master-data-backlog` 步骤
- 当前量化结果（release 报告）：

18. 本轮新增字段治理收口（2026-05-22）

- 新增纳管字段（Wave1，name-only）：
  - `productType`（中文：产品类型）
  - `productSubtype`（中文：产品子类型）
- 注册中心更新：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 目标表：`after_sales.productType`、`after_sales.productSubtype`
  - 策略：`writeStrategy=name-only`、`readStrategy=name-only`、`backfillPolicy=none`、`auditPolicy=orphan-only`
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `after_sales.productType` / `after_sales.productSubtype` 由 `planned` 调整为 `excluded`
  - 原因：已由注册中心字段覆盖，不再作为“未纳管语义字段”
- 测试与门禁：
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts` 通过
  - `pnpm run check:master-data-backlog` 通过
  - `pnpm run check:master-data-release-gate` 通过
- 本轮量化变化：
  - `governedFields`: `40 -> 42`
  - `pendingFields`: `62 -> 60`
  - `planned`: `30 -> 28`
  - `undecidedFields`: 持续 `0`

19. 本轮新增字段治理收口（2026-05-22，第二批）

- 新增纳管字段（Wave1，name-only）：
  - `failureType`（中文：故障类型）
  - `failureCause`（中文：故障原因）
- 注册中心更新：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 目标表：`after_sales.failureType`、`after_sales.failureCause`
  - 策略：`writeStrategy=name-only`、`readStrategy=name-only`、`backfillPolicy=none`、`auditPolicy=orphan-only`
- 写入链路补齐（非补丁，纳入统一写入口）：
  - 文件：`packages/qgs-domain/src/modules/qms/after-sales-payload.ts`
  - `buildAfterSalesCreateData` 与 `buildAfterSalesUpdateData` 已新增 `failureType/failureCause` 字段写入
  - 由于 `after_sales` create/update/import 均走 `buildGovernedAfterSales*Data`，本次接入后无需再分散修改多处 API
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `after_sales.failureType` / `after_sales.failureCause` 由 `planned` 调整为 `excluded`
  - 原因：已由注册中心字段覆盖，不再作为“未纳管语义字段”
- 测试与门禁：
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts` 通过
  - `pnpm run check:master-data-backlog` 通过
  - `pnpm run check:master-data-release-gate` 通过
- 本轮量化变化：
  - `governedFields`: `42 -> 44`
  - `pendingFields`: `60 -> 58`
  - `planned`: `28 -> 26`
  - `undecidedFields`: 持续 `0`

20. 本轮新增字段治理收口（2026-05-22，第三批）

- 新增纳管字段（Wave2，name-only）：
  - `supplierBrand`（中文：供应商品牌）
- 注册中心更新：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 目标表：`after_sales.supplierBrand`
  - 策略：`writeStrategy=name-only`、`readStrategy=name-only`、`backfillPolicy=none`、`auditPolicy=orphan-only`
  - 说明：`supplierBrand` 与 `supplierName` 语义不完全等价，因此独立治理字段，避免后续口径混淆。
- 写入链路现状确认：
  - `after_sales` create/update/import 已统一走 `buildGovernedAfterSales*Data`；
  - 域层 payload 已覆盖 `supplierBrand`，本次注册后无需散改 API。
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `after_sales.supplierBrand` 由 `planned` 调整为 `excluded`
  - 原因：已由注册中心字段覆盖，不再作为“未纳管语义字段”
- 测试与门禁：
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts` 通过
  - `pnpm run check:master-data-backlog` 通过
  - `pnpm run check:master-data-release-gate` 通过
- 本轮量化变化：
  - `governedFields`: `44 -> 45`
  - `pendingFields`: `58 -> 57`
  - `planned`: `26 -> 25`
  - `undecidedFields`: 持续 `0`

21. 本轮新增字段治理收口（2026-05-22，第四批）

- 新增纳管字段（Wave2，name-only）：
  - `qualityLossType`（中文：质量损失类型，对应 `quality_losses.type`）
  - `rootCause`（中文：根因，对应 `quality_records.rootCause`）
- 注册中心更新：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 目标表：
    - `quality_losses.type`
    - `quality_records.rootCause`
  - 策略：`writeStrategy=name-only`、`readStrategy=name-only`、`backfillPolicy=none`、`auditPolicy=orphan-only`
- 写入链路确认：
  - `quality_losses.type` 已由 `buildQualityLossCreateData`/`quality-loss` update 流程写入；
  - `quality_records.rootCause` 已由 inspection issue create/update/upsert 流程写入；
  - 上述流程均已接入统一 governance write helper，不需额外散改 API。
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `quality_losses.type`、`quality_records.rootCause` 由 `planned` 调整为 `excluded`
  - 原因：已由注册中心字段覆盖，不再作为“未纳管语义字段”
- 测试与门禁：
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts` 通过
  - `pnpm run check:master-data-backlog` 通过
  - `pnpm run check:master-data-release-gate` 通过
- 本轮量化变化：
  - `governedFields`: `45 -> 47`
  - `pendingFields`: `57 -> 55`
  - `planned`: `25 -> 23`
  - `undecidedFields`: 持续 `0`

22. 本轮新增字段治理收口（2026-05-22，第五批）

- 新增纳管字段（Wave2，name-only）：
  - `qualityRecordCategory`（中文：质量记录分类，对应 `quality_records.category`）
  - `supplierCategory`（中文：供应商分类，对应 `suppliers.category`）
- 注册中心更新：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 目标表：
    - `quality_records.category`
    - `suppliers.category`
  - 策略：`writeStrategy=name-only`、`readStrategy=name-only`、`backfillPolicy=none`、`auditPolicy=orphan-only`
- 写入链路补齐（统一入口）：
  - 文件：`apps/backend/utils/supplier.ts`
    - `buildSupplierCreateData` / `buildSupplierUpdateData` 增加 `buildGovernedWriteFieldsForTable('suppliers', data)`
  - 文件：`apps/backend/api/qms/supplier/import.post.ts`
    - `suppliers.upsert` 的 `create/update` 均增加 `buildGovernedWriteFieldsForTable('suppliers', payload)`
  - 说明：未新增专用 helper export，遵循 helper-surface 门禁要求，仅使用通用入口。
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `quality_records.category`、`suppliers.category` 由 `planned` 调整为 `excluded`
  - `standard_documents.category` 调整为 `deferred`（当前 backend 范围仅有 schema，无有效 create/update 主路径，避免空治理）
- 测试与门禁：
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts` 通过
  - `pnpm run check:master-data-backlog` 通过
  - `pnpm run check:master-data-release-gate` 通过
- 本轮量化变化：
  - `governedFields`: `47 -> 49`
  - `pendingFields`: `55 -> 53`
  - `planned`: `23 -> 20`
  - `undecidedFields`: 持续 `0`
  - `semanticFields=102`
  - `governedFields=37`
  - `pendingFields=65`
  - `undecidedFields=0`
  - `decisionCoverage=1`
  - `planned=33`, `deferred=15`, `excluded=17`
- 报告文件：
  - `tmp/master-data-governance/backlog/backlog-report-2026-05-22T05-41-59-972Z-release.json`

18. 本轮最终门禁状态

- 通过：
  - `pnpm run lint`
  - `pnpm run check:master-data-backlog`
  - `pnpm run check:master-data-release-gate`

- 文件：`apps/backend/scripts/check-master-data-consistency.ts`
- 升级点：
  - 扫描范围从“仅 canonical 字段”扩展到“所有注册字段”
  - 输出新增 orphan 指标：
    - `orphanValues`（孤儿值种类数）
    - `orphanRows`（孤儿值影响行数）
    - `orphanByValue`（按值明细）
  - `allAligned` 判定收敛为：
    - `missingCanonicalId == 0 && invalidCanonicalId == 0 && totalOrphanValues == 0`

14. 门禁脚本改为注册中心驱动

- 文件：`scripts/check-master-data-governance.mjs`
- 升级点：
  - 禁止字段 token 不再硬编码，改为从 `master-data-governance-registry.ts` 自动提取 `nameColumn/idColumn`
  - 检查范围扩展到 `apps/backend/utils`（保留治理核心文件白名单）
  - 新增对治理 helper 调用的自动豁免判定（避免误报）

15. Wave3（projectName/partName）派生规则冻结前置落地

- 新增冻结配置：
  - `apps/backend/config/master-data-derived-rules.json`
  - 固化 `projectName`、`partName` 的 `sourceSql`、`matchingPriority`、`frozenAt`。
- 新增冻结校验脚本：
  - `apps/backend/scripts/check-master-data-derived-rules.ts`
  - 命令：`pnpm --dir apps/backend run db:check-master-data-derived-rules`
- 执行器前置强制：
  - `apps/backend/scripts/run-master-data-governance.ts`
  - 当选择字段包含 `projectName/partName` 时，先执行冻结校验；校验失败直接终止治理执行。
- 发布总闸接入：
  - `scripts/check-master-data-release-gate.mjs` 新增 `master-data-derived-rules` 检查步骤。
- 本轮验证结果：
  - `pnpm --dir apps/backend run db:check-master-data-derived-rules` 通过
  - `pnpm --dir apps/backend run db:run-master-data-governance --wave=3 --seed=false --backfill=false --audit=false --failOnAuditError=false` 通过（且触发冻结校验）

16. 字段级执行证据报告与校验能力（新增）

- 执行脚本增强：
  - `apps/backend/scripts/run-master-data-governance.ts`
  - 新增报告落盘：
    - 默认输出目录：`tmp/master-data-governance/reports`
    - 报告内容包含每字段 `seed/backfill/audit` 的 `status` 与 `output/skip reason`
  - 新增参数：
    - `--writeReport=true|false`（默认 `true`）
    - `--reportLabel=<label>`
    - `--reportDir=<path>`
- 报告校验脚本：
  - `apps/backend/scripts/check-master-data-governance-report.ts`
  - 命令：`pnpm --dir apps/backend run db:check-master-data-report`
  - 严格命令：`pnpm --dir apps/backend run db:check-master-data-report:strict`
  - 校验规则：
    - 目标字段必须全部有证据条目；
    - 每字段的 `seed/backfill/audit` 必须是 `executed` 或 `skipped`；
    - `skipped` 必须附带 `reason`。
    - 严格模式下：
      - `audit` 必须 `executed`
      - canonical 字段在 `runSeed=true` 时必须 `seed=executed`
      - canonical 字段在 `runBackfill=true` 时必须 `backfill=executed`
- 本轮验证结果：
  - 使用离线 mock 报告验证：
    - `pnpm --dir apps/backend run db:check-master-data-report --report=<mock-report> --wave=1` 通过
    - `pnpm --dir apps/backend run db:check-master-data-report:strict --report=<mock-report> --wave=1` 通过
  - 注：在线治理执行报告受当前 DB 不可达限制，待可连库环境补齐实跑证据。

17. 证据门禁一键编排（新增）

- 新增编排脚本：
  - `apps/backend/scripts/run-master-data-governance-evidence-gate.ts`
  - 命令：`pnpm --dir apps/backend run db:run-master-data-evidence-gate`
- 编排流程：
  - 先执行 `run-master-data-governance` 生成字段执行报告；
  - 再执行 `check-master-data-governance-report` 严格校验报告；
  - 根据字段集合自动决定 strict 参数：
    - `requireAuditExecuted=true`
    - canonical 字段且开启 `seed/backfill` 时，要求对应证据必须 `executed`。
- 离线/受限环境兼容：
  - 新增 `--skipRun=true`，可跳过在线治理执行，仅对既有报告做严格校验；
  - 可配合 `--report` / `--reportDir` 使用，支持本地或 CI 复验历史报告。

18. 一致性报告自动落盘 + 趋势门禁自动串联（新增）

- 一致性脚本增强：
  - 文件：`apps/backend/scripts/check-master-data-consistency.ts`
  - 新增能力：
    - 默认落盘一致性报告到 `tmp/master-data-governance/consistency`
    - 支持参数：
      - `--writeReport=true|false`（默认 `true`）
      - `--reportLabel=<label>`
      - `--reportDir=<path>`
    - 输出 `reportPath`，供后续趋势脚本和发布门禁直接消费。
- 趋势脚本增强：
  - 文件：`apps/backend/scripts/check-master-data-metrics-trend.ts`
  - 新增能力：
    - 未传 `--current` 时自动读取最新一致性报告（默认目录 `tmp/master-data-governance/consistency`）
    - 指标快照默认落盘到 `tmp/master-data-governance/metrics`
    - 新增可选参数 `--consistencyDir=<path>`
  - 结果：发布链路不再依赖手工拼 `--current` 参数。
- 发布总闸接入：
  - 文件：`scripts/check-master-data-release-gate.mjs`
  - 新增步骤：
    - `master-data-consistency` 改为带 `--reportLabel=release`
    - 新增 `master-data-metrics-trend`
  - 结果：发布前强制执行“当前一致性检查 + 趋势回归检测”，指标回升直接阻断上线。

19. 写路径覆盖审计升级为“全字段默认扫描”（新增）

- 审计脚本增强：
  - 文件：`apps/backend/scripts/audit-master-data-write-coverage.ts`
  - 关键变化：
    - 默认扫描范围从 Wave1/Wave2 扩展为注册中心全字段（Wave0~Wave3）；
    - 新增可选参数：
      - `--waves=0,1,2,3`
      - `--fields=fieldA,fieldB`
    - 治理上下文识别增强：
      - 支持识别 `buildGoverned*`、`MasterDataGovernanceKernel`、`governed*` 变量传递场景；
      - 避免“已治理代码因变量中转被误判”为缺口。
- 写路径收口补齐：
  - `apps/backend/services/inspection.service.ts`
    - `inspections.create/update` 已纳入 `projectName/processName` 的治理 helper 归一；
    - `inspection_archive_tasks.upsert` 的 `projectName` 已纳入治理 helper。
  - `apps/backend/api/qms/planning/inspection-forms/index.post.ts`
  - `apps/backend/api/qms/planning/inspection-forms/[id].put.ts`
    - `inspection_form_templates` 的 `partName/processName/projectName` 已纳入治理 helper。
  - `apps/backend/api/qms/work-order/requirements/index.post.ts`
    - `work_order_requirements` 的 `partName/processName` 已纳入治理 helper。
- 本轮验证结果：
  - `pnpm --dir apps/backend run db:audit-master-data-write-coverage`：
    - `scope.waves=[0,1,2,3]`
    - `totals.totalMissingHits=0`
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm run lint` 通过

20. 模板脚手架执行性增强（新增）

- 文件：`apps/backend/scripts/generate-master-data-governance-template.ts`
- 问题修复：
  - 旧模板对所有字段输出同构脚本，未按 `canonical/name-only` 策略分流；
  - 旧模板执行路径依赖当前目录，仓库根执行会找不到 `run-master-data-governance.ts`。
- 本轮增强：
  - 生成产物扩展为：
    - `migration-*.sql`
    - `seed-*.ts`
    - `backfill-*.ts`

23. 监督模块字段治理收口（2026-05-22，第六批）

- 本轮新增纳管字段（已接入统一写入 helper）：
  - `supervisionIssueType`（中文：监督问题类型，对应 `supervision_issues.issueType`）
  - `supervisionIssueActionType`（中文：监督问题动作类型，对应 `supervision_issue_actions.actionType`）
  - `supervisionProjectType`（中文：监督项目类型，对应 `supervision_projects.projectType`）
  - `supervisionParticipants`（中文：监督参与方，对应 `supervision_projects.participants`）
  - `supervisionPlanTaskName`（中文：监督计划任务名称，对应 `supervision_plan_tasks.taskName`、`supervision_report_task_updates.taskName`）
  - `supervisionPlanTaskResourceName`（中文：监督计划任务资源名称，对应 `supervision_plan_tasks.resourceName`）
  - `supervisionRiskReason`（中文：监督风险原因，对应 `supervision_plan_tasks.riskReason`、`supervision_report_task_updates.riskReason`）
- 写路径收口：
  - `apps/backend/services/supervision-issue.service.ts`：`createIssue/createIssueAction/updateIssue`
  - `apps/backend/services/supervision-project.service.ts`：`createProject/updateProject`
  - `apps/backend/services/supervision-plan-task.service.ts`：`importPlanTasks/createTask/updateTask`
  - `apps/backend/services/supervision-report.service.ts`：`createReport` 内 `supervision_report_task_updates.create`
  - 以上均改为统一调用 `buildGovernedWriteFieldsForTable`，不再分散手写映射。
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - 以上监督模块字段由 `deferred` 调整为 `excluded`（原因：已进入注册中心并完成写路径治理）
- 本轮门禁验证：
  - 通过：`pnpm run check:master-data-governance`
  - 通过：`pnpm run lint`
  - 通过：`pnpm -C apps/backend typecheck`
  - 通过：`pnpm run check:master-data-backlog`
  - 通过：`pnpm run check:master-data-write-coverage`（`totalMissingHits=0`）
  - 通过：`pnpm run check:master-data-generic-write-entry`（`violations=0`）
  - `pnpm run check:master-data-release-gate` 失败点不变：`master-data-consistency` 阶段无法连接 `127.0.0.1:3306`
- 本轮量化结果（release backlog 报告）：
  - `semanticFields=102`
  - `governedFields=77`
  - `pendingFields=25`
  - `undecidedFields=0`
  - `decisionCoverage=1`
  - `planned=0`、`deferred=7`、`excluded=18`

24. BOM 字段治理收口（2026-05-22，第七批）

- 本轮新增纳管字段覆盖：
  - `partName`（中文：部件名称）新增目标表映射：`project_boms.part_name`
- 统一写入接入（非散改）：
  - `apps/backend/api/qms/planning/bom/index.post.ts`
  - `apps/backend/api/qms/planning/bom/[id].put.ts`
  - `apps/backend/api/qms/planning/bom/import.post.ts`
  - 三条 `project_boms` 写路径均已接入 `buildGovernedWriteFieldsForTable('project_boms', payload)`。
- 派生规则同步：
  - `partName` 的 `derived valueSql` 新增 `project_boms.part_name` 来源，保证字段盘点、审计与回填源口径一致。
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `project_boms.part_name`：`deferred -> excluded`
  - 原因：已由注册中心字段 `partName` 覆盖并完成真实写路径接入。
- 本轮门禁验证：
  - 通过：`pnpm -C apps/backend typecheck`
  - 通过：`pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts`
  - 通过：`pnpm run check:master-data-governance`
  - 通过：`pnpm run check:master-data-helper-alignment`
  - 通过：`pnpm run check:master-data-write-coverage`（新增 `project_boms` 表，`totalMissingHits=0`）
  - 通过：`pnpm run check:master-data-backlog`
  - 通过：`pnpm run check:master-data-generic-write-entry`
  - `pnpm run check:master-data-release-gate` 失败点不变：`master-data-consistency` 阶段无法连接 `127.0.0.1:3306`
- 本轮量化变化（release backlog 报告）：
  - `semanticFields=102`（不变）
  - `governedFields: 77 -> 78`
  - `pendingFields: 25 -> 24`
  - `planned=0`（不变）
  - `deferred: 7 -> 6`
  - `excluded=18`（不变）
  - `undecidedFields=0`、`decisionCoverage=1`（不变）

25. BOM 字段治理收口（2026-05-22，第八批）

- 本轮新增纳管字段（Wave3，name-only）：
  - `bomPartNumber`（中文：BOM 零件编号，对应 `project_boms.part_number`）
  - `bomRequiredProcesses`（中文：BOM 必需工序列表，对应 `project_boms.required_processes`）
- 统一入口复用：
  - `project_boms` 的 create/update/import 已在上一批接入 `buildGovernedWriteFieldsForTable('project_boms', payload)`；
  - 本轮仅通过注册中心扩展映射，即可自动纳入写入治理与覆盖审计，无需新增散点 API/Service 改造。
- 注册中心与测试：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 文件：`apps/backend/utils/master-data-governance-registry.test.ts`
  - 文件：`apps/backend/utils/master-data-governance-write.test.ts`
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - `project_boms.part_number`：`deferred -> excluded`
  - `project_boms.required_processes`：`deferred -> excluded`
- 本轮门禁验证：
  - 通过：`pnpm -C apps/backend typecheck`
  - 通过：`pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts`
  - 通过：`pnpm run check:master-data-registry-policy`（`fields=42, issues=0`）
  - 通过：`pnpm run check:master-data-helper-alignment`（`registryFields=42, coverageIssues=0`）
  - 通过：`pnpm run check:master-data-governance`
  - 通过：`pnpm run check:master-data-write-coverage`（`totalMissingHits=0`）
  - 通过：`pnpm run check:master-data-generic-write-entry`（`violations=0`）
  - 通过：`pnpm run lint`
  - `pnpm run check:master-data-release-gate` 失败点不变：`master-data-consistency` 阶段无法连接 `127.0.0.1:3306`
- 本轮量化变化（release backlog 报告）：
  - `semanticFields=102`（不变）
  - `governedFields: 78 -> 80`
  - `pendingFields: 24 -> 22`
  - `planned=0`（不变）
  - `deferred: 6 -> 4`
  - `excluded=18`（不变）
  - `undecidedFields=0`、`decisionCoverage=1`（不变）

26. deferred 字段写路径硬约束门禁（2026-05-22）

- 背景：
  - 当前 backlog 仍有 `deferred=4`，分别是：
    - `standard_documents.category`
    - `supervision_milestones.delayReason`
    - `supervision_milestones.name`
    - `supervision_plan_steps.stepName`
  - 这些字段在当前 backend 代码中仅出现在 schema/migration/backlog，未发现 active create/update/upsert 写路径。
- 新增门禁脚本：
  - 文件：`apps/backend/scripts/check-master-data-deferred-write-paths.ts`
  - 规则：
    - 读取 backlog 中全部 `status=deferred` 字段；
    - 扫描 `apps/backend/api|services|utils` 的 `.ts` 文件；
    - 若发现 deferred 字段出现活跃写入上下文（`prisma.<table>.create/update/upsert` 或嵌套写入上下文中的 `<column>:`）则直接失败；
    - 目的是防止 deferred 字段“先出现写路径，后补治理”的回退风险。
- 门禁接入：
  - `apps/backend/package.json`：新增 `db:check-master-data-deferred-write-paths`
  - 根 `package.json`：新增 `check:master-data-deferred-write-paths`
  - `scripts/check-master-data-release-gate.mjs`：新增步骤 `master-data-deferred-write-paths`
  - `.github/workflows/ci-gate.yml`：新增 CI job `Master Data Deferred Write Paths Check`
- 验证结果：
  - `pnpm --dir apps/backend run db:check-master-data-deferred-write-paths` 通过（`deferredFields=4`，`violationCount=0`）
  - `pnpm run check:master-data-deferred-write-paths` 通过
  - `pnpm -C apps/backend typecheck` 通过
  - `pnpm run check:master-data-release-gate` 失败点不变：`master-data-consistency` 阶段无法连接 `127.0.0.1:3306`
- 本轮价值：
  - 将 deferred 管理从“人工口径”升级为“自动化防回退约束”；
  - 保证后续一旦 deferred 字段进入真实写路径，门禁会立即阻断并倒逼纳管。

27. 总 check 链路纳入 deferred 门禁（2026-05-22）

- 变更：
  - 文件：`package.json`
  - 根 `check` 脚本新增 `check:master-data-deferred-write-paths`，不再只依赖 release gate 或 CI 独立 job 执行该约束。
- 结果：
  - 本地执行 `pnpm run check:master-data-deferred-write-paths` 通过；
  - 本地执行 `pnpm run check:master-data-release-gate` 仍保持“新增门禁通过，唯一失败点为 `master-data-consistency` 的 DB 连通（`127.0.0.1:3306`）”；
  - backlog 量化维持：
    - `semanticFields=102`
    - `governedFields=80`
    - `pendingFields=22`
    - `planned=0`
    - `deferred=4`
    - `excluded=18`

28. deferred 清零收口（2026-05-22）

- 本轮新增纳管字段（中文）：
  - `supervisionMilestoneName`（监督里程碑名称，对应 `supervision_milestones.name`）
  - `supervisionMilestoneDelayReason`（监督里程碑延期原因，对应 `supervision_milestones.delayReason`）
  - `supervisionPlanStepName`（监督计划步骤名称，对应 `supervision_plan_steps.stepName`）
  - `standardDocumentCategory`（标准文件分类，对应 `standard_documents.category`）
- 注册中心与测试：
  - `apps/backend/utils/master-data-governance-registry.ts`
  - `apps/backend/utils/master-data-governance-registry.test.ts`
  - `apps/backend/utils/master-data-governance-write.test.ts`
- backlog 决策收口：
  - `apps/backend/config/master-data-governance-backlog.json`
  - `standard_documents.category`：`deferred -> excluded`
  - `supervision_milestones.delayReason`：`deferred -> excluded`
  - `supervision_milestones.name`：`deferred -> excluded`
  - `supervision_plan_steps.stepName`：`deferred -> excluded`
- 本轮门禁验证：
  - 通过：`pnpm -C apps/backend typecheck`
  - 通过：`pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts`
  - 通过：`pnpm run check:master-data-registry-policy`（`fields=46, issues=0`）
  - 通过：`pnpm run check:master-data-helper-alignment`（`registryFields=46, coverageIssues=0`）
  - 通过：`pnpm run check:master-data-governance`
  - 通过：`pnpm run check:master-data-write-coverage`（`totalMissingHits=0`）
  - 通过：`pnpm run check:master-data-deferred-write-paths`（`deferredFields=0`, `violationCount=0`）
  - 通过：`pnpm run lint`
  - `pnpm run check:master-data-release-gate` 失败点不变：`master-data-consistency` 阶段无法连接 `127.0.0.1:3306`
- 本轮量化变化（release backlog 报告）：
  - `semanticFields=102`（不变）
  - `governedFields: 80 -> 84`
  - `pendingFields: 22 -> 18`
  - `planned=0`（不变）
  - `deferred: 4 -> 0`
  - `excluded=18`（不变）
  - `undecidedFields=0`、`decisionCoverage=1`（不变）

29. 发布门禁可连库全链路通过（2026-05-22）

- 根因修复 1（非补丁、内核级）：
  - 文件：`apps/backend/utils/master-data-governance-kernel.ts`
  - 问题：`auditOrphans` 对所有目标表硬编码 `WHERE isDeleted = 0`，在 `project_boms` 等无该列的表上触发 SQL 1054。
  - 修复：
    - 新增按表结构动态探测列能力（`information_schema.COLUMNS`）；
    - 新增 `buildActiveRowWhereSql(table)`：
      - 有 `isDeleted` 列则使用 `` `isDeleted` = 0 ``；
      - 无该列则使用 `1 = 1`；
    - `auditOrphans` 改为使用动态 where，消除跨表结构差异导致的一致性脚本误失败。
  - 测试：
    - `apps/backend/utils/master-data-governance-kernel.backfill.test.ts`
    - 新增用例覆盖“有/无 isDeleted 列”两种分支。
- 根因修复 2（冻结规则一致性）：
  - 文件：`apps/backend/config/master-data-derived-rules.json`
  - 问题：`partName` 的 registry `sourceSql` 已扩展 `project_boms.part_name`，冻结规则未同步，导致 `DERIVED_SOURCE_SQL_MISMATCH:partName`。
  - 修复：
    - 同步 `partName` 的 `sourceSql`；
    - `matchingPriority` 增加 `project_boms.part_name`；
    - 更新 `frozenAt` 与 `updatedAt`。
- 可连库门禁实跑结果（`DATABASE_URL=mysql://qms:qms123456@127.0.0.1:3306/quality_guard?...`）：
  - `pnpm run check:master-data-release-gate`：**PASS**
  - 关键证据：
    - `master-data-consistency`：`allAligned=true`，`missingCanonicalId=0`，`invalidCanonicalId=0`，`totalOrphanValues=0`
    - `master-data-metrics-trend`：`regressions=[]`
    - `master-data-template`：通过（含 wave 生成模板执行校验）
    - `master-data-write-coverage`：`totalMissingHits=0`
    - `master-data-read-coverage`：`totalMissingHits=0`
    - `master-data-derived-rules`：通过
    - wave0/1/2/3 evidence gate：全部通过
- 当前量化（release backlog）：
  - `semanticFields=102`
  - `governedFields=84`
  - `pendingFields=18`
  - `planned=0`
  - `deferred=0`
  - `excluded=18`
  - `undecidedFields=0`
  - `decisionCoverage=1`

30. 最终验收脚本与临时产物隔离（2026-05-22）

- 新增最终验收脚本：
  - 文件：`apps/backend/scripts/check-master-data-acceptance.ts`
  - 命令：
    - `apps/backend/package.json`：`db:check-master-data-acceptance`
    - 根 `package.json`：`check:master-data-acceptance`
  - 行为：
    - 串行执行 backlog 与一致性检查；
    - 自动读取最新报告并强校验：
      - `planned=0`
      - `deferred=0`
      - `undecidedFields=0`
      - `decisionCoverage=1`
      - `allAligned=true`
      - `totalMissingCanonicalId=0`
      - `totalInvalidCanonicalId=0`
      - `totalOrphanValues=0`
    - 任一不满足直接失败（exitCode=1）。
- 临时产物防噪音：
  - 文件：`.prettierignore`
  - 新增忽略：`tmp/master-data-governance`
  - 目的：避免门禁因运行期报告 JSON 触发 Prettier 检查失败。
- 实跑结果（可连库）：
  - `pnpm run check:master-data-acceptance`：通过
  - 关键输出：
    - `semanticFields=102`
    - `governedFields=84`
    - `pendingFields=18`
    - `planned=0`
    - `deferred=0`
    - `undecidedFields=0`
    - `decisionCoverage=1`
    - `allAligned=true`
    - `totalMissingCanonicalId=0`
    - `totalInvalidCanonicalId=0`
    - `totalOrphanValues=0`

31. backlog 门禁口径收紧（2026-05-22）

- 变更：
  - 文件：`apps/backend/scripts/export-master-data-governance-backlog.ts`
    - 新增可选约束参数：
      - `requirePlannedZero`
      - `requireDeferredZero`
      - `requireDecisionCoverageOne`
  - 文件：`apps/backend/scripts/check-master-data-governance-backlog.ts`
    - 默认开启上述三项约束（true），即 backlog 检查不再只看 `undecided`，而是强制：
      - `planned=0`
      - `deferred=0`
      - `decisionCoverage=1`
- 结果：
  - `pnpm run check:master-data-backlog` 通过（收紧后口径）
  - 可连库环境 `pnpm run check:master-data-release-gate` 继续 PASS（收紧后无回归）
- 当前关键量化：
  - `semanticFields=102`
  - `governedFields=84`
  - `pendingFields=18`
  - `planned=0`
  - `deferred=0`
  - `undecidedFields=0`
  - `decisionCoverage=1`
    - `audit-*.ts`
    - `governance-*.test.ts`
    - `README-*.md`（字段策略与执行顺序说明）
  - 模板脚本改为策略感知：
    - canonical 字段：`seed=true/backfill=true` 路径可执行；
    - name-only 字段：自动降级为 `seed=false/backfill=false` 的可执行占位流程，不再生成误导性逻辑。
  - 模板执行路径改为仓库根定位 `apps/backend/scripts/run-master-data-governance.ts`，支持在仓库根或 backend 目录直接执行。
  - 支持模板输出目录参数：`--outputDir=<path>`。
- 验证结果：
  - `pnpm --dir apps/backend run db:generate-governance-template --field=processName,team` 通过；
  - 从仓库根直接执行生成脚本：
    - `node --import tsx tmp/master-data-governance/team/seed-team.ts` 通过；
    - `node --import tsx tmp/master-data-governance/team/backfill-team.ts` 通过；
  - `audit-team.ts` 在当前环境因 `127.0.0.1:3306` 不可达失败（为外部环境限制，非模板错误）；
  - `pnpm run lint` 与 `pnpm -C apps/backend typecheck` 通过。

21. 脚手架门禁化（新增）

- 新增模板验证脚本：
  - 文件：`apps/backend/scripts/verify-master-data-governance-template.ts`
  - 命令：`pnpm --dir apps/backend run db:verify-governance-template`
  - 能力：
    - 在系统临时目录生成模板（默认 `os.tmpdir()`）；
    - 校验 6 类产物是否齐全；
    - 可执行 `seed/backfill` 模板验证；
    - 默认自动清理临时目录，避免污染仓库工作区。
- 新增根门禁命令：
  - `package.json`：
    - `check:master-data-template`
      - 当前默认参数：`--fields=team --executeFields=team`
  - 发布总闸接入：
    - `scripts/check-master-data-release-gate.mjs` 新增步骤 `master-data-template`
- 产物隔离修复：
  - `generate-master-data-governance-template.ts` 生成的 `seed/backfill/audit` 模板支持透传 `--reportDir`；
  - `verify-master-data-governance-template.ts` 执行模板时强制写报告到临时目录 `outputDir/reports`，避免写入仓库 `tmp/master-data-governance/reports` 触发 lint 噪音。
- 本轮验证结果：
  - `pnpm run check:master-data-template` 通过；
  - `pnpm run lint` 通过；
  - `pnpm -C apps/backend typecheck` 通过。

22. helper 与注册中心一致性门禁（新增）

- 新增脚本：
  - `apps/backend/scripts/check-master-data-helper-alignment.ts`
  - 校验内容：
    - helper 映射引用的 `configKey` 必须存在于注册中心；
    - helper 的 `targetField` 必须是注册中心目标列；
    - helper 的 `targetTable + targetField` 组合必须与注册中心目标一致；
    - 注册中心声明的目标列必须至少由一个 helper 覆盖（防漏接入）。
- 为消除重复定义风险：
  - `apps/backend/utils/master-data-governance-write.ts` 新增
    - `listGovernedWriteHelperSpecs()`
    - 由 helper 内部映射直接导出规格供门禁脚本消费，避免脚本侧再手写一套映射。
- 命令接入：
  - backend:
    - `db:check-master-data-helper-alignment`
  - root:
    - `check:master-data-helper-alignment`
  - 发布总闸：
    - `scripts/check-master-data-release-gate.mjs` 新增 `master-data-helper-alignment` 步骤。
- 本轮收口结果：
  - 初次运行门禁暴露了真实覆盖缺口（`processName/projectName/partName` 在部分表未被 helper 声明覆盖）；
  - 已补齐到统一 helper 映射（`quality_records`、`qms_inspection_requests`、`work_orders`、`after_sales`、`supervision_projects`、`vehicle_commissioning_issues` 等）；
  - 再次运行 `check:master-data-helper-alignment` 后 `registryCoverageIssues=0`。

23. 默认检查链与 CI 对齐（新增）

- 根检查链 `check` 已纳入：
  - `check:master-data-helper-alignment`
  - `check:master-data-template`
- CI 工作流 `.github/workflows/ci-gate.yml` 已新增独立 job：
  - `Master Data Helper Alignment Check`
  - `Master Data Template Check`
- 结果：
  - 本地默认检查链与 CI 的主数据治理门禁一致；
  - 不再出现“本地有治理脚本但 CI 未强制执行”的回退窗口。

24. 注册中心策略门禁（新增）

- 新增策略校验脚本：
  - `apps/backend/scripts/check-master-data-registry-policy.ts`
- 校验规则（硬约束）：
  - 字段 key 唯一；
  - `canonical-first` 必须有 `canonical` 关系；
  - 有 `canonical` 时：
    - `writeStrategy` 必须是 `dual-write`
    - `backfillPolicy` 必须是 `canonical-id`
    - `auditPolicy` 必须是 `canonical-id-and-orphan`
    - 至少一个 target 必须声明 `idColumn`
  - 无 `canonical` 时：
    - `backfillPolicy` 必须是 `none`
    - `auditPolicy` 必须是 `orphan-only`
    - target 不得声明 `idColumn`
  - 同一字段内 `table + nameColumn` 不允许重复。
- 命令接入：
  - backend：`db:check-master-data-registry-policy`
  - root：`check:master-data-registry-policy`
  - 根 `check` 主链：已接入
  - 发布总闸：`scripts/check-master-data-release-gate.mjs` 已新增 `master-data-registry-policy`
  - CI：`.github/workflows/ci-gate.yml` 已新增 `Master Data Registry Policy Check` job。
- 发布总闸更新：
  - `scripts/check-master-data-release-gate.mjs` 中 `master-data-report-strict` 已替换为：
    - `master-data-evidence-gate-wave0`
    - `master-data-evidence-gate-wave1`
    - `master-data-evidence-gate-wave2`
    - `master-data-evidence-gate-wave3`
  - 目的：避免“先校验后发现无报告”的空跑失败，改为门禁内自生成自校验。

18. 一致性指标趋势门禁（新增）

- 新增脚本：
  - `apps/backend/scripts/check-master-data-metrics-trend.ts`
  - 命令：`pnpm --dir apps/backend run db:check-master-data-metrics-trend --current=<consistency-report.json>`
- 校验规则：
  - 比对上一次快照（按输出目录最新文件）与当前快照；
  - 若 `totalMissingCanonicalId / totalInvalidCanonicalId / totalOrphanValues` 任一反弹（变大）则失败；
  - 默认快照目录改为系统临时目录：`$TMPDIR/master-data-governance/metrics`，避免污染仓库 lint。
- 目的：
  - 强化“指标持续下降/不反弹”的门禁约束；
  - 与一致性归零目标形成量化追踪链路。

## 当前状态（2026-05-22，更新）

1. 本地发布总闸已全量通过（含连库门禁）

- 已在本地启动 MySQL 并完成 `db:push` 与 `db:seed`。
- `pnpm run check:master-data-release-gate` 已通过，覆盖：
  - `check:type` / `lint` / `check:qms-arch`
  - `master-data-consistency`
  - `master-data-metrics-trend`
  - `master-data-template`
  - `master-data-registry-policy`
  - `master-data-helper-alignment`
  - `master-data-helper-surface`
  - `master-data-generic-write-entry`
  - wave0~wave3 evidence gate
  - `master-data-write-coverage`
  - `master-data-read-coverage`
  - `master-data-derived-rules`

2. 一致性指标已归零（按本地迁移范围）

- `check-master-data-consistency --reportLabel=release` 输出：
  - `totalMissingCanonicalId=0`
  - `totalInvalidCanonicalId=0`
  - `totalOrphanValues=0`
  - `allAligned=true`

3. 根因修复已落地（非临时补丁）

- 审计口径修正：
  - `auditOrphans` 改为仅扫描 `isDeleted=0` 的活跃数据，避免软删除行误报。
- Wave3 派生源修正：
  - `projectName` 派生源补齐 `supervision_projects`；
  - `partName` 派生源补齐 `vehicle_commissioning_issues`；
  - 并与 `master-data-derived-rules.json` 对齐。
- 派生规则防漂移：
  - `check-master-data-derived-rules` 新增“注册中心 SQL 与冻结规则 SQL 一致性”校验（带 SQL 规范化比较）。
- 数据修复执行器：
  - 新增 `repair-master-data-orphans.ts`，支持 `dryRun/execute`，对 `dictionary/table/derived` 来源统一做孤儿值补源修复。

4. 剩余工作（上线前最后一段）

- 需在目标环境（测试/预发/生产）按同一命令复跑发布总闸，确认非本地特例。
- CI 若未接数据库，需要补可达数据库执行策略，否则“发布前强制门禁”只能在人工流程中执行。

## 最新增量（2026-05-22，续）

1. backfill 统一续跑能力落地（执行器级）

- 文件：`apps/backend/utils/master-data-governance-kernel.ts`
- 增强点：
  - 修复回填循环在“单批全 unresolved 名称”时提前 `break` 的问题，改为继续扫描后续批次；
  - 新增 backfill 统一运行控制参数：
    - `batchSize`
    - `maxRowsPerTable`
    - `maxBatchesPerTable`
    - `startAfterIdsByTable`（按表游标续跑）
  - 新增进度输出 `progressByTable`：
    - `batches`
    - `scannedRows`
    - `updatedRows`
    - `unresolvedRows`
    - `lastScannedId`
    - `nextStartAfterId`
    - `exhausted`

2. 统一运行脚本与证据门禁支持 backfill 参数透传

- 文件：
  - `apps/backend/scripts/run-master-data-governance.ts`
  - `apps/backend/scripts/run-master-data-governance-evidence-gate.ts`
- 新增参数：
  - `--backfillBatchSize`
  - `--backfillMaxRowsPerTable`
  - `--backfillMaxBatchesPerTable`
  - `--backfillStartAfterIdsByTable=<json>`
- 结果：治理执行、证据报告、证据门禁可统一携带断点续跑参数。

3. 脚手架与模板验证支持 backfill 续跑参数

- 文件：
  - `apps/backend/scripts/generate-master-data-governance-template.ts`
  - `apps/backend/scripts/verify-master-data-governance-template.ts`
- 模板 `backfill-*.ts` 可透传 backfill 参数；
- 模板 README 增加 cursor 续跑示例；
- 模板验证脚本已支持 backfill 参数透传，验证阶段可覆盖“可分批/可续跑”能力。

4. 新增 backfill 核心单测

- 文件：`apps/backend/utils/master-data-governance-kernel.backfill.test.ts`
- 用例覆盖：
  - unresolved 批次后继续扫描并更新后续可回填记录；
  - `maxBatchesPerTable` 截断并返回 `nextStartAfterId`；
  - `maxRowsPerTable` 截断并返回 `nextStartAfterId`。

5. read-canonical 覆盖门禁落地（新增）

- 新增脚本：
  - `apps/backend/scripts/audit-master-data-read-coverage.ts`
- 规则：
  - 从注册中心自动筛选 `readStrategy=canonical-first` 字段；
  - 扫描目标表读取调用（`findMany/findFirst/findUnique/aggregate/groupBy`）；
  - 读取命中治理字段时，必须检测到 canonical 上下文（`resolveCanonical*`、`buildProcessNameWhere` 等），否则失败。
- 工程接入：
  - backend 命令：`db:audit-master-data-read-coverage`
  - root 命令：`check:master-data-read-coverage`
  - 发布总闸：`scripts/check-master-data-release-gate.mjs` 已新增 `master-data-read-coverage`
  - CI：`.github/workflows/ci-gate.yml` 已新增 `Master Data Read Coverage Check` job。
- 首轮门禁结果：
  - 初次发现 2 个缺口（含 1 个误报）；
  - 已修复脚本边界识别误报与 `inspection.service.ts` 读路径 canonical 化缺口；
  - 复验结果：`totalMissingHits=0`。

6. 模板门禁升级为“全字段生成验证”（新增）

- 文件：`apps/backend/scripts/verify-master-data-governance-template.ts`
- 升级点：
  - 支持 `--all=true` / `--wave`，可一次验证注册中心范围内所有字段模板产物；
  - 新增 `--executeCanonical=false`，可在无连库保障下跳过 canonical 字段实执行，仅执行 name-only 字段模板验证；
  - 默认行为保持兼容（未传参数仍默认 `team`）。
- root 门禁调整：
  - `package.json` 的 `check:master-data-template` 改为：
    - `pnpm --dir apps/backend run db:verify-governance-template --all=true --executeCanonical=false`
- 结果：
  - 模板门禁不再是单字段抽样，而是全字段生成能力校验，更贴合“新增字段一键生成”的最终目标。

7. 写入 helper 映射改为注册中心驱动（新增）

- 文件：`apps/backend/utils/master-data-governance-write.ts`
- 变更：
  - 删除大段手工字段映射常量，改为按注册中心 `targets` 自动构建 `table -> governed mapping`；
  - 保留现有 helper API（`buildGovernedInspectionWriteFields` 等）不变，业务调用面零改动；
  - `listGovernedWriteHelperSpecs()` 改为从统一派生映射生成，避免 helper 与注册中心双写漂移。
- 效果：
  - 新增字段（同表同名列）只改注册中心即可自动进入 helper 映射与 helper-alignment 门禁。
- 验证：
  - `pnpm -C apps/backend typecheck`
  - `pnpm -C apps/backend exec vitest run utils/master-data-governance-write.test.ts`
  - `pnpm run check:master-data-helper-alignment`
  - `pnpm run check:master-data-write-coverage`
  - `pnpm run lint`
  - 全部通过。

8. 新增按表通用写入 helper 入口（新增）

- 文件：`apps/backend/utils/master-data-governance-write.ts`
- 新增：
  - `buildGovernedWriteFieldsForTable(targetTable, input)`
- 目标：
  - 让新接入点可直接按注册表名调用统一 helper，减少“先新增专用 helper 再调用”的样板代码；
  - 与注册中心驱动映射联动，进一步逼近“新增字段只改注册配置”。
- 测试：
  - `apps/backend/utils/master-data-governance-write.test.ts` 增加：
    - 按表通用入口正常归一化用例；
    - 未注册表名抛错用例。

9. helper 规格清单改为自动派生（新增）

- 文件：`apps/backend/utils/master-data-governance-write.ts`
- 变更：
  - `listGovernedWriteHelperSpecs()` 不再依赖手工 `GOVERNED_HELPER_DEFINITIONS` 列表；
  - 改为从注册中心 `targets` 自动派生表清单与映射，再按已知专用 helper 名字做别名映射。
- 效果：
  - 新增字段若落到新目标表，不再要求先补 helper 规格清单才能通过 alignment 门禁；
  - 进一步降低“新增字段接入需要改多处代码”的风险。
- 本轮验证：
  - `pnpm -C apps/backend typecheck`
  - `pnpm -C apps/backend exec vitest run utils/master-data-governance-write.test.ts`
  - `pnpm run check:master-data-helper-alignment`
  - `pnpm run check:master-data-write-coverage`
  - `pnpm run check:master-data-read-coverage`
  - `pnpm run lint`
  - 全部通过。

10. helper 表面门禁（防扩张）落地（新增）

- 新增脚本：
  - `apps/backend/scripts/check-master-data-helper-surface.ts`
- 规则：
  - 限定 `master-data-governance-write.ts` 中可导出的专用 helper 集合；
  - 检测到新增 `buildGovernedXxxWriteFields` 导出则失败，提示改用 `buildGovernedWriteFieldsForTable(targetTable, input)`。
- 工程接入：
  - backend：`db:check-master-data-helper-surface`
  - root：`check:master-data-helper-surface`
  - release gate：`master-data-helper-surface`
- CI：`Master Data Helper Surface Check`
- 结果：
  - 当前存量 helper 全部通过门禁，`violations=0`。

11. 通用写入口强门禁（新增，防止回退到专用 helper）

- 文件：
  - `apps/backend/scripts/check-master-data-generic-write-entry.ts`
  - `apps/backend/package.json`
  - `package.json`
  - `scripts/check-master-data-release-gate.mjs`
- 规则：
  - 业务代码（`api/services/utils`，排除测试和 `master-data-governance-write.ts`）禁止使用专用 `buildGovernedXxxWriteFields`。
  - 统一要求使用 `buildGovernedWriteFieldsForTable(targetTable, input)`。
- 门禁接入：
  - backend 命令：`db:check-master-data-generic-write-entry`
  - root 命令：`check:master-data-generic-write-entry`
  - release gate 新增步骤：`master-data-generic-write-entry`
- 本轮结果：
  - `specializedHelpers=13`
  - `scannedFiles=362`
  - `violations=0`

12. 回归修复（inspection.service 单测）

- 根因：
  - 治理链路在更新模板绑定前新增了 `tx.processes.findFirst` 读取，但测试事务 mock 未补齐该分支，导致 `Cannot read properties of undefined (reading 'findFirst')`。
- 处理：
  - 文件：`apps/backend/services/__tests__/inspection.service.test.ts`
  - 为相关 update 用例补齐 `processes.findFirst` mock，恢复与真实链路一致。
- 结果：
  - `pnpm -C apps/backend exec vitest run services/__tests__/inspection.service.test.ts` 通过。

13. 当前门禁状态（2026-05-22）

- 已通过：
  - `pnpm run check:type`
  - `pnpm run lint`
  - `pnpm run check:qms-arch`
  - `pnpm run check:master-data-governance`
  - `pnpm run check:master-data-registry-policy`
  - `pnpm run check:master-data-helper-alignment`
  - `pnpm run check:master-data-helper-surface`
  - `pnpm run check:master-data-generic-write-entry`
  - `pnpm run check:master-data-write-coverage`
  - `pnpm run check:master-data-read-coverage`
  - `pnpm run check:master-data-template`
- 仍阻塞：
  - `pnpm run check:master-data-release-gate` 在 `master-data-consistency` 步骤失败（`127.0.0.1:3306` 不可达），属于数据库环境阻塞，不是代码门禁失败。

14. Wave2 字段继续收口（quality_plans.customer、qms_task_dispatches.type）

- 注册中心新增/扩展：
  - 文件：`apps/backend/utils/master-data-governance-registry.ts`
  - 变更：
    - `customerName` 新增目标列：`quality_plans.customer`
    - 新增字段：`taskDispatchType` -> `qms_task_dispatches.type`
- 写入链路接入统一 helper（真实主路径）：
  - `apps/backend/api/qms/planning/itp/projects/index.post.ts`
  - `apps/backend/api/qms/planning/itp/projects/[id].put.ts`
  - `apps/backend/api/qms/task-dispatch/index.post.ts`
  - `apps/backend/api/qms/task-dispatch/seed.get.ts`
  - `apps/backend/api/qms/inspection/requests/[id]/dispatch.post.ts`
  - 均通过 `buildGovernedWriteFieldsForTable(targetTable, input)` 统一入口接入。
- backlog 决策收口：
  - 文件：`apps/backend/config/master-data-governance-backlog.json`
  - 状态调整：
    - `quality_plans.customer`: `planned -> excluded`
    - `qms_task_dispatches.type`: `planned -> excluded`
  - 原因：已分别被 `customerName` / `taskDispatchType` 注册字段覆盖。
- 单测补齐：
  - `apps/backend/utils/master-data-governance-registry.test.ts`
    - 字段列表与 wave2 断言新增 `taskDispatchType`
  - `apps/backend/utils/master-data-governance-write.test.ts`
    - 新增 `quality_plans.customer` 与 `qms_task_dispatches.type` 归一化断言
- 本轮量化结果（基于最新脚本实跑）：
  - `pnpm run check:master-data-backlog`
    - `semanticFields=102`
    - `governedFields=51`（较上一轮 `49` +2）
    - `pendingFields=51`（较上一轮 `53` -2）
    - `planned=18`（较上一轮 `20` -2）
    - `deferred=16`（持平）
    - `excluded=17`（持平）
    - `undecidedFields=0`
    - `decisionCoverage=1`
- 本轮门禁结果：
  - 通过：
    - `pnpm -C apps/backend typecheck`
    - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts utils/task-dispatch.test.ts`
    - `pnpm run check:master-data-governance`
    - `pnpm run check:master-data-generic-write-entry`
    - `pnpm run check:master-data-write-coverage`（含新字段覆盖，`totalMissingHits=0`）
    - `pnpm run check:master-data-backlog`
  - 阻塞（环境）：
    - `pnpm run check:master-data-release-gate` 在 `master-data-consistency` 步骤失败，原因是本地数据库 `127.0.0.1:3306` 不可达。

15. 多字段波次收口（继续压降 planned backlog）

- 注册中心新增字段（本轮）：
  - `incomingType` -> `inspections.incomingType`
  - `materialName` -> `inspections.materialName`
  - `componentName` -> `qms_inspection_requests.componentName`
  - `requirementName` -> `work_order_requirements.requirementName`
  - `responsibleTeam` -> `work_order_requirements.responsibleTeam`
  - `borrowerName` -> `metrology_borrow_records.borrowerName`
  - `supplierEntityName` -> `suppliers.name`
  - `supplierProductName` -> `suppliers.productName`
  - `supplierProject` -> `suppliers.project`
- 注册中心扩展（本轮）：
  - `projectName` 新增目标：
    - `quality_plans.projectName`
    - `bom_projects.projectName`
    - `dfmea_projects.projectName`
    - `doc_projects.projectName`

- 真实写入链路接入统一 helper（本轮）：
  - `apps/backend/services/inspection.service.ts`
    - `inspections.create/update` 接入 `incomingType/materialName`
    - `doc_projects` 自动同步 `create/update` 接入 `projectName`
  - `apps/backend/api/qms/inspection/requests/index.post.ts`
  - `apps/backend/api/qms/public/inspection/requests/index.post.ts`
    - 接入 `componentName`
  - `apps/backend/api/qms/work-order/requirements/index.post.ts`
  - `apps/backend/api/qms/work-order/requirements/[id].put.ts`
    - 接入 `requirementName/responsibleTeam`
  - `apps/backend/services/metrology-borrow.service.ts`
    - 借用创建接入 `borrowerName`
  - `apps/backend/api/qms/planning/itp/projects/index.post.ts`
  - `apps/backend/api/qms/planning/itp/projects/[id].put.ts`
    - 接入 `quality_plans.projectName`
  - `apps/backend/api/qms/planning/bom/index.post.ts`
  - `apps/backend/api/qms/planning/bom/projects/index.post.ts`
  - `apps/backend/api/qms/planning/bom/projects/[id].put.ts`
  - `apps/backend/api/qms/planning/project-docs/projects/index.post.ts`
  - `apps/backend/api/qms/planning/project-docs/projects/[id].put.ts`
  - `apps/backend/api/qms/planning/dfmea/projects/index.post.ts`
  - `apps/backend/api/qms/planning/dfmea/projects/[id].put.ts`
  - `apps/backend/api/qms/planning/dfmea/seed.get.ts`
    - 全部通过 `buildGovernedWriteFieldsForTable(...)` 或封装后的通用入口接入 `projectName`

- backlog 决策更新（本轮 `planned -> excluded`）：
  - `bom_projects.projectName`
  - `dfmea_projects.projectName`
  - `doc_projects.projectName`
  - `inspections.incomingType`
  - `inspections.materialName`
  - `metrology_borrow_records.borrowerName`
  - `qms_inspection_requests.componentName`
  - `quality_plans.projectName`
  - `suppliers.name`
  - `suppliers.productName`
  - `suppliers.project`
  - `work_order_requirements.requirementName`
  - `work_order_requirements.responsibleTeam`

- 量化结果（脚本实跑）：
  - `semanticFields=102`
  - `governedFields=61`（上一轮 51，本轮 +10）
  - `pendingFields=41`（上一轮 51，本轮 -10）
  - `planned=5`（上一轮 18，本轮 -13）
  - `deferred=16`（持平）
  - `excluded=20`（上一轮 17，本轮 +3）
  - `undecidedFields=0`
  - `decisionCoverage=1`
  - 当前仅剩 `planned` 字段：
    - `dfmea.cause`
    - `inspection_form_templates.formName`
    - `itp_items.processStep`
    - `measuring_instruments.instrumentName`
    - `processes.name`

- 本轮验证结果：
  - 通过：
    - `pnpm run lint`
    - `pnpm -C apps/backend typecheck`
    - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts utils/task-dispatch.test.ts`
    - `pnpm run check:master-data-governance`
    - `pnpm run check:master-data-backlog`
    - `pnpm run check:master-data-write-coverage`（`totalMissingHits=0`）
    - `pnpm run check:master-data-generic-write-entry`（`violations=0`）
  - 阻塞（环境）：
    - `pnpm run check:master-data-release-gate` 在 `master-data-consistency` 步骤失败，原因仍是 `127.0.0.1:3306` 不可达。

16. planned backlog 清零（字段治理覆盖继续扩大）

- 本轮新增治理字段（registry）：
  - `dfmeaCause` -> `dfmea.cause`
  - `inspectionFormName` -> `inspection_form_templates.formName`
  - `itpProcessStep` -> `itp_items.processStep`
  - `instrumentName` -> `measuring_instruments.instrumentName`
- `projectName` 目标继续扩展：
  - `bom_projects.projectName`
  - `doc_projects.projectName`
  - `dfmea_projects.projectName`

- 本轮写路径接入（统一 helper）：
  - `apps/backend/api/qms/planning/dfmea/index.post.ts`
  - `apps/backend/api/qms/planning/dfmea/[id].put.ts`
  - `apps/backend/api/qms/planning/inspection-forms/index.post.ts`
  - `apps/backend/api/qms/planning/inspection-forms/[id].put.ts`
  - `apps/backend/api/qms/planning/itp/index.post.ts`
  - `apps/backend/api/qms/planning/itp/[id].put.ts`
  - `apps/backend/services/metrology.service.ts`（含 import upsert 路径）
  - `apps/backend/api/qms/planning/bom/index.post.ts`（补齐门禁识别上下文）

- backlog 决策更新（本轮）：
  - `dfmea.cause`: `planned -> excluded`
  - `inspection_form_templates.formName`: `planned -> excluded`
  - `itp_items.processStep`: `planned -> excluded`
  - `measuring_instruments.instrumentName`: `planned -> excluded`
  - `processes.name`: `planned -> excluded`（canonical source entity 主标签，不作为传播目标字段治理项）

- 本轮量化结果（脚本实跑）：
  - `semanticFields=102`
  - `governedFields=68`
  - `pendingFields=34`
  - `planned=0`（本轮达成清零）
  - `deferred=16`
  - `excluded=18`
  - `undecidedFields=0`
  - `decisionCoverage=1`

- 本轮门禁结果：
  - 通过：
    - `pnpm run lint`
    - `pnpm -C apps/backend typecheck`
    - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts utils/master-data-governance-write.test.ts utils/task-dispatch.test.ts`
    - `pnpm run check:master-data-governance`
    - `pnpm run check:master-data-backlog`
    - `pnpm run check:master-data-write-coverage`（`totalMissingHits=0`）
    - `pnpm run check:master-data-generic-write-entry`（`violations=0`）
  - 仍阻塞（环境）：
    - `pnpm run check:master-data-release-gate` 在 `master-data-consistency` 步骤失败，原因仍是 `127.0.0.1:3306` 不可达。

17. 验收口径硬化与全链路复验（actionable pending 收敛为 0）

- 本轮目标：
  - 把“剩余治理字段”从 `pendingFields` 粗口径升级为“可行动未完成”口径，避免把 `excluded` 误判为未完成。
  - 验证 `acceptance` 脚本对新口径进行强校验，确保发布门禁可直接用于验收。

- 本轮代码变更：
  - `apps/backend/scripts/export-master-data-governance-backlog.ts`
    - `summary` 新增 `actionablePendingFields = planned + deferred + undecided`
  - `apps/backend/scripts/check-master-data-acceptance.ts`
    - 新增强校验：`actionablePendingFields === 0`
    - 兼容旧报告读取逻辑（字段不存在时回退计算）

- 本轮量化结果（脚本实跑）：
  - `semanticFields=102`
  - `governedFields=84`
  - `pendingFields=18`
  - `actionablePendingFields=0`
  - `planned=0`
  - `deferred=0`
  - `undecidedFields=0`
  - `excluded=18`
  - `decisionCoverage=1`
  - `allAligned=true`
  - `totalMissingCanonicalId=0`
  - `totalInvalidCanonicalId=0`
  - `totalOrphanValues=0`

- 本轮验证结论：
  - 通过：
    - `pnpm -C apps/backend typecheck`
    - `pnpm run check:master-data-backlog`
    - `pnpm run check:master-data-acceptance`（可连库环境）
  - 说明：
    - 在默认沙箱中 `Prisma -> 127.0.0.1:3306` 会被隔离，需在可连库执行环境运行一致性与验收门禁；在可连库环境已验证全绿。

18. 发布门禁硬化：纳入 acceptance 强阻断并完成整链 PASS

- 本轮目标：
  - 把 `check:master-data-acceptance` 纳入发布总门禁，确保“可行动未完成字段=0 + 一致性归零”成为发布硬条件。

- 本轮代码变更：
  - `scripts/check-master-data-release-gate.mjs`
    - 新增步骤：
      - `master-data-acceptance -> pnpm run check:master-data-acceptance`
    - 执行顺序放在 `master-data-backlog` 之后，`helper-alignment` 之前。

- 本轮门禁验证（可连库环境）：
  - 通过：
    - `pnpm run check:master-data-acceptance`
    - `pnpm run check:master-data-release-gate`
  - 关键输出：
    - acceptance 指标：`actionablePendingFields=0`、`planned=0`、`deferred=0`、`undecidedFields=0`
    - 一致性指标：`totalMissingCanonicalId=0`、`totalInvalidCanonicalId=0`、`totalOrphanValues=0`
    - release gate 结果：`[check-master-data-release-gate] PASS`

- 结论：
  - 发布前强制门禁已覆盖 `typecheck/lint/qms-arch + governance freeze + acceptance + wave evidence + write/read coverage + derived rules`。
  - 与“生产安全目标”对齐：任一关键指标不达标将直接阻断发布。

19. 目标机器审计（objective audit）落地（2026-05-22）

- 本轮目标：
  - 把“按目标逐条验收”从人工口径升级为可执行脚本，直接输出 `已完成/未完成` 与量化证据。

- 本轮代码变更：
  - 新增脚本：
    - `apps/backend/scripts/check-master-data-objective-audit.ts`
  - 脚本命令：
    - `apps/backend/package.json`：`db:check-master-data-objective-audit`
    - 根 `package.json`：`check:master-data-objective-audit`

- 审计覆盖（脚本内置检查）：
  - Phase 0：baseline 盘点与冻结证据存在性。
  - Phase A/B/C：内核/脚手架/wave evidence 完整性。
  - 目标指标：`actionablePendingFields`、`allAligned`、`missing/invalid/orphan`。
  - 发布门禁覆盖：release gate 是否包含关键步骤（含 acceptance）。
  - 防回退规则：direct mapping 冻结、helper 对齐、deferred 写路径、回填断点分批能力。
  - 最终验收：canonical-first 字段存在性与文档落地情况。

- 本轮实跑结果：
  - 命令：`pnpm run check:master-data-objective-audit`
  - 输出：
    - `summary.fail=0`
    - `summary.warn=0`
    - `summary.pass=14`
  - 报告：
    - `tmp/master-data-governance/objective-audit/objective-audit-2026-05-22T08-01-27-023Z.json`

- 结论：
  - 当前治理状态可由脚本自动给出量化结论，减少口头同步与人工漏检风险；
  - 后续每轮改动可复用同一命令回归，确保目标不偏离。

20. 目标审计硬化与发布链路接入（2026-05-22）

- 本轮目标：
  - 将 objective audit 从“独立检查”提升为“发布强制步骤”；
  - 强化 objective audit 对 read/write 覆盖证据的校验，避免口径虚绿。

- 本轮代码变更：
  - `apps/backend/scripts/audit-master-data-write-coverage.ts`
    - 新增覆盖报告落盘：`tmp/master-data-governance/write-coverage/*.json`
  - `apps/backend/scripts/audit-master-data-read-coverage.ts`
    - 新增覆盖报告落盘：`tmp/master-data-governance/read-coverage/*.json`
  - `apps/backend/scripts/check-master-data-objective-audit.ts`
    - 新增检查项：
      - `objective-write-coverage`（要求 `totalMissingHits=0`）
      - `objective-read-coverage`（要求 `totalMissingHits=0`）
    - 证据输出补充 read/write 覆盖报告路径
  - `scripts/check-master-data-release-gate.mjs`
    - 新增强制步骤：
      - `master-data-objective-audit -> pnpm run check:master-data-objective-audit`

- 本轮验证结果（可连库环境）：
  - `pnpm run lint`：通过
  - `pnpm run check:master-data-write-coverage`：通过，`totalMissingHits=0`
  - `pnpm run check:master-data-read-coverage`：通过，`totalMissingHits=0`
  - `pnpm run check:master-data-objective-audit`：通过，`fail=0/warn=0/pass=16`
  - `pnpm run check:master-data-release-gate`：通过（包含 objective-audit 新步骤）

- 本轮关键证据：
  - write coverage report：
    - `tmp/master-data-governance/write-coverage/write-coverage-2026-05-22T08-07-28-964Z.json`
  - read coverage report：
    - `tmp/master-data-governance/read-coverage/read-coverage-2026-05-22T08-07-29-325Z.json`
  - objective audit report：
    - `tmp/master-data-governance/objective-audit/objective-audit-2026-05-22T08-07-30-052Z.json`

- 结论：
  - “目标验收”已经进入发布阻断主链路，不再依赖人工解读；
  - 统一治理系统具备持续扩展所需的自动审计与回归能力。

21. 目标环境复跑与证据归档能力（2026-05-22）

- 本轮目标：
  - 增加测试/预发/生产可复用的统一执行脚本，固定产出“发布门禁日志 + 治理证据归档”。

- 本轮代码变更：
  - 新增脚本：`scripts/local/master-data-release-audit.sh`
    - 参数化：
      - `TARGET_ENV`（`local/staging/production`）
      - `DATABASE_URL`
      - `OUT_ROOT`
      - `DRY_RUN`
      - `SKIP_RELEASE_GATE`
      - `SKIP_OBJECTIVE_AUDIT`
    - 执行步骤：
      - `check:master-data-release-gate`
      - `check:master-data-objective-audit`
    - 归档产物：
      - `metadata.txt`
      - `logs/*.log`
      - `evidence/*.json`（backlog/consistency/governance/read/write/objective）
  - 新增文档：`docs/master-data-governance-release-runbook.md`
    - 包含目标环境执行命令、阻断标准、失败处理、证据路径约定。

- 本轮验证结果：
  - `TARGET_ENV=staging DRY_RUN=true scripts/local/master-data-release-audit.sh`：通过
  - 产物目录（示例）：
    - `tmp/master-data-governance/releases/staging-2026-05-22T08-13-47Z`
    - 已自动拷贝最新 evidence JSON 快照。

- 结论：
  - 目标环境复跑从“手工跑命令”升级为“一键执行 + 固定归档”；
  - 与最终目标中的“可持续扩展、可量化验收、可审计追溯”保持一致。

22. Wave4 首批字段并行落地计划已固化（2026-05-22）

- 目标字段（8）：
  - `productType`
  - `productSubtype`
  - `failureType`
  - `failureCause`
  - `taskDispatchType`
  - `itpProcessStep`
  - `dfmeaCause`
  - `qualityLossType`

- 字段策略（Lane-C 规划产物）：
  - 主数据来源策略：全部先按 registry 现状 `table` 来源提取历史值，再 seed 到 dictionary，后续切 canonical-first。
  - canonical 表策略：本批字段统一使用 `dictionaries`，不新建独立 canonical 表。
  - 预计迁移列：
    - `after_sales.productTypeId`
    - `after_sales.productSubtypeId`
    - `after_sales.failureTypeId`
    - `after_sales.failureCauseId`
    - `qms_task_dispatches.typeId`
    - `itp_items.processStepId`
    - `dfmea.causeId`
    - `quality_losses.typeId`

- 最低门禁命令（每字段至少一次）：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=<field> --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-<field>`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-<field>`

- 并行执行模板（3 lane 同步）：
  - Lane-A：schema/registry
  - Lane-B：write/read
  - Lane-C：evidence/gate
  - 同步规则：字段级文件所有权不重叠，任一 lane 缺产出即该字段 `未完成`。

- 量化目标（Wave4 阶段）：
  - `plannedFields=8`
  - `completedFields=0`（当前仅计划落地，尚未进入代码实施）
  - `pendingFields=8`
  - 完成判定：
    - 字段通过 `seed/backfill/audit` 且一致性 `missing/invalid/orphan=0` -> `已完成`
    - 任一指标不达标或证据缺失 -> `未完成`

23. Wave4 四字段（after_sales）实施状态看板（2026-05-22）

- 当前状态：`已完成（本批）`
- 实施字段（4）：
  - `productType`
  - `productSubtype`
  - `failureType`
  - `failureCause`
- 量化指标（after_sales 四字段）：
  - `planned=4`
  - `completed=4`
  - `pending=0`
- gate 通过判定条件（字段级）：
  - `db:run-master-data-evidence-gate` 对该字段执行 `seed=true/backfill=true/audit=true` 且成功
  - `db:check-master-data-consistency` 结果满足 `missing=0`、`invalid=0`、`orphan=0`
  - Lane-A/Lane-B/Lane-C 证据齐全（schema-registry、write-read、evidence-gate）
- 验收结果（本地）：
  - `db:run-master-data-evidence-gate --fields=productType,productSubtype,failureType,failureCause`：通过
  - `db:check-master-data-consistency --reportLabel=wave4-after-sales-4fields`：`allAligned=true`，`missing=0`，`invalid=0`，`orphan=0`

24. Wave10 后量化可见性补齐（Lane C，2026-05-23）

- 目标：
  - 将发布门禁可见性升级为统一量化模板输出，确保 Wave10 后状态可直接从 gate 审计结果读取。
  - 对用户明确排除的 7 个 supervision 字段增加硬约束，防止误回纳治理范围。

- 代码变更：
  - `apps/backend/scripts/check-master-data-objective-audit.ts`
    - 新增 `quantified` 输出，固定字段：
      - `total_fields`
      - `canonical_fields`
      - `name_only_fields`
      - `gate_pass_count`
      - `gate_fail_count`
      - `orphan_values`
    - 新增 `wave10-supervision-exclusion-guard` 审计项：
      - 从 `apps/backend/config/master-data-governance-backlog.json` 读取决策；
      - 强制以下 7 个字段必须保持 `excluded`，否则 objective-audit 失败并阻断 release gate：
        - `supervision_issues.issueType`
        - `supervision_issue_actions.actionType`
        - `supervision_projects.projectType`
        - `supervision_projects.participants`
        - `supervision_plan_tasks.taskName`
        - `supervision_plan_tasks.resourceName`
        - `supervision_plan_tasks.riskReason`
  - `apps/backend/utils/master-data-governance-registry.test.ts`
    - 新增测试：量化口径自洽（`total_fields = canonical_fields + name_only_fields` 对应关系）
    - 新增测试：上述 7 个 supervision 字段在 backlog 配置中保持 `excluded`。

- 本轮验证：
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-registry.test.ts`：通过（17 tests）
  - `pnpm --dir apps/backend exec vitest run utils/master-data-governance-write.test.ts`：通过（29 tests）
  - `pnpm --dir apps/backend typecheck`：通过
  - `pnpm run check:master-data-objective-audit`：通过

- 本轮量化结果（来自 objective-audit 最新报告）：
  - `total_fields=39`
  - `canonical_fields=37`
  - `name_only_fields=2`
  - `gate_pass_count=17`
  - `gate_fail_count=0`
  - `orphan_values=0`

25. Excluded 分类量化与门禁一致性补齐（并行 Lane A/B，2026-05-23）

- 目标：
  - 把 `pendingFields=25`（全为 `excluded`）从“单一数字”升级为可解释分类，避免误读为“仍有 25 个待治理项”。
  - 在 objective-audit 中新增 `excluded` 分类一致性校验与量化输出，确保 backlog 与门禁口径一致。

- 并行改动：
  - Lane A（backlog 导出）：
    - `apps/backend/scripts/export-master-data-governance-backlog.ts`
    - `apps/backend/scripts/export-master-data-governance-backlog.test.ts`
    - 新增 `summary.excludedBreakdown`：
      - `business_excluded`
      - `canonical_source`
      - `covered_by_governance`
      - `system_metadata`
      - `other`
    - 校验口径：`excludedBreakdown` 各类之和必须等于 `statusBreakdown.excluded`。
  - Lane B（objective audit）：
    - `apps/backend/scripts/check-master-data-objective-audit.ts`
    - 新增审计项 `objective-excluded-breakdown-consistency`：
      - 校验 backlog 中 `excludedBreakdown` 总和与 `excluded` 一致。
    - 保留并继续执行 `wave10-supervision-exclusion-guard`（7 个 supervision 字段强制 `excluded`）。
    - `quantified` 新增输出：
      - `excluded_total`
      - `excluded_covered_by_governance`
      - `excluded_canonical_source`
      - `excluded_system_metadata`
      - `excluded_business_excluded`
      - `excluded_other`

- 本轮验证：
  - `pnpm --dir apps/backend exec vitest run scripts/export-master-data-governance-backlog.test.ts`：通过（2 tests）
  - `pnpm --dir apps/backend run db:check-master-data-backlog`：通过
  - `pnpm --dir apps/backend run db:check-master-data-objective-audit`：通过（`fail=0 pass=18 warn=0`）
  - `pnpm run check:master-data-release-gate`：通过

- 最新量化结果（release baseline）：
  - 治理总览：
    - `total_fields=39`
    - `canonical_fields=37`
    - `name_only_fields=2`
    - `orphan_values=0`
  - excluded 分类：
    - `excluded_total=25`
    - `excluded_system_metadata=13`
    - `excluded_business_excluded=10`
    - `excluded_canonical_source=1`
    - `excluded_covered_by_governance=0`
    - `excluded_other=1`
  - 监督模块 7 字段（用户明确“不做治理”）：
    - 模块归属：QMS `supervision`（监督）模块
    - 对应字段：
      - `supervisionParticipants` -> `supervision_projects.participants`
      - `supervisionPlanTaskName` -> `supervision_plan_tasks.taskName` / `supervision_report_task_updates.taskName`
      - `supervisionPlanTaskResourceName` -> `supervision_plan_tasks.resourceName`
      - `supervisionRiskReason` -> `supervision_plan_tasks.riskReason` / `supervision_report_task_updates.riskReason`
      - `supervisionMilestoneName` -> `supervision_milestones.name`
      - `supervisionMilestoneDelayReason` -> `supervision_milestones.delayReason`
      - `supervisionPlanStepName` -> `supervision_plan_steps.stepName`
    - 当前策略：统一保持 `excluded`，并由 `wave10-supervision-exclusion-guard` 强制校验，防止误纳入后续波次。

26. 剩余字段模块化量化导出（并行收敛，2026-05-23）

- 目标：
  - 把“还有多少字段要治理”从单数字升级为“按模块可追溯清单”，直接回答业务侧“哪个模块还剩什么”。

- 改动：
  - 新增 `apps/backend/scripts/export-master-data-pending-by-module.ts`
    - 复用 `buildMasterDataGovernanceBacklogReport`，按 `model/table` 归类模块。
    - 输出 `summary + modules[] + fields[]`，字段包含 `status/reason/fieldNameZh`（可用时）。
  - 修复 `apps/backend/scripts/check-master-data-objective-audit.ts`
    - backlog 报告选择规则从“任意最新 JSON”收紧为 `backlog-report-*.json`，避免与 `pending-by-module-*.json` 结构冲突。

- 本轮验证：
  - `pnpm --dir apps/backend typecheck`：通过
  - `pnpm --dir apps/backend run db:export-master-data-pending-by-module`：通过
  - `pnpm --dir apps/backend run db:check-master-data-objective-audit`：通过（`fail=0 pass=18 warn=0`）
  - `pnpm run check:master-data-release-gate`：代码链路通过到 DB 前；最终失败点仍为本地 DB 连通性（`127.0.0.1:3306` 不可达），非代码治理回归。

- 最新模块量化（`pending-by-module`）：
  - `totalPending=25`
  - `totalExcluded=25`
  - `totalUndecided=0`
  - `moduleCount=7`
  - 模块分布：
    - `system=11`
    - `supervision=9`
    - `dictionary=1`
    - `inspection=1`
    - `knowledge=1`
    - `standard_document=1`
    - `welder=1`
  - 产物文件：
    - `tmp/master-data-governance/backlog/pending-by-module-2026-05-23T03-08-25-169Z.json`

27. 门禁新增模块量化导出步骤（Lane B，2026-05-23）

- 目标：
  - 把“按模块量化导出”纳入 release gate 固定步骤，确保每次发布前都产出可追溯的剩余字段模块清单。

- 改动：
  - `scripts/check-master-data-release-gate.mjs`
    - 在 `master-data-baseline-export` 后新增非 DB 门禁步骤：
      - `master-data-pending-by-module-export`
      - 执行命令：`pnpm --dir apps/backend run db:export-master-data-pending-by-module`
  - `apps/backend/package.json`
    - 复用脚本定义保持单一入口（无重复）：
      - `db:export-master-data-pending-by-module`

- 本轮验证：
  - `pnpm --dir apps/backend run db:export-master-data-pending-by-module`：通过（命令成功并生成最新 `pending-by-module-*.json` 报表）

28. Lane B 门禁接入位置修正（2026-05-23）

- 按发布链路顺序要求，`scripts/check-master-data-release-gate.mjs` 的模块量化步骤已调整为：
  - `name: master-data-pending-by-module`
  - `cmd: pnpm --dir apps/backend run db:export-master-data-pending-by-module`
  - 位置：`master-data-backlog` 后、`master-data-acceptance` 前
- `apps/backend/package.json` 中 `db:export-master-data-pending-by-module` 维持单一脚本入口（仅保留 1 处定义）。

29. Lane B 模块量化一致性检查接入门禁（2026-05-23）

- 目标：
  - 在发布门禁中新增“模块量化一致性检查”，确保 `pending-by-module` 报表不是只导出，还会被统一校验。

- 改动：
  - `apps/backend/package.json`
    - 新增单一脚本入口：
      - `db:check-master-data-pending-by-module -> node --import tsx ./scripts/check-master-data-pending-by-module.ts`
  - 根 `package.json`
    - 新增发布门禁调用入口：
      - `check:master-data-pending-by-module -> pnpm --dir apps/backend run db:check-master-data-pending-by-module`
  - `scripts/check-master-data-release-gate.mjs`
    - 保留导出步骤：
      - `name: master-data-pending-by-module`
      - `cmd: pnpm --dir apps/backend run db:export-master-data-pending-by-module`
    - 新增检查步骤：
      - `name: master-data-pending-by-module-check`
      - `cmd: pnpm run check:master-data-pending-by-module`
      - 位置：`master-data-pending-by-module` 后、`master-data-acceptance` 前。

- 本轮验证：
  - `pnpm --dir apps/backend run db:check-master-data-pending-by-module`：通过。

29. Lane B 新增趋势门禁（2026-05-23）

- 目标：
  - 在发布门禁中固定执行“pending-by-module 趋势检查”，防止总量或模块分布回退只靠人工发现。

- 改动：
  - `apps/backend/package.json`
    - 新增脚本：`db:check-master-data-pending-by-module-trend`
    - 命令：`node --import tsx ./scripts/check-master-data-pending-by-module-trend.ts`
  - `scripts/check-master-data-release-gate.mjs`
    - 新增步骤：
      - `name: master-data-pending-by-module-trend`
      - `cmd: pnpm --dir apps/backend run db:check-master-data-pending-by-module-trend`
    - 放置位置：`master-data-pending-by-module-export` 后。

- 口径：
  - 趋势检查基于 `tmp/master-data-governance/backlog/pending-by-module-*.json` 历史快照；
  - 对比最近两次快照的 `totalPending/totalExcluded/totalUndecided` 及模块分布，出现回退则门禁失败。

30. Excluded Freeze + Quantified Baseline 门禁化（并行收敛，2026-05-23）

- 目标：
  - 把“剩余 25 个 excluded + 量化基线值”从观察指标升级为硬门禁，避免后续字段治理回退或口径漂移。

- 改动：
  - 新增 `apps/backend/scripts/check-master-data-excluded-freeze.ts`
    - 校验：
      - `excludedCount=25`
      - `planned=0`
      - `deferred=0`
      - `actionablePending=0`
      - supervision 9 字段全部 `excluded`
  - 新增 `apps/backend/scripts/check-master-data-quantified-baseline.ts`
    - 对比 objective-audit 最新报告与固定基线：
      - `total_fields=39`
      - `canonical_fields=37`
      - `name_only_fields=2`
      - `excluded_total=25`
      - `excluded_system_metadata=13`
      - `excluded_business_excluded=10`
      - `excluded_canonical_source=1`
      - `excluded_covered_by_governance=0`
      - `excluded_other=1`
  - `apps/backend/package.json`
    - 新增：
      - `db:check-master-data-excluded-freeze`
      - `db:check-master-data-quantified-baseline`
  - 根 `package.json`
    - 新增：
      - `check:master-data-excluded-freeze`
      - `check:master-data-quantified-baseline`
    - `check` 总链路已纳入以上两个检查与 `check:master-data-pending-by-module`
  - `scripts/check-master-data-release-gate.mjs`
    - 新增步骤：
      - `master-data-excluded-freeze`
      - `master-data-quantified-baseline`
    - 且都位于 `master-data-template` 前，保证 DB 不通时也能先完成代码侧量化门禁验证。

- 本轮验证：
  - `pnpm --dir apps/backend exec vitest run scripts/check-master-data-excluded-freeze.test.ts scripts/check-master-data-quantified-baseline.test.ts scripts/check-master-data-pending-by-module.test.ts scripts/check-master-data-pending-by-module-trend.test.ts scripts/export-master-data-pending-by-module.test.ts`：通过（5 files / 11 tests）
  - `pnpm --dir apps/backend run db:check-master-data-excluded-freeze`：通过
  - `pnpm --dir apps/backend run db:check-master-data-quantified-baseline`：通过
  - `pnpm run check:master-data-release-gate`：
    - 新增量化步骤均通过（pending/export/check/trend/excluded-freeze/quantified-baseline）
    - 当前首个失败点仍是 `master-data-template` 的 DB 连接（`127.0.0.1:3306` 不可达）。
