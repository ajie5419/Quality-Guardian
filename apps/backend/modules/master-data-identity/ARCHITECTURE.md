# Master Data Identity

本模块拥有历史身份决策台账、当前身份投影和对账运行记录。

- `historical_identity_resolutions` 是追加式账本；更正只能创建 successor，不能修改或删除旧决定。
- `identity_resolution_projection` 是唯一可变读模型，可删除后从账本重建；不得成为历史事实表的替代写入路径。
- `unresolved_master_data_refs` 仍由 `supplier-identity` 拥有，仅作为可变工作清单和证据来源，不参与统计真相。
- 在线人工处置只做队列 CAS、追加 `MANUAL_DECISION` 和更新投影，绝不更新历史事实 ID 或名称快照。
- 对账运行必须固定事实集合 cutoff；WP2 读取该契约双跑，不在用户请求中执行双重聚合。
- `quality_records.defectClassification` 仅是旧治理工作清单字段，不能作为事实表 canonical ID 扫描列。
- 当前投影重建会先删除再批量写入；WP2 在任何报表改读投影前必须引入 generation/staging switch，避免读到重建中的空投影。
