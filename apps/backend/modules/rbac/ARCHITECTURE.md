# rbac 模块

## 职责

角色权限控制：角色分配、菜单/按钮授权、权限层级校验。

## 文件结构

```
rbac/
├── rbac.service.ts              # 角色权限主服务
├── rbac-role.service.ts         # 角色管理
├── rbac-menu.service.ts         # 菜单授权
├── rbac-permission-hierarchy.ts # 权限层级校验
├── rbac-config.ts               # 功能开关（如 RbacReadV2）
└── rbac.module.ts               # 模块声明
```

## 对外接口

- `RbacService` — 角色权限主服务
- `isRbacReadV2Enabled` — 读路径 V2 开关
- 权限层级校验（页面/按钮权限）

## 依赖

- `~/utils/prisma`
- `~/utils/module-loader` — 菜单声明聚合

## 特殊约束

- 菜单按钮由 `<module>.module.ts` 声明、`ensureModuleMenus` 落库
- 权限层级：菜单严格校验页面权限，按钮原子保存
