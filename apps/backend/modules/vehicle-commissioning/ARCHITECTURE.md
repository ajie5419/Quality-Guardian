# vehicle-commissioning 模块

## 职责

调试验收问题台账、质量损失联动、日报和验收报表。

## 问题台账删除边界

- 问题台账只允许具备 `QMS:VehicleCommissioning:Delete` 权限的用户删除。
- 删除采用软删除，查询必须带 `isDeleted: false`；历史日报中的问题快照不回写、不清理。
- 删除时同步软删除附件引用和质量损失索引，并写入模块声明的删除审计日志。
- API 只负责认证、参数解析和调用公开 service；删除业务逻辑集中在 `vehicle-commissioning-delete.service.ts`。

## 约束

- 所有业务写入必须保留责任部门的受控字段写入路径。
- 新增问题操作必须通过模块权限和审计声明管理。
- 新增业务逻辑必须附带单元测试，查询软删除记录必须显式过滤 `isDeleted: false`。
