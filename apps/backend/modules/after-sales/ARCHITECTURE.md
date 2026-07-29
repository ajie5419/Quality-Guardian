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
- 发布维护会在质量损失索引重建前回填 `projectId` 和 `respDeptId`。责任部门兼容识别历史名称快照及误存到名称列的有效部门 ID；同名歧义和无匹配只写 unresolved 审计，不做猜测。

## 当前治理阶段

- 售后评分读取和事件刷新已是 ID-first，供应商画像的售后查询已按 `supplierBrandId` 精确过滤。
- 普通 after-sales 在线写入已要求显式 `supplierBrandId`，服务端按 ID 重建 canonical `supplierBrand`；只有审核过的批量导入和存量回填允许唯一精确名称解析。
- 通用列表仍允许名称关键字搜索，这是搜索能力，不得作为供应商画像、评分或跨表关联回退。
- 售后产品分类和缺陷分类的 unresolved 记录可在系统治理页面人工处置；服务端校验启用的父子分类，并在同一事务内更新售后快照和审计状态。其他 unresolved 类型仍只读展示。事件总线为单进程异步实现，失败仅记录日志且无持久化重试。

## 质量分类契约

- `productCategoryId`、`productSubcategoryId` 引用 `AFTER_SALES_PRODUCT` 分类域；`productType`、`productSubtype` 仅保存历史名称快照。
- `defectCategoryId`、`defectSubcategoryId` 引用 `AFTER_SALES_DEFECT` 分类域；`defectType`、`defectSubtype` 仅保存历史名称快照。
- 在线新增和更新必须提交四个分类 ID。服务端通过 `QualityClassificationService` 校验两组父子关系，并按 ID 重建全部名称快照，不信任调用方提交的名称。
- 批量导入允许用一级、二级名称解析，但只能在对应分类域和父分类内精确匹配；缺失或父子不匹配时返回逐行错误。
- 列表筛选、统计和动态图表使用新的分类域 ID。车辆故障率以产品分类 ID 为主路径，并对尚未回填 ID 的存量记录精确匹配已声明的历史产品名称快照；旧 `productTypeId`、`productSubtypeId`、`defectTypeId`、`defectSubtypeId` 仅为迁移兼容保留，不再作为新统计的身份键。

通用规则见 `docs/master-data-identity-governance.md`。
