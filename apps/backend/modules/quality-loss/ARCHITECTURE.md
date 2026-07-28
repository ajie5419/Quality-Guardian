# quality-loss 模块

## 职责

统一管理手工质量损失，并将手工、内部不合格、外部售后和调试验收四类来源物化到 `quality_loss_index`，供统一列表、统计、图表和导出使用。

## 数据模型

- `quality_losses` 是手工录入的源表。
- `quality_loss_index` 是可重建的统一物化索引，以 `(source, sourcePk)` 唯一定位源记录。
- 手工记录同时保存 `workOrderNumber`、`projectId/projectName`、`partId/partName` 快照；工单号关联 `work_orders`，项目由工单派生，部件必须属于该工单 BOM。
- `quality_loss_index.lossType` 只保存手工损失类型；`partName` 只保存真实部件，不得以损失类型代替。
- `quality_loss_index.projectId/partId/respDeptId` 是项目、部件和责任部门的统计身份；对应名称只是源记录快照。

## 主要边界

- 路由层只处理认证、参数解析和响应映射；创建、更新、删除和数据权限逻辑在本模块 service 中。
- `quality-loss-manual-context.ts` 通过 `work-order` 和 `planning` 模块公开入口解析手工录入上下文，不直接读取其他模块内部表。
- 各源写入后调用 `QualityLossIndexService` 幂等 upsert；部署流程运行 `backfill-quality-loss-index.ts` 重建索引。
- 历史手工记录无法可靠反推工单和部件，回填时保留空值，禁止根据损失类型猜测部件。
- 部门图表按 `respDeptId` 聚合后再解析 canonical 名称。缺失 ID 和无效 ID 保持显式未解析状态，不回退名称归并。

## 对外入口

- `QualityLossService`：列表、统计、图表、更新与删除。
- `QualityLossIndexService`：各业务源的索引 upsert、软删除与回填。
- `resolveManualQualityLossContext`：验证工单、项目和 BOM 部件后返回规范化写入字段。
