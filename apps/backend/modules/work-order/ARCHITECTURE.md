# work-order 模块

## 职责

work-order 负责工单主数据、工单要求、聚合看板和进度查询。工单号是业务唯一键；部件、工序和班组必须使用各自 canonical ID。

## 要求身份契约

- 新建和编辑 V2 要求仅提交 `partId/processId`，服务端按 ID 重建 `partName/processName` 快照。
- 部件选项来自当前工单 BOM 的 `partId`，工序选项来自 `processes.id`。字典 ID、BOM 行 ID 和名称都不能替代主数据 ID。
- `identityContractVersion=2` 禁止客户端同时提交部件/工序名称，避免改名窗口产生 ID/名称冲突。
- 旧页面的 V1 name-only 写入仅用于发布迁移；新页面不得调用，生产流量归零后删除。

Historical requirements keep their original `processName` snapshots. Ordered release maintenance bootstraps an empty process identity space once, then fills only null `processId` values with compare-and-set updates. Existing IDs and names are never overwritten; missing or ambiguous matches are written to `unresolved_master_data_refs`.

## 聚合身份契约

- 要求和检验只在 `partId + processId` 同时相等时匹配。
- 同 ID 改名后合并并显示当前 canonical 名称；不同 ID 即使同名也保持分离。
- 缺失 ID 使用按源记录隔离的内部 `MISSING:<source>:<rowId>` 键，不互相归并、不互相抵扣。
- 无效非空 ID 保留原值并标记 `INVALID`，不回退名称。
- 缺失身份的检验点进入 `unattributedInspectedPoints`，参与数据质量统计，但不误抵扣计划完成量。

## BOM 工序关系

`project_bom_required_processes` 是 BOM 所需工序的正式关系表。旧 `required_processes` JSON 仅作历史快照和兼容展示，不参与在线统计关联。存量回填只在全部名称唯一精确解析时原子写入，禁止部分回填。
