# 主数据全字段治理验收清单（2026-05-22）

## 1. 统一入口目标

- 目标：新增字段接入仅改注册配置，不再手工改多处 API/Service/SQL。
- 证据：
  - `apps/backend/utils/master-data-governance-registry.ts` 为字段单一真源。
  - `apps/backend/utils/master-data-governance-write.ts` 按注册中心自动派生 `table -> mapping`。
  - 业务写入口统一要求 `buildGovernedWriteFieldsForTable(targetTable, input)`。
  - `apps/backend/scripts/check-master-data-generic-write-entry.ts` 门禁阻断专用 helper 业务调用回退。
- 结论：已满足（代码与门禁双重约束）。

## 2. 统一链路目标

- 目标：`schema -> seed -> backfill -> dual-write -> read-canonical -> audit` 全部走统一执行器。
- 证据：
  - 统一执行器：`apps/backend/utils/master-data-governance-kernel.ts`
  - 统一运行入口：`apps/backend/scripts/run-master-data-governance.ts`
  - 统一证据门禁：`apps/backend/scripts/run-master-data-governance-evidence-gate.ts`
  - 发布总闸包含 wave0~wave3 evidence gate：`scripts/check-master-data-release-gate.mjs`
- 结论：已满足（发布总闸实跑通过）。

## 3. 生产安全目标

- 目标：发布前门禁必须通过，不通过禁止上线。
- 证据：
  - `scripts/check-master-data-release-gate.mjs` 串行 fail-closed。
  - 本地实跑结果：`check-master-data-release-gate` 最终 `PASS`。
- 结论：已满足（本地环境）。

## 4. 数据质量目标

- 目标：迁移范围内 `empty_id=0`、`invalid_id=0`、`orphan=0`。
- 证据：
  - `apps/backend/scripts/check-master-data-consistency.ts` 统一输出。
  - 报告：`tmp/master-data-governance/consistency/consistency-report-2026-05-22T04-12-24-682Z-release.json`
  - 指标：`totalMissingCanonicalId=0`、`totalInvalidCanonicalId=0`、`totalOrphanValues=0`、`allAligned=true`
- 结论：已满足（本地迁移范围）。

## 5. 成本目标

- 目标：每个新字段可一键生成迁移、回填、审计、测试骨架。
- 证据：
  - 生成器：`apps/backend/scripts/generate-master-data-governance-template.ts`
  - 验证器：`apps/backend/scripts/verify-master-data-governance-template.ts`
  - 门禁：`check:master-data-template`（全字段 `--all=true`）
  - 本地实跑：`check:master-data-template` 通过。
- 结论：已满足。

## 6. 防回退规则

- 目标：禁止手写映射、禁止绕过注册中心、迁移必须有测试和审计报告。
- 证据：
  - `check-master-data-governance.mjs`
  - `check-master-data-helper-alignment.ts`
  - `check-master-data-helper-surface.ts`
  - `check-master-data-generic-write-entry.ts`
  - wave evidence report 检查：`check-master-data-governance-report.ts`
- 结论：已满足（当前规则覆盖到位）。

## 7. 阶段状态

- Phase 0：已完成（基线导出 + 冻结门禁）。
- Phase A：已完成（字段无关治理内核 + 注册中心 + 适配源类型）。
- Phase B：已完成（模板生成 + 验证 + 证据门禁）。
- Phase C：已完成本次定义波次（wave1~3 全量门禁通过）。
- Phase D：本地收口已完成（审计归零）；目标环境仍需同口径复跑。

## 8. 仍需在目标环境执行

- 在测试/预发/生产环境复跑：
  - `pnpm run check:master-data-release-gate`
- 若 CI 无数据库接入，需补充“可达 DB 的发布门禁执行策略”，否则只能依赖人工发布前执行。

## 10. 本轮新增验收（2026-05-22）

- 发布门禁口径收紧：
  - `scripts/check-master-data-release-gate.mjs` 中 wave1/2/3 evidence gate 已统一改为
    - `--seed=true --backfill=true --audit=true`
  - 验证：`pnpm run check:master-data-release-gate` 通过。
- read-canonical 缺口清零：
  - 修复文件：
    - `apps/backend/utils/master-data-governance-kernel.ts`
    - `apps/backend/services/inspection.service.ts`
    - `apps/backend/api/qms/reports/summary.get.ts`
    - `apps/backend/api/qms/vehicle-failure-rate.get.ts`
  - 验证：
    - `pnpm run check:master-data-read-coverage`
    - 结果：`totalMissingHits=0`。
- wave 证据报告（收紧后）：
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T05-21-58-776Z-release-wave1.json`
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T05-21-59-402Z-release-wave2.json`
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T05-22-00-135Z-release-wave3.json`

## 9. 本轮 `team` canonical 样板验收证据（2026-05-22）

- schema 与迁移：
  - `apps/backend/prisma/schema.prisma`
  - `apps/backend/prisma/migrations/20260522000100_add_team_id_governance/migration.sql`
- registry 升级：
  - `apps/backend/utils/master-data-governance-registry.ts`（team: canonical-first + dual-write）
- 读写落地：
  - `apps/backend/services/inspection.service.ts`
  - `apps/backend/api/qms/inspection/requests/index.get.ts`
  - `apps/backend/api/qms/inspection/requests/index.post.ts`
  - `apps/backend/api/qms/public/inspection/requests/index.post.ts`
  - `apps/backend/services/welder.service.ts`
  - `apps/backend/utils/welder.ts`
- 一致性报告：
  - `tmp/master-data-governance/consistency/consistency-report-2026-05-22T04-50-44-062Z-team-canonical.json`
- team evidence 报告：
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T04-50-47-089Z-team-canonical.json`
- release wave 证据：
  - `tmp/master-data-governance/reports/governance-report-2026-05-22T04-51-59-239Z-release-wave1.json`

## 11. Wave4 首批字段验收模板（新增）

验收范围（8 个字段）：

- `productType`
- `productSubtype`
- `failureType`
- `failureCause`
- `taskDispatchType`
- `itpProcessStep`
- `dfmeaCause`
- `qualityLossType`

字段级验收项（每字段都要过）：

1. 主数据来源策略已落地

- 要求：来源按 registry 定义执行（当前为 table source），且 seed 到 dictionary。

2. canonical 设计已确认

- 要求：使用 `dictionaries` 作为 canonical（本批不新建独立 canonical 表）。

3. 迁移列已落地

- 要求（目标列）：
  - `after_sales.productTypeId`
  - `after_sales.productSubtypeId`
  - `after_sales.failureTypeId`
  - `after_sales.failureCauseId`
  - `qms_task_dispatches.typeId`
  - `itp_items.processStepId`
  - `dfmea.causeId`
  - `quality_losses.typeId`

4. 最低门禁通过

- 要求（每字段至少一次）：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=<field> --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-<field>`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-<field>`

5. 并行三 lane 产出齐全

- 要求：
  - Lane-A：schema/registry 证据
  - Lane-B：write/read 覆盖证据
  - Lane-C：evidence/gate 报告
- 任一 lane 缺失 => 字段判定 `未完成`。

量化判定规则：

- `已完成`：
  - 字段 evidence gate 通过；
  - 一致性指标满足 `missing=0`、`invalid=0`、`orphan=0`；
  - 三 lane 证据齐全。
- `未完成`：
  - 任一命令失败；
  - 任一一致性指标非 0；
  - 任一 lane 无证据。

Wave4 本轮目标值（Lane-C 文档阶段）：

- `plannedFields=8`
- `completedFields=0`
- `pendingFields=8`
- 当前结论：`未完成`（仅完成可执行方案与验收模板，尚未进入代码迁移与连库验证）。

## 12. Wave4 四字段（after_sales）实施中量化看板（新增）

- 当前状态：`本批已完成`
- 字段范围（4）：
  - `productType`
  - `productSubtype`
  - `failureType`
  - `failureCause`
- 量化指标：
  - `planned=4`
  - `completed=4`
  - `pending=0`
- gate 通过判定条件（每字段）：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=<field> --seed=true --backfill=true --audit=true --failOnAuditError=true`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-<field>`
  - 一致性结果满足 `missing=0`、`invalid=0`、`orphan=0`
  - 三 lane 证据完整（Lane-A schema/registry，Lane-B write/read，Lane-C evidence/gate）
- 字段完成判定：
  - 全部 gate 条件通过 -> `已完成`
  - 任一条件不满足 -> `未完成`
- 本批结果：
  - 已通过 `db:run-master-data-evidence-gate --fields=productType,productSubtype,failureType,failureCause --seed=true --backfill=true --audit=true --failOnAuditError=true`
  - 已通过 `db:check-master-data-consistency --reportLabel=wave4-after-sales-4fields`
  - 一致性指标：`missing=0`、`invalid=0`、`orphan=0`
