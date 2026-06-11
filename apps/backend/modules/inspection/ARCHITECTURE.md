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
