# data-scope 模块

## 职责

数据权限过滤引擎：按部门/本人/团队解析当前用户的查询范围，供各业务模块复用。

## 文件结构

```
data-scope/
├── data-scope.service.ts   # 权限范围解析与过滤逻辑
└── data-scope.module.ts    # 模块声明
```

## 对外接口

- `DataScopeService` — 数据范围解析

## 依赖

- `~/utils/prisma`
- `~/modules/user` — 当前用户信息
- `~/modules/dept` / `~/modules/team` — 组织身份解析

## 特殊约束

- 该模块是框架级能力：范围前缀由 `middleware/4.data-scope.ts` 的路由前缀表驱动
- 业务模块通过 service 复用，禁止自行实现权限过滤
