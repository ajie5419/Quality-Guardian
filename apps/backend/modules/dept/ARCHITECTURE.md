# dept 模块

## 职责

部门组织架构 CRUD：部门树维护、名称解析、canonical ID 服务。

## 文件结构

```
dept/
├── dept.service.ts   # 部门 CRUD 与名称解析
├── dept-tree.ts      # 部门树构建
└── dept.module.ts    # 模块声明
```

## 对外接口

- `DeptService` — 部门 CRUD、树查询、名称批量解析

## 依赖

- `~/utils/prisma`
- `~/modules/user` — 数据权限（部门范围）

## 特殊约束

- 部门是 canonical 主数据：业务表只存 `deptId`，展示名由本模块按当前名称解析
- 改名后历史快照保留，失效 ID 保持 unresolved，不按名称猜测
