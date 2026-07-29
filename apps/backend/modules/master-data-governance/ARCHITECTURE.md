# master-data-governance 模块

## 职责

该模块编排系统设置中的主数据治理清单与人工处置，不直接拥有业务表或审计表。

- 治理清单通过 `supplier-identity` 的公开审计服务读取 `unresolved_master_data_refs`。
- 不合格项分类处置委托 `inspection`，售后产品/缺陷分类处置委托 `after-sales`。
- 业务记录和审计状态必须在同一事务中更新；已被处理或在审计后发生冲突的记录返回并发冲突，不允许覆盖。
- 当前仅开放三类有确定校验边界的分类引用：不合格项缺陷分类、售后产品分类、售后缺陷分类。其他治理项只读展示，等待所属业务模块提供安全处置能力。

## 权限

- `System:MasterDataGovernance:List`：查看治理清单。
- `System:MasterDataGovernance:Edit`：处置支持在线修复的治理项。
