# supplier-identity 模块

## 职责

supplier-identity 统一维护跨身份域关联。目前支持 `TEAM -> supplier`，业务模块只能通过公开 service 解析，禁止在运行时比较名称建立关联。

## 约束

- `supplierId`、`teamId` 都必须先校验存在、类型和启用状态。
- 同一个 TEAM 只能关联一个未删除供应商。
- 名称仅保存为映射快照，查询、统计和事件使用 ID。
- 名称精确匹配只允许用于受审计的一次性迁移，禁止进入在线写入路径。
