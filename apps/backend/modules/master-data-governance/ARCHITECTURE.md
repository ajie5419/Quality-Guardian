# master-data-governance 模块

## 职责

该模块编排系统设置中的主数据治理清单与人工处置，不直接拥有业务表或审计表。

- 治理清单通过 `supplier-identity` 的公开审计服务读取 `unresolved_master_data_refs`。
- 人工处置通过 `master-data-identity` 的公开服务执行；旧领域 resolver 不再是在线分派路径。
- 队列状态、不可变台账和身份投影必须在同一事务中更新；历史业务记录（包括 ID 与名称快照）不得由处置操作修改。
- Identity references are dispatched by the exact `entityType + fieldName` pair. The registered canonical type is validated before an append-only manual decision is recorded.
- 处置以 `OPEN` 队列 CAS 抢占；已被处理或发生冲突的记录返回并发冲突，不允许覆盖。
- Repeated scanners may refresh unresolved evidence but must not reopen a `RESOLVED` manual decision or erase its resolution fields. Snapshot-to-current-name differences are observations, not invalid identity references.

## 权限

- `System:MasterDataGovernance:List`：查看治理清单。
- `System:MasterDataGovernance:Edit`：处置支持在线修复的治理项。
