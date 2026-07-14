# inspection 模块

## 职责

inspection 是 QMS 的检验域模块，覆盖检验记录、检验表模板、不合格品项、报检任务、报检看板与归档同步。

模块内业务逻辑必须留在 `apps/backend/modules/inspection/`；API 层只做认证、参数读取和调用 service。其他模块需要 inspection 能力时，只能通过 `index.ts` 暴露的公开服务访问，不能 import inspection 内部文件。

## 当前结构

- `inspection.service.ts`、`inspection-core.service.ts`：检验记录兼容入口与核心门面。
- `inspection-record-*.service.ts`：检验记录查询、创建、更新、删除、导入导出与同步。
- `inspection-issue-*.service.ts`：不合格品项查询、写入、统计、编号、导入与图表聚合。
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

public 报检禁止：

- 读取受保护的系统字典接口。
- 读取检验员、派工、审计、数据权限相关接口。
- 绕过 create service 的字段校验和工单存在性校验。

## 报检任务重构边界

报检任务后续重构必须保持外部 API 行为兼容，优先处理结构和类型安全，不在同一阶段修改业务语义。

目标拆分：

- 创建：独立 `inspection-request-create.service.ts`，私有创建和 public 创建共享 schema 与核心写入逻辑。
- 查询：独立 `inspection-request-query.service.ts`，保持 DB 分页和关联问题批量查询。
- 派工：独立 `inspection-request-dispatch.service.ts`，保持派工任务与报检任务事务一致。
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
- 检验记录自身事务提交后发布 `inspection_record.changed`；报检关闭在外层事务提交后发布，禁止在未提交事务内刷新供应商快照。

## 供应商身份契约

- `inspections.supplierId` 和 `quality_records.supplierId` 统一指向 `suppliers.id`，名称字段仅保留当时快照。
- 进货检验选择供应商时，前端提交 `supplierId + supplierName`，后端以 ID 校验并重建名称快照。
- 过程检验保存 `teamId + team`，通过 `supplier_identity_links` 解析供应商 ID；禁止比较 TEAM 名称和供应商名称。
- 关联不合格项必须优先继承已提交检验记录返回的 canonical `supplierId/supplierName`，不信任提交前的表单快照。
- `inspection_issue.changed` 携带供应商名称时必须同时携带 `supplierIds`；`inspection_record.changed` 携带供应商或 TEAM 名称时必须同时携带对应的 `supplierIds/teamIds`。
- 存量回填先处理报检任务的 `teamId/supplierId`，再处理 `inspections`，最后以关联检验或唯一精确供应商名称作为确定性证据处理 `quality_records`；模糊、重名、冲突和缺少 TEAM 映射的数据写入 `unresolved_master_data_refs`。

## 供应商身份治理 wave 状态

- 本模块的进货检验、驻厂过程检验和不合格项在线写入已切换到 ID-first：进货写入 `supplierId + supplierName`，过程写入 `teamId + team`，服务端校验 ID 并生成 canonical 名称快照。
- 检验记录变更事件使用 `supplierIds/teamIds` 驱动下游刷新；名称集合只用于日志和诊断，不能单独触发画像或评分刷新。
- 存量回填支持 dry-run/apply、分批和并发条件更新；无效旧 ID 仅在存在关联检验证据或唯一精确名称候选时修复，其他无法解析、冲突或缺少 TEAM 映射的记录进入 `unresolved_master_data_refs`，不静默猜测。
- 本 wave 只覆盖供应商身份相关的检验链路，不代表其他主数据（部门、项目、工序等）已完成全项目 `ID_ONLY` 迁移。未纳入模块必须显式标注治理阶段并单独推进。

跨模块的通用规则见 `docs/master-data-identity-governance.md`。
