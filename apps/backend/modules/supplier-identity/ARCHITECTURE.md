# supplier-identity 模块

## 职责

supplier-identity 统一维护跨身份域关联。目前支持 `TEAM -> supplier`，业务模块只能通过公开 service 解析，禁止在运行时比较名称建立关联。`supplier_identity_links` 是 TEAM 与供应商之间的唯一在线关联事实源。

## 约束

- `supplierId`、`teamId` 都必须先校验存在、类型和启用状态。
- 同一个 TEAM 只能关联一个未删除供应商。
- 名称仅保存为映射快照，查询、统计和事件使用 ID。
- 在线 resolver、管理候选和 PROCESS 写入只能消费有效 `supplier_identity_links`；无 link 返回未解析，禁止以 TEAM 与供应商同名建立关联。
- 新增或变更 link 必须证明 TEAM 有匹配供应商 ID 的有效 `SUPPLIER` 来源，目标必须是 `Outsourcing + IN_HOUSE_TEAM/EXTERNAL_SERVICE`。`DEPARTMENT` 或 `MANUAL` TEAM 不能因名称相同被视为外部队伍。
- 无法解析、无效旧 ID 和证据冲突必须写入 `unresolved_master_data_refs`，不得静默覆盖。
- 迁移工具必须支持有界分批、dry-run/apply、幂等重试和并发写保护。
- 发布时先执行 Prisma migration，随后连续执行身份回填；回填按 TEAM 映射、报检任务 `teamId/supplierId`、`inspections`、`after_sales`、`quality_records` 的顺序处理。
- 回填只读取显式有效 link，绝不按名称 bootstrap、恢复或建立 link；历史进货名称的唯一精确证据仅限于该历史字段本身的受审计回填。
- apply 与 dry-run 都必须因任何 unresolved、conflict 或并发 CAS 失败而阻断。OPEN 审计不能成为后续发布的豁免基线。
- 当 TEAM 的 `DEPARTMENT` 来源能确定其为内部 BU 时，回填以 CAS 清空 PROCESS inspection/quality record 的错误 supplier 字段，并记录已解决的审计证据；缺少这种确定性证据的数据继续 unresolved。
- 身份回填只补 canonical ID，不得用当前供应商或 TEAM 名称覆盖历史事实快照；重复扫描不得将人工 `RESOLVED` 裁决改回 `OPEN`。
- 映射列表、选项、新增、修改和删除 API 仅系统管理员可用；系统设置中的管理页只用 canonical ID 提交，不通过名称推断关联。
- unresolved 审计的分页读取和 compare-and-set 结案由本模块公开服务维护。系统设置中的治理页面只负责编排，业务字段必须由所属模块在同一事务内修复；`OPEN` 记录不得被视为已解决。
- Link 删除或实质变更会在同一事务内检查现存 PROCESS 事实；存在事实时必须先走受审计 backfill，禁止在线改变历史归属。

## 供应商身份治理 wave 边界

- 本 wave 的在线消费者（检验、质量问题、供应商画像、供应商评分和售后评分）按 canonical ID 查询和聚合；驻厂过程检验通过显式 TEAM 映射获得供应商 ID，不使用名称等值关联。
- 供应商身份回填是显式 maintenance/import 入口；仅历史字段自身的唯一精确名称证据允许用于该字段回填，不能推导或创建 TEAM link。它不等同于在线写入兼容。
- 其他业务模块和其他主数据仍按各自治理阶段迁移，不能因为本模块已建立映射表就宣称全项目达到 `ID_ONLY`。

通用主数据规则、字段分类、阶段模型和运行指标见 `docs/master-data-identity-governance.md`。
