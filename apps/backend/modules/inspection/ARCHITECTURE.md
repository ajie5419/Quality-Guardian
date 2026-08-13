# inspection 模块

## 职责

inspection 是 QMS 的检验域模块，覆盖检验记录、检验表模板、不合格品项、报检任务、报检看板与归档同步。

模块内业务逻辑必须留在 `apps/backend/modules/inspection/`；API 层只做认证、参数读取和调用 service。其他模块需要 inspection 能力时，只能通过 `index.ts` 暴露的公开服务访问，不能 import inspection 内部文件。

## 当前结构

- `inspection.service.ts`、`inspection-core.service.ts`：检验记录兼容入口与核心门面。
- `inspection-record-*.service.ts`：检验记录查询、创建、更新、删除、导入导出与同步。
- `inspection-issue-*.service.ts`：不合格品项查询、写入、统计、编号、导入与图表聚合。
- `inspection-*-resolution.service.ts`：主数据治理处置，按审计原始值批量回填分类、规范责任部门或报检工序，并使用字段级并发校验。
- `inspection-template-*.service.ts`：检验模板与模板绑定。
- `inspection-archive-*.service.ts`：归档任务与归档同步。
- `inspection-request*.service.ts`：报检任务创建、列表、派工、关闭、统计与实时事件。
- `inspection.module.ts`：菜单、权限、数据范围与审计模板声明。

## 报检任务状态机

报检任务使用 `qms_inspection_requests.status` 表示主流程状态。

| 状态 | 含义 | 进入方式 | 允许的后续动作 |
| --- | --- | --- | --- |
| `SUBMITTED` | 已提交，等待派工 | 后台新增或 public 扫码报检 | 派工、删除 |
| `DISPATCHED` | 已派发给检验员 | 调度人派工 | 完成检验、重新派工 |
| `INSPECTING` | 检验中或检验失败待处理 | 完成检验结果为 `FAIL` 时保持未关闭 | 复检/再次完成检验 |
| `CLOSED` | 检验完成并关闭 | 完成检验结果为 `PASS` | 不允许重复派工或重复关闭 |
| `CANCELLED` | 已取消 | 预留状态 | 不参与当前主流程 |

关闭规则：

- `PASS`：创建或更新检验记录，任务状态改为 `CLOSED`，派工任务改为 `COMPLETED`。
- `FAIL`：创建或关联不合格品项，任务状态改为 `INSPECTING`，派工任务改为 `PROCESSING`，等待问题处理或复检。

### 关闭不合格项责任归属契约

报检任务关闭并创建不合格项时，责任身份必须显式提交，禁止再根据责任单位名称猜测字段归属：

- `responsibilityType=INTERNAL_DEPARTMENT`：提交 `responsibleDepartmentId`，落库 `responsibleDepartmentId + responsibleDepartment`，供应商字段必须为空。
- `responsibilityType=SUPPLIER`：提交 `responsibleDepartmentId + supplierId`，责任部门和供应商分别按 canonical ID 重建名称；用于进货检验供应商。
- `responsibilityType=OUTSOURCING_UNIT`：提交 `responsibleDepartmentId + supplierId`，责任部门和外部单位分别按 canonical ID 重建名称；用于 TEAM 已映射供应商或明确外协任务。
- 报检列表和详情返回解析后的 `issueResponsibility`，前端以该显式类型决定供应商控件和提交字段；“名称包含生产/外协”等关键词不得改写责任类型。
- 后端以显式类型和 canonical ID 为权威；仅当它们与报检任务已有 `supplierId` 或 TEAM→Supplier 映射直接冲突时拒绝关闭。
- 旧客户端未提交显式类型时，只允许使用报检工序做兼容推断；旧 `responsibleDepartment` 仅在值本身是有效 canonical 部门 ID 时兼容，供应商名称不得回退写入责任部门。

历史回填只处理存在 `qms_inspection_requests.linkedIssueId` 的关联不合格项，并只接受报检 `supplierId`、经有效 source 验证的 TEAM→Supplier 映射或关联检验 `supplierId` 作为确定性外部身份。普通 `PROCESS + teamId` 不等于外协；证据冲突、缺失或已有其他有效责任部门时保留原值并写入 OPEN 审计。已由 `DEPARTMENT` source 确定为内部 BU 的 PROCESS inspection、报检和关联质量记录以 supplier ID 与名称双字段 CAS 清空错误供应商事实；回填支持 dry-run/apply、keyset 分批和幂等重试，并在生产 deploy 的 migration 与供应商身份回填之后自动执行。

### Unified inspection issue creation and corrupted responsibility remediation

All online inspection issue entry points use the same transaction-aware creation service. A standalone issue creates its own transaction, while inspection-request close passes its outer transaction to the service. The service owns canonical responsibility validation, issue persistence, quality-loss indexing, supplier-score refresh tasks, and server-side NC number allocation. Clients do not pre-generate or submit NC numbers; the server allocates the number inside the write transaction.

The canonical online responsibility payload is exactly one `responsibilityType` plus one `responsibleDepartmentId`, and `supplierId` only when the type is `SUPPLIER` or `OUTSOURCING_UNIT`. `INTERNAL_DEPARTMENT` must not carry a supplier identity. The service resolves department and supplier display snapshots from active canonical IDs. `quality_records.responsibilityType` is persisted for the explicit fact. Creation never writes `responsibleDepartments`; a canonical edit writes a single-element snapshot only to keep legacy response consistency.

Inspection-request query returns `issueResponsibility` with the canonical responsible-department ID. During close, the server compares the submitted responsibility type and department ID with the request's canonical responsibility context and rejects any mismatch before writing the inspection issue.

### Persisted request responsibility and legacy backfill

`qms_inspection_requests` persists the nullable compatibility fields `responsibilityType`, `responsibleDepartmentId`, and `responsibleDepartment`; its existing `supplierId` is the external supplier fact. New requests must persist one complete canonical responsibility. An internal PROCESS request selects its canonical responsibility department directly; `teamId` is optional execution context and, when present, must match that department. `SUPPLIER` and `OUTSOURCING_UNIT` require a supplier ID and policy-approved department ID, with no team. A new PROCESS external request therefore uses its persisted supplier ID directly and does not require a `TEAM -> supplier_identity_links` mapping. The former internal-option resolver incorrectly required a TEAM mapping before returning a department, hiding valid departments such as structure and machining BUs; responsibility department resolution is now independent of TEAM resolution.

The public and authenticated responsibility-options endpoints, Web entry form, and WeApp entry form all submit the same ID-only three-state contract. Query, inspection-record creation, and statistics consume the persisted external supplier fact rather than reconstructing it from a TEAM or a name; `INCOMING.supplierName` is only a legacy TEAM fallback, never new responsibility evidence. Generated `inspections` persist the same responsibility triad, and statistics expose a responsibility-department domain in addition to their supplier domain. The close flow locks the request's complete canonical context before it writes an issue. Legacy close may establish the canonical responsibility department directly within its transaction; any partially populated triad is rejected, because it cannot be safely mixed with legacy inference. The standalone request-responsibility resolver prevents a dependency cycle between request context resolution and inspection-record creation.

The entry forms must never lock an `INCOMING` request to `SUPPLIER`. Both `INCOMING` and `PROCESS` entry pages present the same three-state responsibility selector; the responsible department is a selectable canonical department for every responsibility type, and external types additionally require a canonical supplier whose category matches the responsibility type. After the full option list has loaded, the clients may preselect `生产 OBU` for `OUTSOURCING_UNIT` or `采购部` for `SUPPLIER` only when exactly one canonical option label matches; this presentation default is resolved to its canonical ID, never hard-codes an ID, never replaces a same-type manual choice, and leaves the field empty for missing or ambiguous options. The responsibility-options endpoint returns the full active department set for external types instead of name-filtered policy departments, so duplicate department names fail closed without making a valid manual submission impossible. `teamId` remains optional `PROCESS` execution context only: the entry forms and submission validation never require it, and the server validates it against the chosen department when present.

Release maintenance backfills only incomplete legacy request responsibility facts. It first validates a complete persisted triad against active canonical master data; only rows without that triad use the existing legacy request resolver, whose TEAM-to-supplier path remains link-gated compatibility. The backfill never derives a supplier from a matching name. Missing, invalid, or conflicting evidence leaves the request unchanged and creates an OPEN `unresolved_master_data_refs` audit without overwriting an existing manual resolution. It uses ID keyset batches, field-level CAS updates, and writes successful audit resolution with the request update in one transaction. Missing legacy evidence is an auditable nullable-compatibility outcome: apply still scans every row, performs every deterministic update, and persists the OPEN audit instead of skipping the maintenance. It does not block this release wave because legacy reads remain available and closing an issue requires explicit validated canonical responsibility. Invalid evidence, conflicting evidence, lost CAS updates, or a `--max-batches`-truncated scan block release maintenance; new writes remain fail-closed. Release runs it after request category/process-option maintenance and before inspection-issue responsibility maintenance.

The request and inspection responsibility migrations use bounded MySQL index names. The inspection migration adds the same nullable responsibility triad and a compact `(responsibilityType, responsibleDepartmentId)` index to `inspections`, so requests and generated records preserve the same canonical fact.

### P3009 migration 恢复

旧请求责任 migration 的索引名曾长达 70 字符，超过 MySQL 64 字符限制并触发 MySQL 1059 / Prisma P3009。恢复 wrapper 只能识别该精确 migration：数据库既无 `20260811000000` 所属 `qms_inspection_requests` 的四个目标字段及短索引时才调用 Prisma `resolve --rolled-back`；只有该请求表的四字段与短索引完整时才调用 `resolve --applied`；任一 partial 或 drift 状态均 fail-closed 阻断。随后才允许 `migrate deploy` 应用或确认 `20260811000001` 的 `inspections` 变更。GitHub deploy、OSS deploy 和 local container up/dev 必须复用此 wrapper。恢复前后均先只读核对 migration steps、InnoDB、字段与索引；wrapper 本身不得直接执行未经该状态机授权的数据库修复。

The prior desktop TreeSelect strict-check value was stringified before persistence, which produced the literal `[object Object]` in `responsibleDepartment` or its legacy JSON array. Release maintenance remediates only rows containing that exact sentinel. It prefers a valid active `responsibleDepartmentId`; otherwise it accepts only unique canonical responsibility evidence from the linked inspection request or inspection record. PROCESS external evidence must satisfy the active TEAM + PROCESS-policy supplier + exact active SUPPLIER source + active link intersection; a TEAM with both DEPARTMENT and SUPPLIER sources is a conflict, never an external candidate. External candidates carry both supplier ID and name and persist them with the responsibility fields under the same field-level compare-and-set transaction; internal resolutions clear both supplier fields. Incomplete or conflicting supplier facts remain OPEN for external resolutions rather than being overwritten; a valid canonical internal department remains the authoritative evidence for clearing a stale supplier snapshot. The maintenance command supports dry-run/apply, ID keyset batches, field-level compare-and-set writes, and OPEN unresolved-master-data audits for missing or conflicting evidence. Both dry-run and apply fail when any unresolved, conflict, or concurrent CAS change remains. The command runs after the existing inspection issue responsibility backfill and after the migration that adds `responsibilityType`.

多工单进货报检：

- 报检任务主表 `qms_inspection_requests.workOrderNumber` 保留第一个工单号，用于兼容现有列表、筛选、通知和工单聚合入口。
- 多选工单写入 `qms_inspection_request_work_orders` 明细表，保持一条报检任务可关联多个工单。
- 关闭报检任务生成检验记录时，按明细工单逐条创建 `inspections`，每条检验记录仍只绑定一个 `workOrderNumber`。
- `qms_inspection_request_inspections` 记录报检任务与生成检验记录的多对多映射，主表 `inspectionId` 继续保存第一条检验记录以兼容旧页面。

附件落库边界：

- `qms_inspection_requests.attachments` 是报检入口上传的自检记录，关闭报检并生成或关联检验记录时，写入 `inspections.selfCheckDocuments`，并登记 `file_references(bizType=inspection_record, fieldName=selfCheckDocuments)`。
- `qms_inspection_requests.closeAttachments` 是检验员关闭报检时上传的关闭附件，写入 `inspections.documents`，并登记 `file_references(bizType=inspection_record, fieldName=documents)`。
- 自检记录和关闭附件不得混用同一个字段；检验记录详情展示必须分别读取 `selfCheckDocuments` 与 `documents`。

## Public 报检入口边界

匿名扫码报检只能访问 `apps/backend/api/qms/public/inspection/requests/` 下的 public API。public 页面不得调用需要登录态的字典、工单、用户或模块内部接口。

public 报检允许：

- 查询允许公开展示的工单、工序和班组选项。
- 提交报检任务。

Process options preserve these source boundaries:

- `processes` is the only global process identity source. Process names are mutable display values and never act as IDs.
- `inspection_request_process_options` independently controls which active processes appear for `PROCESS` and `INCOMING` requests. The same process may appear in either, both, or neither category.
- `work_order_requirements` records work-order quality requirements. It never filters or authorizes process options in either request-entry mode.
- An empty configured selection returns an empty list. Public queries and submission validation never fall back to hard-coded names, legacy dictionaries, or work-order requirements.
- V2 submission validates the exact `category + processId` option before creating a request, so a hidden or disabled option cannot be submitted by constructing a request manually.

Release maintenance must establish process identities before creating missing request-option rows. The option bootstrap is additive and idempotent: it creates two rows per existing process with `createMany + skipDuplicates`, preserving administrator choices on repeated deployments. Historical business rows and their display snapshots are not rewritten.

public 报检禁止：

- 读取受保护的系统字典接口。
- 读取检验员、派工、审计、数据权限相关接口。
- 绕过 create service 的字段校验和工单存在性校验。

## Inspection-request category and statistics identity

Every new inspection request persists an explicit category:

- `INCOMING` uses `supplierId` as its statistics identity.
- `PROCESS` uses `teamId` as its statistics identity.

`processName` is a mutable display snapshot and must not decide the online statistics domain. Release maintenance backfills legacy null categories after supplier and TEAM reconciliation. For the compatibility-only null-category path, `teamId` takes precedence because a process TEAM may also have a linked `supplierId`; a supplier ID is treated as incoming only when no TEAM ID exists. The historical incoming process name is used only by the one-time backfill when both IDs are absent.

Request statistics aggregate by `teamId`, `supplierId`, and `inspectorId`. Canonical names are batch-resolved after aggregation and never participate in a map key, join, or category branch. Therefore:

- snapshots with different names and the same ID form one row under the current canonical name;
- different IDs remain separate even when their current names are equal;
- missing IDs form one explicit unresolved bucket per identity domain;
- invalid non-empty IDs remain distinguishable as unresolved rows containing the original ID.

Dashboard API contracts and Vue row keys carry the same stable IDs. A display name must never be used as a component key for TEAM, supplier, or inspector rankings.

## 报检创建身份契约

- V2 创建契约显式提交 `category + partId + processId`；客户端不提交部件和工序名称作为业务事实。
- 后端按 ID 校验启用的 `master_parts/processes` 记录，并重建 `partName/processName` 快照；无效 ID 直接拒绝。
- `inspection_request_process_options` defines whether a process is available in each request category; Web and WeChat clients submit the selected stable `processId` with the explicit category.
- BOM 部件选项返回 `project_boms.partId`；BOM 行 `id` 只是 BOM 记录主键，不是部件身份。
- 工序选项返回 `processes.id`；工序字典 `dictionaries.id` 与工序主数据不是同一 ID 空间。
- Web 和微信小程序均使用 V2。V1 旧路由只返回 `410 INSPECTION_REQUEST_V2_REQUIRED`，不得再进入创建服务或接受 name-only 写入。

### Incoming material request workflow

- V2 `INCOMING` submissions use `partId` or `requestedPartName` exclusively according to the administrator-controlled incoming material input setting. `PROCESS` submissions always require an active canonical `partId`.
- A submission with `requestedPartName` first performs an exact lookup of active, non-deleted material master data. A unique match links the request directly and creates no material application; only an unmatched or ambiguous name creates the `qms_inspection_material_requests` application in the same transaction.
- Pending applications are reviewed only by authenticated users with material approval permission. Review controls are available in both the back-office material request queue and the dispatch workflow; public request entry does not expose review status or review controls.
- Approval uses either `LINK_EXISTING` or `CREATE`. Both operations go through `PartMasterService` in the same database transaction, then backfill the canonical `partId/partName` and mark the application `APPROVED`.
- Dispatch always verifies that `partId` is present and no pending material application exists. Approval publishes the normal pending-dispatch notification only after the canonical identity has been committed.
- Rejection records the reviewer remark, marks the application `REJECTED`, and cancels the linked inspection request. A rejected request cannot be dispatched.

`inspections.partId/partName` 是检验记录的正式部件身份。`level1Component/level2Component/materialName` 是历史业务快照，不得再用于部件关联或聚合。回填优先继承关联报检的确定 ID；冲突、重名、无匹配进入 `unresolved_master_data_refs`，不猜测。回填只补 ID，已有历史名称快照不被覆盖。

项目身份在发布维护中先执行空表限定的 canonical bootstrap，再对 `inspections` 和 `quality_records` 等报表及质量损失源表执行唯一精确回填。已存在项目主数据后不再从历史快照创建新身份；无法匹配的项目名称保留原值并进入 unresolved 审计。

## 报检任务重构边界

报检任务后续重构必须保持外部 API 行为兼容，优先处理结构和类型安全，不在同一阶段修改业务语义。

目标拆分：

- 创建：独立 `inspection-request-create.service.ts`，私有创建和 public 创建共享 schema 与核心写入逻辑。
- 查询：独立 `inspection-request-query.service.ts`，保持 DB 分页和关联问题批量查询。
- 派工：独立 `inspection-request-dispatch.service.ts`，保持派工任务与报检任务事务一致。
- 派工候选人只能是角色值为 `QC` 的启用用户；列表查询和派工写入都必须校验该角色。
- 删除：独立 `inspection-request-delete.service.ts`，保持软删除、派工取消、附件引用删除和审计。
- 关闭：`inspection-request-close.service.ts` 保留工作流编排，检验记录、不合格品、附件同步和提交后副作用拆为窄职责 helper/service。

## 约束

- 所有用户输入必须经过 zod schema 校验。
- route 文件不得直接 import prisma，不得包含业务逻辑。
- service 文件不得超过 500 行，单个方法应保持短小；复杂工作流必须拆分。
- 查询软删除表时必须包含 `isDeleted: false`。
- 新增业务逻辑必须附带单元测试。
- public API 只能暴露匿名提交所需的最小数据。
- 供应商画像和评分读取检验记录时必须消费共享 `resolveSupplierInspectionPolicy()`：普通供应商和外部加工按 `supplierId`，驻厂队伍和外部服务按 `teamId` 及 `supplier_identity_links` 映射，两个身份域不得用 OR 混查；工程问题统一按 `quality_records.supplierId` 读取。名称字段仅是展示快照或搜索条件，不能作为在线关联回退。
- 供应商历史项目直接以报检任务主表的 `supplierId/teamId` 归属，合并主工单和多工单明细后按工单去重、服务端分页；不得要求任务已关联检验记录。
- 检验记录、不合格项和质量损失的写事务必须在同一 Prisma 事务内按 `supplierId/teamId` 追加持久化评分刷新任务；禁止提交后事件、名称驱动刷新或在事务外直接改快照。

## 供应商身份契约

- `inspections.supplierId` 和 `quality_records.supplierId` 统一指向 `suppliers.id`，名称字段仅保留当时快照。
- 进货检验选择供应商时，前端提交 `supplierId + supplierName`，后端以 ID 校验并重建名称快照。
- 过程检验保存 `teamId + team`，并只通过有效 `supplier_identity_links` 解析供应商 ID；调用方 `supplierId/supplierName` 不得注入 PROCESS 事实。内部 BU 没有有效 link 时两个 supplier 字段必须为空，禁止比较 TEAM 名称和供应商名称。
- 关联不合格项必须优先继承已提交检验记录返回的 canonical `supplierId/supplierName`，不信任提交前的表单快照。
- 评分刷新任务只携带规范 `supplierId`；过程检验先在源事务内通过 `teamId -> supplierId` 显式映射生成任务。
- 存量回填先处理报检任务的 `teamId/supplierId`，再处理 `inspections`，最后以关联检验或唯一精确供应商名称作为确定性证据处理 `quality_records`；模糊、重名、冲突和缺少 TEAM 映射的数据写入 `unresolved_master_data_refs`。

## 供应商身份治理 wave 状态

- 本模块的进货检验、驻厂过程检验和不合格项在线写入已切换到 ID-first：进货写入 `supplierId + supplierName`，过程写入 `teamId + team`，服务端校验 ID 并生成 canonical 名称快照。
- 检验记录、不合格项及其质量损失变更在源事务内写入持久化指标任务；名称集合不参与派发、画像或评分。
- 存量回填支持 dry-run/apply、分批和并发条件更新；内部 `DEPARTMENT` TEAM 的错误 PROCESS supplier 字段可被审计并清空，其他无效旧 ID 仅在存在关联检验证据或该历史字段的唯一精确名称候选时修复。无法解析、冲突或缺少 TEAM 映射的记录进入 `unresolved_master_data_refs`，不静默猜测，也不会因已存在 OPEN 审计而放行发布。
- 本 wave 只覆盖供应商身份相关的检验链路，不代表其他主数据（部门、项目、工序等）已完成全项目 `ID_ONLY` 迁移。未纳入模块必须显式标注治理阶段并单独推进。

跨模块的通用规则见 `docs/master-data-identity-governance.md`。
