# master-data-governance 模块

## 职责

该模块编排系统设置中的主数据治理清单与人工处置，不直接拥有业务表或审计表。

- 治理清单通过 `supplier-identity` 的公开审计服务读取 `unresolved_master_data_refs`。
- 不合格项分类处置委托 `inspection`，售后产品/缺陷分类处置委托 `after-sales`。
- 业务记录和审计状态必须在同一事务中更新；已被处理或在审计后发生冲突的记录返回并发冲突，不允许覆盖。
- Identity references are dispatched by the exact `entityType + fieldName` pair. Inspection records, BOM parts and required processes, supplier identity links, work-order requirements, and work orders expose canonical options and delegate writes to their owning modules.
- Single-value identity resolution updates canonical IDs while preserving historical name snapshots. BOM required processes are the exception: resolution atomically creates the structured process relations and their ordered snapshots.
- All resolution services use raw ID/name compare-and-set conditions and close only audits whose business records were actually updated.
- Repeated scanners may refresh unresolved evidence but must not reopen a `RESOLVED` manual decision or erase its resolution fields. Snapshot-to-current-name differences are observations, not invalid identity references.

## 权限

- `System:MasterDataGovernance:List`：查看治理清单。
- `System:MasterDataGovernance:Edit`：处置支持在线修复的治理项。
