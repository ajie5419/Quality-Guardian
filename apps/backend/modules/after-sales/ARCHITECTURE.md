# after-sales 模块

## 职责

售后质量问题、索赔处理、售后质量损失和供应商售后评分数据。

## 供应商身份契约

- `after_sales.supplierBrandId` 指向 `suppliers.id`，`supplierBrand` 只保存写入时的名称快照。
- 供应商画像、评分聚合、历史查询和变更后的快照刷新必须按 `supplierBrandId` 查询；名称不能作为统计或关联键。
- 新增、更新、删除和批量导入完成后发布 `after_sales.changed`，载荷必须包含受影响的 `supplierIds`；名称集合只能用于诊断。
- 更新供应商关联时，事件必须同时携带旧 ID 和新 ID；删除时必须携带被删除记录的旧 ID，避免旧供应商快照残留。

## 存量回填与审计

- 售后身份回填支持 dry-run/apply、有界分批、幂等重试和并发条件更新。
- 只有唯一精确名称证据可以生成候选 ID；无匹配、多匹配、无效旧 ID 或证据冲突写入 `unresolved_master_data_refs`，不得覆盖原始证据。
- 生产发布必须在 Prisma migration 后连续执行身份回填，不依赖人工进入容器补跑。

## 当前治理阶段

- 售后评分读取和事件刷新已是 ID-first，供应商画像的售后查询已按 `supplierBrandId` 精确过滤。
- 普通 after-sales 在线写入已要求显式 `supplierBrandId`，服务端按 ID 重建 canonical `supplierBrand`；只有审核过的批量导入和存量回填允许唯一精确名称解析。
- 通用列表仍允许名称关键字搜索，这是搜索能力，不得作为供应商画像、评分或跨表关联回退。
- unresolved 记录当前只有回填审计写入能力，没有人工处置 API/UI；事件总线为单进程异步实现，失败仅记录日志且无持久化重试。

通用规则见 `docs/master-data-identity-governance.md`。
