# 权限模块文档（Permission Module）

> 权威文档：2026-08-17 成文，覆盖统一授权框架（Phase 1-2）、门禁、数据范围、缓存、token 治理与运维脚本。
> 关联：docs/authorization-framework-requirement.md（需求单）、docs/permission-consistency-report.md（一致性盘点）、docs/audit-action-plan.md（行动清单）。

---

## 1. 总览：权限体系三层模型

认证层（你是谁）：middleware/3.auth.ts —— token 校验 + 账号状态校验
授权层（你能不能做）：写操作 authorizeWrite / requireSystemAdmin；导出类读接口同 authorize 校验；所有权 assertRecordOwnership
数据权限层（能看哪些数据）：DATA_SCOPE_V2 + data_permission_policies 策略 + DataScopeService.buildScopedWhere（读路径）

| 层 | 职责 | 强制方式 |
| --- | --- | --- |
| 认证 | 是否登录、账号是否有效 | 全局中间件（所有非公开路径） |
| 授权 | 是否有该操作的权限码 | 每个写/导出端点显式调用（B-AUTH1 门禁强制） |
| 数据权限 | 能看/改哪些范围的数据 | 策略表 + 查询注入（默认关闭，开启需业务确认） |

## 2. 权限码字典（Permission Codes）

### 2.1 定义位置（单一来源）

- **@qgs/shared 枚举**（packages/qgs-shared/src/）：
  - PERMISSION_CODES（system/constants.ts）：LossAnalysis / AfterSales / WorkOrder / Planning(BOM/DFMEA/ITP/InspectionForm/ProjectDocs) / Supplier
  - write-permission-codes.ts（domain-modules/qms/）：METROLOGY / KNOWLEDGE / WELDER / REPORTS / TASK_DISPATCH / VEHICLE_COMMISSIONING_WRITE / AI_GENERATION / DASHBOARD / SUPERVISION / INSPECTION_REQUEST / INSPECTION_RECORD / INSPECTION_MATERIAL
  - inspection-issue-contract.ts：INSPECTION_ISSUE_PERMISSION_CODES
- **数据库**：rbac_permissions（码清单）+ rbac_role_permissions（角色↔码）+ menus.authCode（菜单按钮声明）

### 2.2 新增权限码的完整流程（新码一出生就登记）

1. 在 @qgs/shared 对应枚举加成员（值格式 QMS:模块:操作，如 QMS:Metrology:Export）
2. 在模块声明文件（modules/<x>/<x>.module.ts）补菜单/按钮 authCode（让界面可分配）
3. 重建 shared 包：pnpm --dir packages/qgs-shared run build
4. 同步权限表：pnpm --dir apps/backend exec tsx scripts/backfill-permission-consistency.ts（菜单码+枚举码双源合并，幂等）
5. 在角色管理界面按业务分配/收回

> 门禁强制：B-AUTH2 校验前端引用的码必须有声明；B-EC 校验业务错误码必须来自 ErrorCode 枚举。

## 3. 授权校验组件

### 3.1 authorizeWrite（写/导出操作权限）

api 层写端点示例：

```ts
import { authorizeWrite } from '~/modules/rbac';
import { INSPECTION_RECORD_PERMISSION_CODES } from '@qgs/shared';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, INSPECTION_RECORD_PERMISSION_CODES.DELETE);
  // ...业务逻辑
});
```

- 校验顺序：登录态 → 用户权限码（RbacRoleService.getUserPermissionCodes，含 60s 缓存）→ 无码抛 BusinessError(FORBIDDEN, 403)
- super 角色豁免：自动合并全部菜单码（RBAC_SUPER_MERGE_ALL_CODES）
- 返回值：UserSession（可省一次 getCurrentUser）

### 3.2 requireSystemAdmin（系统管理操作）

- 适用：系统管理类端点（用户/角色/菜单/部门/字典/设置/文件/主数据维护）
- 用法：薄转发包装或内联插入（见 api/system/* 先例）

### 3.3 assertRecordOwnership（个人数据所有权）

```ts
import { assertRecordOwnership } from '~/modules/rbac';
assertRecordOwnership({ label: '记录', ownerId: record.createdBy, userId: user.id });
```

- 适用场景：个人数据（如不合格品项：只能改自己创建的）
- 不适用：协作/档案类数据（售后、知识库、工单、检验记录）——这些用数据范围控制，避免误伤

### 3.4 错误响应

- 无权限：HTTP 403 + { code: -1, error: { code: 'FORBIDDEN' }, message: '无权限执行此操作，请联系管理员' }
- 未登录/账号失效：HTTP 401 + UNAUTHORIZED

## 4. 门禁（机器强制，防裸奔）

| 规则 | 位置 | 作用 |
| --- | --- | --- |
| B-AUTH1 | scripts/check-qms-architecture.sh | 写端点（post/put/delete/patch）必须含 authorizeWrite/requireSystemAdmin/assert*Permission/ensurePermission，或属于豁免清单 |
| B-AUTH2 | scripts/check-permission-code-declarations.mjs | 前端引用的权限码必须有声明（shared 枚举或模块菜单 authCode）；后端 authorizeWrite 引用的枚举必须存在 |
| B-EC | scripts/check-qms-source-rules.mjs | BusinessError 错误码必须是 ErrorCode 枚举成员 |

> 豁免清单（刻意公开，无需权限）：/api/qms/public/**（匿名报检）、/api/uploads/**、/api/qms/upload（登录态上传）、/api/system/log/client（客户端日志）、/api/user/preferences/**（用户自服务）、/api/auth/**、/api/telegram/**、/api/webhook/**。

## 5. 数据范围（部门/本人隔离）

### 5.1 现状

- 开关：DATA_SCOPE_V2 环境变量（默认 false，未开启 = 全员可见全库）
- 已接入读路径的模块：after-sales、quality-loss、supplier、work-order、inspection（records 列表 2026-08-17 接入）
- 写路径范围校验：quality-loss（assertDeleteAccess 范式）

### 5.2 开启手册（业务决策前置）

1. 核查策略：pnpm --dir apps/backend exec tsx scripts/audit-data-scope-policies.ts（输出角色×模块矩阵）
2. 配置策略：在角色管理界面对每个角色×模块设置 ALL（全部）/ DEPT（部门）/ SELF（本人）；data_permission_policies 表 @@unique([roleId, module])
3. 开启开关：部署环境设 DATA_SCOPE_V2=true
4. 回归观察：各角色账号登录验证可见范围；未配置策略的角色回退为部门或本人范围，务必先配 super=ALL

### 5.3 策略回退规则

| 策略缺失时 | 回退 |
| --- | --- |
| 用户有部门 | DEPT（本部门） |
| 用户无部门 | SELF（本人） |
| 用户是 super 且未配置 | 同样回退（必须显式配置 ALL） |

## 6. 缓存与失效

- 权限码缓存：getUserPermissionCodes 60s 内存 TTL（clearPermissionCodesCache 导出）；角色权限变更（persistRolePermissions / softDeleteRole）即时失效
- 账号状态缓存：认证中间件 60s 内存 TTL；禁用账号 1 分钟内失去访问
- 多实例部署：权限/账号变更最多 60s 生效延迟（可接受权衡）

## 7. token 与账号状态

- access token：4h 有效期（JWT_ACCESS_SECRET 签发），前端 401 自动刷新
- refresh token：30d（JWT_REFRESH_SECRET），refresh 时校验账号 ACTIVE
- 账号禁用/删除：users.status != ACTIVE → 中间件 1 分钟内拒绝全部 API

## 8. 运维脚本

| 脚本 | 用途 | 幂等 |
| --- | --- | --- |
| backfill-inspection-record-permissions.ts | 检验记录权限码回填（历史兼容） | ✅ |
| backfill-phase2e-permissions.ts | 报表/派发/车辆/AI/看板权限码回填 | ✅ |
| backfill-supervision-permissions.ts | 监造权限码回填 | ✅ |
| backfill-permission-consistency.ts | 菜单码+枚举码全量同步权限表（部署必跑） | ✅ |
| cleanup-menu-placeholder-codes.ts | 清理 MENU_* 占位码（软删） | ✅ |
| audit-data-scope-policies.ts | 数据范围策略矩阵核查 | 只读 |

**部署顺序**：consistency → 各模块回填（幂等可重复）→ cleanup →（如需隔离）策略配置 + DATA_SCOPE_V2。

## 9. 开发指南：新增写端点

1. 在 api 层创建路由（薄层，≤50 行，不 import prisma）
2. 必须调用 authorizeWrite(event, PERMISSION_CODES.X.Y)（或 requireSystemAdmin）——B-AUTH1 门禁强制，否则 CI 拦截
3. 权限码若不存在：先按 2.2 流程登记
4. 业务逻辑放 modules service（≤500 行）
5. 单元测试：mock ~/utils/prisma，用 vi.mock('~/modules/rbac') 或真实调用 authorizeWrite

## 10. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 接口 403 无权限 | 角色无该码 | 角色管理界面分配；或回填脚本 |
| 管理员也 403 | 码不在菜单声明（validateRolePermissionCodes 拦截分配）；或角色权限缓存 60s | 补菜单按钮声明 + 同步；等待/清缓存 |
| 前端按钮不显示 | 前端码未声明（B-AUTH2 应拦截新增） | 按 2.2 流程补声明 |
| 账号禁用后仍可访问 | 60s 缓存窗口 | 等待；或清 accountStatusCache |
| 开启隔离后看不见数据 | 角色策略缺失/回退 | 核查 audit-data-scope-policies.ts 并配置策略 |

## 11. 已知边界（诚实清单）

- 一般列表/统计读接口仍仅登录校验（未逐接口授权；数据可见性由数据范围控制）
- inspection 的 issues/requests 读路径尚未接入数据范围（records 已接入，同类改造进行中）
- 写路径数据范围校验仅 quality-loss 实现（范式已确立，推广待排期）
- Ai/Reports/ITP 部分权限码无对应菜单按钮（界面不可分配，走脚本回填；业务决策是否补按钮）
