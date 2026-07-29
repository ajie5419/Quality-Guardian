# supplier-identity 模块

## 职责

supplier-identity 统一维护跨身份域关联。目前支持 `TEAM -> supplier`，业务模块只能通过公开 service 解析，禁止在运行时比较名称建立关联。`supplier_identity_links` 是 TEAM 与供应商之间的唯一在线关联事实源。

## 约束

- `supplierId`、`teamId` 都必须先校验存在、类型和启用状态。
- 同一个 TEAM 只能关联一个未删除供应商。
- 名称仅保存为映射快照，查询、统计和事件使用 ID。
- 名称精确匹配只允许用于受审计的一次性迁移，禁止进入在线写入路径。
- 无法解析、无效旧 ID 和证据冲突必须写入 `unresolved_master_data_refs`，不得静默覆盖。
- 迁移工具必须支持有界分批、dry-run/apply、幂等重试和并发写保护。
- 发布时先执行 Prisma migration，随后连续执行身份回填；回填按 TEAM 映射、报检任务 `teamId/supplierId`、`inspections`、`after_sales`、`quality_records` 的顺序处理。
- apply 回填在执行前后比较 `OPEN` unresolved 审计快照：历史已知且证据未变化的记录不重复阻断发布，本次新增或证据变化的 OPEN 记录、主数据歧义和并发写入必须阻断；dry-run 未持久化审计，仍按扫描到的 conflict/unresolved 严格失败。
- 映射新增、修改、删除 API 仅系统管理员可用；当前没有对应的前端管理界面。
- unresolved 审计的分页读取和 compare-and-set 结案由本模块公开服务维护。系统设置中的治理页面只负责编排，业务字段必须由所属模块在同一事务内修复；`OPEN` 记录不得被视为已解决。

## 供应商身份治理 wave 边界

- 本 wave 的在线消费者（检验、质量问题、供应商画像、供应商评分和售后评分）按 canonical ID 查询和聚合；驻厂过程检验通过显式 TEAM 映射获得供应商 ID，不使用名称等值关联。
- 供应商身份回填是显式 maintenance/import 入口，允许使用唯一精确名称证据，但必须产生审计并保留原始证据。它不等同于在线写入兼容。
- 其他业务模块和其他主数据仍按各自治理阶段迁移，不能因为本模块已建立映射表就宣称全项目达到 `ID_ONLY`。

通用主数据规则、字段分类、阶段模型和运行指标见 `docs/master-data-identity-governance.md`。
