# 主数据身份治理

## 目标

业务系统中的同一实体必须在写入、查询、统计、权限、事件和历史追溯中使用同一个稳定身份。名称只是可变的展示快照，不得承担关联键职责。

本治理解决以下类问题：

- 改名后历史数据无法归集。
- 同名实体被错误合并。
- 不同身份域共用名称，导致统计漏数或串数。
- 前端显示名称但提交名称，后端无法保证关联真实性。
- 历史数据无法解析时被静默猜测或覆盖。

## 当前落地范围

当前已完成 **supplier identity governance wave** 和 **TEAM identity governance wave**，不是全项目主数据一次性切换。已完成的在线 ID-first 范围包括供应商画像、供应商评分、检验记录、不合格项、售后评分、报检统计及 `TEAM -> supplier` 显式映射；这些消费者不再用名称等值关联或名称 `OR` 回退。TEAM 由独立模块管理稳定 ID、别名、来源和合并审计；改名不改变身份，近似名称不会触发自动合并。

after-sales、supervision 的在线供应商写入也已要求显式 ID，服务端重建名称快照；名称解析只允许存在于审核过的 import/backfill 入口。售后、检验、不合格品、报表、工单看板和供应商评分中已登记的受控维度已改为按 canonical ID 聚合，名称仅在聚合后批量解析。售后、不合格品、工单看板、周报/月报缺陷分布和车辆缺陷排行的 API 类型与前端图表统一携带身份聚合契约，前端不再通过部门树或名称重新判断身份。其他尚未迁移的在线写入、权限和跨表关联仍按各自治理阶段推进，因此当前系统不能宣称全项目已经达到 `ID_ONLY`。

## 核心规则

1. ID 是关联、统计、权限、事件和数据同步的唯一事实源。
2. 名称只用于展示快照、搜索输入和导入原始证据。
3. 治理目标要求受控主数据写入双写 `id + name snapshot`，后端根据 ID 校验实体存在、类型、启用状态和 ID/名称一致性；当前按 wave 推进，未迁移模块必须显式保留退出计划。
4. 在线运行路径禁止通过名称比较建立跨域关联。
5. 历史回填只允许唯一精确匹配；多匹配、无匹配、无效旧 ID 和证据冲突必须进入持久化审计，禁止覆盖。
6. 查询中的名称关键字可以作为搜索入口，但确定实体后的详情、聚合和下游调用必须切换到 ID。

## 字段分类

| 类型 | 示例 | 存储和使用规则 |
| --- | --- | --- |
| 受控主数据 | 供应商、部门、事业部、班组、工序、项目、部件 | 必须存 ID，可同时存名称快照 |
| 跨域身份 | `TEAM -> supplier` | 必须用显式映射表，禁止运行时名称比较 |
| 业务单据号 | 工单号、报告号 | 有独立实体时存主键或外键；单据号作为展示和唯一业务键 |
| 受控字典 | 缺陷类型、检验类型、状态配置 | 数据库存字典 ID 与名称快照；代码分支使用枚举常量 |
| 自由文本 | 问题描述、备注、原因分析 | 保持文本，不创建虚假 ID |
| 外部临时对象 | 尚未纳入主数据的一次性联系人或外部描述 | 显式标识为自由文本域，不允许参与主数据聚合 |

“名称没有 ID”只有两种合法处理：它本质是自由文本，继续存文本；或它本质是受控主数据，先建立主数据实体和管理接口，再允许业务引用。禁止在两种语义之间模糊处理。

## 系统契约

### 前端

- 受控选择器的 `v-model` 保存 ID，选项展示 label 保存名称。
- 提交时发送 ID 和当前名称快照；禁止把名称当成 value。
- 编辑 legacy name-only 数据时，只能在唯一精确匹配时自动恢复 ID；否则要求用户重新选择。
- 名称搜索仅用于缩小选项集，不得直接作为业务提交值。

### API 和 Service

- Zod 契约显式接收 ID 字段，禁止路由层手工猜测。
- Service 根据 ID 加载 canonical 名称，名称快照不信任客户端自由填写。
- 提供 ID 时必须验证存在、身份类型、启用状态和 ID/名称一致性。
- 已达到 `ID-required` 阶段的受控字段，仅提供名称而没有 ID 的在线写入必须被拒绝。导入和迁移入口必须显式白名单并产生审计；仍处于 `DUAL_WRITE/legacy` 的模块不得新增名称依赖，并必须登记退出计划。
- 聚合查询、画像、评分、权限范围和历史项目使用 ID，不使用名称 `OR` 回退。
- 受控统计桶统一返回 `id + name + value + resolutionStatus`；`RESOLVED` 表示 ID 已解析，`MISSING` 表示历史记录缺少 ID，`INVALID` 表示保留了无法解析的非空 ID。
- 下游和前端必须以 `id` 作为身份与渲染键，不得再次按 `name` 合并、映射或猜测归属。

### 事件

- 事件载荷使用 `supplierIds`、`teamIds` 等规范 ID 集合驱动下游刷新。
- 名称集合只能作为日志和过渡期诊断信息。
- 事件携带受控名称时必须同时携带对应 ID；不允许新增 name-only 事件。

## 跨身份域映射

供应商和驻厂队伍属于不同身份域：

- `suppliers.id` 表示供应商档案身份。
- TEAM 字典 ID 表示生产班组或驻厂队伍身份。
- `supplier_identity_links` 保存 `TEAM -> supplier` 的显式关系。

过程检验依旧使用 `teamId`，供应商画像通过映射获得其 TEAM ID 集合后查询。在线查询发现映射缺失时返回无结果，不使用供应商名称与队伍名称比较；存量回填发现缺失映射时写入 `unresolved_master_data_refs`，等待后续人工处置。

### TEAM identity ownership

- TEAM canonical IDs are `dictionaries.id` values owned by `modules/team`; `dictKey` is only the current display name.
- `team_identity_sources` maps stable department, supplier, or manual source IDs to TEAM IDs. Source IDs, not source names, drive reconciliation.
- `team_identity_aliases` preserves canonical and historical names. Aliases support audit and collision detection, not online joins.
- `team_identity_name_keys` prevents normalized near-duplicate names from being created accidentally, but a collision never authorizes an automatic merge.
- Confirmed duplicate IDs are merged only in maintenance mode through an explicit source-ID/target-ID command and one audited transaction.

### Inspection-request statistics

`qms_inspection_requests.category` selects the identity domain and is persisted by all new writes. `INCOMING` aggregates by `supplierId`; `PROCESS` aggregates by `teamId`; inspector statistics aggregate by `inspectorId`. Names are hydrated only after aggregation.

For legacy rows whose category has not yet been backfilled, a TEAM ID takes precedence over a supplier ID because a supplier-linked process TEAM may legitimately carry both IDs. This compatibility rule contains no name comparison. Rows with missing or invalid IDs stay visible as unresolved identity buckets and are never folded into a named entity.

### 图表身份契约

本阶段覆盖的售后、不合格品、工单看板、周报/月报缺陷分布和车辆缺陷排行统一携带共享身份契约。聚合键必须是 canonical ID；名称只在聚合完成后解析，不能作为下游身份输入。工单质保排行同时保留事业部 ID 和项目 ID，禁止先把两个 ID 解析成名称后再去重。月份、状态和索赔值等非主数据维度也携带稳定值 ID，使图表消费者只处理一种契约。

历史数据继续参与检索和总量统计。缺少 canonical ID 的记录进入该身份域的 `MISSING` 桶；无法解析的非空 ID 进入保留原始 ID 的 `INVALID` 桶。两类记录都不能被静默归入某个已命名实体，并继续接受 unresolved 数据审计。

## 存量迁移

迁移按以下顺序执行：

1. 创建结构性约束、映射表和未解析审计表。
2. 以 dry-run 扫描数据，输出总量、可解析数、冲突数、无证据数和样本。
3. 仅对唯一精确匹配执行幂等分批回填。
4. 有效旧 ID 与新证据冲突时保留旧 ID 并审计；无效旧 ID 仅允许由关联记录证据或唯一精确名称候选修复，模糊、重名和冲突记录保持未解析。
5. 回填成功后将对应未解析记录标记为 `RESOLVED`，保留完整追溯。
6. migration 和回填在生产发布中连续自动执行，不依赖人工进容器操作。

当前身份回填覆盖 TEAM 映射、`qms_inspection_requests` 的 `teamId/supplierId`、`inspections`、`after_sales` 和 `quality_records`；其他表按后续治理 wave 单独评估，不得把未迁移表的名称解析结果当作本 wave 完成证明。

## 分阶段退出名称依赖

| 阶段 | 写入 | 读取 | 准入条件 |
| --- | --- | --- | --- |
| `NAME_ONLY` | 历史名称 | 名称 | 仅用于标记未治理存量 |
| `DUAL_WRITE` | ID + 名称快照 | 旧逻辑 | 新写入已无 name-only |
| `ID_FIRST_SHADOW` | ID + 名称快照 | ID 和名称双路对比 | 差异可观测且可追溯 |
| `ID_FIRST` | ID + 名称快照 | ID | 在线统计不再回退名称 |
| `ID_ONLY` | ID，名称由服务端派生或保留快照 | ID | 存量审计清零，所有消费方已切换 |

阶段不能通过时间自动推进，只能通过数据指标和门禁证明推进。

## 自动化门禁

当前代码合并门禁覆盖：

- `B-ID1`：阻断受控选择器新增 `valueKey: 'name'`。
- `B-ID2`：阻断 `after_sales.changed`、`inspection_issue.changed`、`inspection_record.changed` 携带名称但缺少对应 ID 集合。
- `B-ID3`：阻断 `inspections`、`quality_records` 的 Prisma 写入只写 `supplierName` 而不写 `supplierId`。
- `B-ID4`：阻断供应商画像售后查询和评分聚合重新使用名称关联，以及按名称推导 TEAM ID。
- `B-ID5`：阻断未审核业务代码启用 legacy 名称转 ID 模式，只允许精确文件级 import adapter 白名单。
- `B-ID6`：阻断报检统计读取 TEAM、供应商或工序名称快照作为身份输入。
- `B-ID7`：阻断通用字典写入绕过 TEAM guard，并禁止恢复 TEAM 名称 bootstrap。
- `B-ID8`：从主数据注册表自动提取 `table + nameColumn + idColumn`，阻断 Prisma 统计对受控名称字段执行 `groupBy`，要求按 canonical ID 聚合后再解析展示名称。

门禁尚未覆盖动态字段映射、通用 `Map` 键、模糊关联、名称驱动业务分支以及所有在线写入。后续 wave 必须同步扩大 AST 规则和测试，不能仅修改文档就宣称某个模块已达到 `ID-required`。

白名单必须指向完整文件路径和具体语句，附带原因标记。禁止用目录级或通配符白名单回避治理。

## 运行指标

每个受控字段必须可计算：

- `missing_id_count`：有名称、无 ID 的未删除记录数。
- `invalid_id_count`：ID 无法指向有效 canonical 实体的记录数。
- `name_mismatch_count`：ID 有效但名称快照不一致的记录数。
- `unresolved_count`：尚未人工处理的迁移审计数。
- `identity_conflict_count`：多证据指向不同实体的记录数。

发布后要核对已纳入 ID-required wave 的新写入 `missing_id_count = 0`，存量指标只能下降，不能增长。未迁移模块必须单独报告其 legacy 存量和退出进度。

## 已知运行限制与未完成治理面

- 当前 `EventEmitter` 是单进程、fire-and-forget 实现；监听器失败只记录日志，没有持久化队列、跨实例广播或自动重试。扩容前必须替换为可靠事件机制。
- `unresolved_master_data_refs` 已用于回填审计，但当前没有人工处置 API/UI；`OPEN` 记录不得被视为已解决。
- `supplier_identity_links` 已有系统管理员 API，但尚无前端管理界面；TEAM 映射维护仍依赖受控管理入口。
- 以上限制不影响本 wave 的 ID 查询契约，但必须在发布验收和后续治理计划中显式跟踪。
