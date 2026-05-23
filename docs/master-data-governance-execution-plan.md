# 主数据全字段统一治理执行蓝图

## 1. 目标定义（可验收）

### 1.1 统一入口目标

- 新增字段接入仅改注册配置，不再手工改多处 API / Service / SQL。
- 主数据字段治理入口统一到注册中心与执行器，禁止散点接入。

### 1.2 统一链路目标

- 全字段统一走 `schema -> seed -> backfill -> dual-write -> read-canonical -> audit`。
- 运行入口统一为治理执行器与证据门禁脚本，不允许手工拼装临时流程。

### 1.3 生产安全目标

- 发布前必须通过固定门禁：`check:type`、`lint`、`check:qms-arch`、一致性检查、证据门禁、覆盖率门禁。
- 任一门禁失败直接阻断上线（fail-closed）。

### 1.4 数据质量目标

- 本次迁移范围内字段达到：`empty_id=0`、`invalid_id=0`、`orphan=0`。
- 指标必须可追踪并具备趋势门禁，禁止“本次通过、下次回退”。

### 1.5 成本目标

- 任意新字段可以一键生成并执行迁移/回填/审计/测试骨架。
- 字段接入标准化，避免重复劳动与人工漏改。

## 2. 阶段计划与出口标准

### Phase 0：基线盘点与冻结

产出：

- 字段清单、主数据来源清单、现有读写路径清单、风险清单。
- 冻结“新增手写 name/id 映射”入口。

执行命令：

- `pnpm --dir apps/backend run db:export-master-data-baseline`
- `pnpm run check:master-data-governance`

出口标准：

- 已确认首批治理字段与波次顺序。
- baseline 文件落盘且可追溯：`tmp/master-data-governance/baseline.json`。
- 冻结门禁启用并纳入 CI。

### Phase A：治理内核落地（一次建设）

产出：

- 字段注册中心（字段无关）。
- 统一执行器（字段无关）。
- 主数据适配器（dictionary/table/derived）。

执行命令：

- `pnpm --dir apps/backend run db:check-master-data-registry-policy`
- `pnpm --dir apps/backend run db:check-master-data-helper-alignment`
- `pnpm --dir apps/backend run db:run-master-data-governance --wave=0 --seed=true --backfill=true --audit=true`

出口标准：

- `processName` 作为金标字段跑通全链路。
- 设计可复用于任意字段，不绑定 process 专项逻辑。

### Phase B：自动化脚手架落地

产出：

- 迁移 SQL 模板、回填脚本模板、测试骨架、审计模板。
- 模板可执行性验证脚本。

执行命令：

- `pnpm --dir apps/backend run db:generate-governance-template --field=team`
- `pnpm --dir apps/backend run db:verify-governance-template --fields=team --executeFields=team`
- `pnpm run check:master-data-template`

出口标准：

- 任意新字段可通过配置生成完整产物。
- 生成产物可直接执行并输出证据。

### Phase C：波次迁移上线

波次顺序：

- Wave1：`team`、`defectType`、`defectSubtype`、`division`
- Wave2：`supplierName`、`responsibleDepartment`
- Wave3：`projectName`、`partName`（先冻结派生规则）

每字段固定 6 步：

- `schema add id column`
- `seed canonical`
- `backfill canonical id`
- `dual-write`
- `read canonical`
- `audit clean`

执行命令（示例）：

- `pnpm --dir apps/backend run db:run-master-data-evidence-gate --wave=1 --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave1`
- `pnpm --dir apps/backend run db:audit-master-data-write-coverage --waves=1`

出口标准：

- 每波字段完成 6 步闭环。
- 每波字段均有 `seed/backfill/audit` 证据与门禁结果。
- wave 证据门禁统一按 `seed=true/backfill=true/audit=true` 执行；name-only 字段由执行器按策略自动 skip，但必须保留审计证据。

### Phase D：收口与硬化

产出：

- 全量审计修复报告。
- 默认 `id` 优先读策略与兼容层策略文档。
- 回退预案（读写切换分离、异常自动回退）。

执行命令：

- `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=release`
- `pnpm --dir apps/backend run db:check-master-data-metrics-trend`
- `pnpm run check:master-data-release-gate`

出口标准：

- 治理链路成为唯一主路径。
- 旧散点逻辑下线或封口。

## 3. 发布强制门禁（阻断式）

- `pnpm run check:type`
- `pnpm run lint`
- `pnpm run check:qms-arch`
- `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=release`
- `pnpm --dir apps/backend run db:check-master-data-metrics-trend`
- `pnpm --dir apps/backend run db:run-master-data-evidence-gate --wave=0 --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=release-wave0`
- `pnpm --dir apps/backend run db:run-master-data-evidence-gate --wave=1 --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=release-wave1`
- `pnpm --dir apps/backend run db:run-master-data-evidence-gate --wave=2 --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=release-wave2`
- `pnpm --dir apps/backend run db:run-master-data-evidence-gate --wave=3 --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=release-wave3`
- `pnpm --dir apps/backend run db:check-master-data-derived-rules`
- `pnpm --dir apps/backend run db:audit-master-data-write-coverage`
- `pnpm run check:master-data-governance`
- `pnpm run check:master-data-registry-policy`
- `pnpm run check:master-data-helper-alignment`
- `pnpm run check:master-data-generic-write-entry`
- `pnpm run check:master-data-template`

## 4. 治理规则（防回退）

- 禁止新增手写 `name/id` 映射，必须通过治理 helper 或治理内核。
- 业务写路径禁止使用专用 `buildGovernedXxxWriteFields`，统一使用 `buildGovernedWriteFieldsForTable(targetTable, input)`。
- 禁止绕过注册中心新增字段行为。
- 回填脚本必须满足：幂等、可断点续跑、可分批执行。
- 每个字段迁移必须附带：测试、审计报告、执行证据。
- Wave3 派生字段必须先冻结规则，再允许迁移执行。

## 5. 最终验收标准

- 新字段接入只改注册配置。
- 脚手架一键产出并可执行迁移/回填/审计/测试。
- 发布可量化展示一致性指标持续下降并按迁移范围归零。
- 线上默认读路径为 canonical id，兼容层仅用于受控回退。

## 6. 当前状态（2026-05-22）

- Phase A：已完成（内核、注册中心、策略门禁已落地）。
- Phase B：已完成（模板生成、模板验证、执行证据链已落地）。
- Phase C：推进中（`team` canonical 样板已完成并通过 release gate，剩余字段按波次继续 canonical 化）。
- Phase D：推进中（可连库环境已完成一次全量一致性归零与 release gate 验证，后续需在目标环境重复验收）。

## 7. 回填执行规范（统一执行器）

- 统一使用 `run-master-data-governance.ts` 的 backfill 参数，不再单字段手工拼 SQL 回填脚本：
- `--backfillBatchSize=<N>`：单批扫描上限（默认 1000）。
- `--backfillMaxRowsPerTable=<N>`：单次运行每表最多扫描行数，控制发布窗口时长。
- `--backfillMaxBatchesPerTable=<N>`：单次运行每表最多批次数，便于灰度推进。
- `--backfillStartAfterIdsByTable='<json>'`：按表游标断点续跑，例如：
  - `{"quality_records":"<lastScannedId>"}`。
- backfill 结果统一产出每表进度：`batches/scannedRows/updatedRows/unresolvedRows/nextStartAfterId/exhausted`，用于后续续跑与审计证据。

## 8. read-canonical 覆盖门禁（新增）

- 新增读路径覆盖审计命令：`pnpm --dir apps/backend run db:audit-master-data-read-coverage`。
- root 门禁命令：`pnpm run check:master-data-read-coverage`。
- 发布总闸已纳入 `master-data-read-coverage` 步骤，CI 新增独立 job。
- 检查范围由注册中心驱动，仅对 `readStrategy=canonical-first` 字段执行覆盖审计。
- 规则：命中目标字段读取（`findMany/findFirst/findUnique/aggregate/groupBy`）时，必须存在 canonical read 上下文（如 `resolveCanonical*`、`buildProcessNameWhere`），否则阻断。

## 9. 脚手架门禁口径（更新）

- `check:master-data-template` 默认执行“全字段模板生成验证”：
  - `pnpm --dir apps/backend run db:verify-governance-template --all=true --executeCanonical=false`
- 含义：
  - 全字段必须可生成迁移/seed/backfill/audit/test/README 模板；
  - 在当前无稳定连库保障时，默认只实执行 name-only 字段模板，避免把数据库可达性误判为脚手架能力缺失。
- 连库环境下可追加：
  - `--executeCanonical=true` 或显式 `--executeFields=processName,...`，补齐 canonical 字段模板实执行证据。

## 10. 写入治理口径（更新）

- `master-data-governance-write` helper 映射以注册中心为唯一真源：
  - helper 内部按注册中心 `targets` 自动派生 `table -> field mapping`；
  - helper 只负责标准化输入，不再维护独立硬编码字段清单。
- 新增通用入口：
  - `buildGovernedWriteFieldsForTable(targetTable, input)`
  - 允许新接入点按表名直接走统一治理 helper，减少“先补专用 helper 再接入”的改造步骤。
- helper 规格派生策略：
  - `listGovernedWriteHelperSpecs()` 按注册中心自动派生表清单与字段映射；
  - 仅对已有专用 helper 的表保留固定 helperName，其他表使用通用命名占位，避免新增目标表时必须先改规格清单代码。
- helper 表面门禁（防回退）：
  - 新增 `check:master-data-helper-surface`，限制 `master-data-governance-write.ts` 的专用 `buildGovernedXxxWriteFields` 导出集合；
  - 新需求默认通过 `buildGovernedWriteFieldsForTable(targetTable, input)` 接入，禁止继续扩张专用 helper 面。
- 结果：
  - 新增字段在“同表同名列”场景下，只改注册中心即可自动进入写治理链路；
  - `check:master-data-helper-alignment` 与 `check:master-data-write-coverage` 持续兜底，防止派生遗漏或写入绕过。

补充进展与变更明细见：

- `docs/master-data-governance-phase-progress.md`

## 11. Wave4 首批字段并行落地（Lane-C 可执行产物）

Wave4 首批字段固定为 8 个：

- `productType`
- `productSubtype`
- `failureType`
- `failureCause`
- `taskDispatchType`
- `itpProcessStep`
- `dfmeaCause`
- `qualityLossType`

### 11.1 字段级执行清单（统一模板）

1. `productType`

- 主数据来源策略：`table(after_sales.productType)`，先用历史值 seed 到 dictionary（建议 `dictType=product_type`）后切 canonical。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`after_sales.productTypeId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=productType --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-productType`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-productType`

2. `productSubtype`

- 主数据来源策略：`table(after_sales.productSubtype)`，先 seed dictionary（建议 `dictType=product_subtype`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`after_sales.productSubtypeId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=productSubtype --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-productSubtype`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-productSubtype`

3. `failureType`

- 主数据来源策略：`table(after_sales.failureType)`，先 seed dictionary（建议 `dictType=failure_type`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`after_sales.failureTypeId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=failureType --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-failureType`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-failureType`

4. `failureCause`

- 主数据来源策略：`table(after_sales.failureCause)`，先 seed dictionary（建议 `dictType=failure_cause`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`after_sales.failureCauseId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=failureCause --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-failureCause`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-failureCause`

5. `taskDispatchType`

- 主数据来源策略：`table(qms_task_dispatches.type)`，seed dictionary（建议 `dictType=task_dispatch_type`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`qms_task_dispatches.typeId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=taskDispatchType --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-taskDispatchType`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-taskDispatchType`

6. `itpProcessStep`

- 主数据来源策略：`table(itp_items.processStep)`（以 registry 实际列为准），seed dictionary（建议 `dictType=itp_process_step`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`itp_items.processStepId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=itpProcessStep --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-itpProcessStep`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-itpProcessStep`

7. `dfmeaCause`

- 主数据来源策略：`table(dfmea.cause)`（以 registry 实际列为准），seed dictionary（建议 `dictType=dfmea_cause`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`dfmea.causeId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=dfmeaCause --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-dfmeaCause`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-dfmeaCause`

8. `qualityLossType`

- 主数据来源策略：`table(quality_losses.type)`，seed dictionary（建议 `dictType=quality_loss_type`）。
- 是否需要新 canonical 表：否（使用 `dictionaries`）。
- 预计迁移列：`quality_losses.typeId`（nullable）。
- 最低门禁验证命令：
  - `pnpm --dir apps/backend run db:run-master-data-evidence-gate --fields=qualityLossType --seed=true --backfill=true --audit=true --failOnAuditError=true --reportLabel=wave4-qualityLossType`
  - `pnpm --dir apps/backend run db:check-master-data-consistency --reportLabel=wave4-qualityLossType`

### 11.2 并行执行计划模板（3 Lane 同步推进）

固定分工模板：

- Lane-A（Schema/Registry Lane）
  - 任务：`id` 列迁移、registry canonical 配置、source/canonical relation 定义。
  - 产出：迁移 SQL、registry 变更、字段迁移说明。
- Lane-B（Write/Read Lane）
  - 任务：写入双写接入、读取 canonical-first 接入、兼容回退分支保留。
  - 产出：写路径接入清单、读路径接入清单、覆盖审计零缺口。
- Lane-C（Evidence/Gate Lane）
  - 任务：模板生成、seed/backfill/audit 证据、release gate 验证与汇总。
  - 产出：evidence 报告、consistency 报告、阶段进度文档更新。

同步节拍模板：

1. Day-N `10:00`：三条 lane 锁定字段批次与文件所有权（禁止重叠改同文件）。
2. Day-N `14:00`：Lane-A 完成 schema/registry，Lane-B 才可合并 read/write 改造。
3. Day-N `18:00`：Lane-C 统一执行 evidence gate 与 consistency，输出量化结论。

阻断规则：

- 任一字段未通过 `seed/backfill/audit`，该字段不得进入 merge。
- 任一字段 `missing/invalid/orphan > 0`，该字段状态标记为 `未完成`。
- 三 lane 任一产出缺失（schema、read/write、evidence）即整体 `未完成`。
