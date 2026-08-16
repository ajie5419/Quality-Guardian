# 权限码数据一致性盘点报告

> 2026-08-16。对比三方：数据库权限表 `rbac_permissions`（177 码）↔ 菜单表 `menus.authCode`（172 码）↔ 代码声明（@qgs/shared 枚举 103 值 + 模块声明 42 码）。

---

## 一、盘点结论（四类差异）

### 1. 🔴 菜单有码、权限表无行（20 个）——已修复

这些码无法在角色管理界面分配；其中 **物料审批 3 码被后端 authorizeWrite 引用，导致非管理员审批全部 403（本批次迁移引入的功能回归）**。

| 码组 | 数量 | 影响 |
| --- | --- | --- |
| QMS:Inspection:MaterialRequests:List/Approve/Reject | 3 | 🔴 审批功能回归（已修复） |
| QMS:FileCenter:List/Delete/Scan | 3 | 文件中心按钮码不可分配 |
| QMS:Inspection:Dashboard:List、Issues:AssignNcNumber | 2 | 看板/不合格编号不可分配 |
| QMS:Supervision:List | 1 | 监造菜单码（代码枚举原缺 LIST，已补） |
| System:InspectionSettings/MasterDataGovernance/PartMaster/QualityClassification/SupplierIdentity/Architecture | 11 | 系统管理菜单码不可分配（后端走 requireSystemAdmin，影响小） |

**处置**：`scripts/backfill-permission-consistency.ts` 全量同步（菜单码 → 权限表缺失插入 + 全角色分配），本地已执行：20 码 + 140 条角色分配；验证 QC 审批 ✅、越权删除仍 ❌。

### 2. 🟡 权限表有码、菜单无（孤儿码）

- **MENU_10/20/30/40/60 + MENU_menu-\*（7 个占位码）**：历史遗留占位，无菜单、无业务引用——建议清理（软删）
- **新业务码未同步菜单**：QMS:Ai:Generate、QMS:Reports:Create/Edit/Delete、QMS:Supervision:Create/Edit/Delete、QMS:Planning:ITP:Create/Delete/Dispatch/Edit/Export/List/View（12 个）——这些码由回填脚本写入权限表，但**对应菜单按钮尚未声明同值 authCode**，管理员界面分配时会提示"非活跃菜单声明"（validateRolePermissionCodes 拦截）。影响：新码只能靠回填/脚本分配，界面无法操作。**建议**：为 Ai/Reports/Supervision 菜单补按钮声明（ITP 的菜单按钮码与权限码命名不一致，需业务确认后统一）。

### 3. 🟡 代码枚举有、权限表无（8 个死码）

QMS:Inspection:List/Create/Edit/Delete/Export、QMS:AfterSales:Export、QMS:Inspection:Issues:AssignNcNumber（已随修复补齐）、QMS:WorkOrder:Import——定义在 PERMISSION_CODES 但未被菜单/后端使用（或与细分码重复）。建议保留（字典完整性）或清理。

### 4. ✅ 模块声明 vs 菜单表：0 差异

代码模块声明的菜单/按钮 authCode 与 DB 菜单完全一致（启动同步机制工作正常）。

---

## 二、处置结果（2026-08-16 已完成）

| 项 | 处置 | 证据 |
| --- | --- | --- |
| 🔴 菜单有码、权限表无（20 个） | ✅ backfill-permission-consistency.ts（升级版：菜单码 + shared 枚举码双源合并） | 20 码 + 140 条分配；QC 审批 ✅ |
| 🔴 WorkOrder:Import（枚举引用但表/菜单均无） | ✅ 升级版脚本补齐 | 1 码 + 7 条分配；工单导入回归修复 |
| 🟡 MENU\_\* 占位孤儿码（7 个） | ✅ cleanup-menu-placeholder-codes.ts 软删 | 7 码软删 + 5 条关联解除 |
| 🟡 死码（6 个：QMS:Inspection:\*/AfterSales:Export） | ✅ 从 PERMISSION_CODES 删除 | 无业务引用确认 |
| 🟡 Supervision 3 按钮 | ✅ supervision.module.ts 补按钮声明 | 启动同步后界面可分配 |
| 🟡 Ai/Reports/ITP 12 码菜单按钮 | ⏳ 待业务决策（涉及前端导航/既有菜单 merge） | 见行动清单待办 |

## 三、验证快照（修复后）

- rbac_permissions: 177 → 197（含 20 个补缺码）
- 物料审批：QC 角色 ✅ 允许（回归修复）；删除检验记录 ❌ 403（收紧仍生效）
