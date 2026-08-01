# Master Data Identity

本模块拥有历史身份决策台账、当前身份投影和对账运行记录。

- `historical_identity_resolutions` 是追加式账本；更正只能创建 successor，不能修改或删除旧决定。
- `identity_resolution_projection` 是唯一可变读模型，可删除后从账本重建；不得成为历史事实表的替代写入路径。
- `unresolved_master_data_refs` 仍由 `supplier-identity` 拥有，仅作为可变工作清单和证据来源，不参与统计真相。
- 在线人工处置只做队列 CAS、追加 `MANUAL_DECISION` 和更新投影，绝不更新历史事实 ID 或名称快照。
- 对账运行必须固定事实集合 cutoff；WP2 读取该契约双跑，不在用户请求中执行双重聚合。
- `quality_records.defectClassification` 仅是旧治理工作清单字段，不能作为事实表 canonical ID 扫描列。
- 投影重建先在独立 generation 中完成，再以 singleton pointer 的 CAS 一次发布；消费者通过 pointer 读取完整 generation，构建失败或期间有新决策时保留旧 generation。
- `pass_rate_process_identity_projection` 是合格率的领域窄投影。它与通用 generation 一起完成构建后才允许发布，避免报表在通用旁路表上重复 join 或看到半成品。
- 合格率开关开启后仍须先验证 projection 新鲜度：数据库只执行边界、计数和 `LIMIT 1` 的不匹配存在性查询，不把投影加载到应用内存；新增、编辑或软删除检验事实时一律回退 legacy，等待下一次 generation 重建。
