# dashboard 模块

## 职责

质量驾驶舱数据聚合与看板指标：提供工作台、大屏所需的聚合查询与目标指标写入。

## 文件结构

```
dashboard/
├── dashboard.service.ts          # 指标聚合主服务
├── dashboard-route.service.ts    # 路由级聚合查询
└── dashboard-targets.post.service.ts  # 看板目标指标写入
```

## 对外接口

- `DashboardService` — 驾驶舱指标聚合

## 依赖

- `~/utils/prisma`
- 各业务模块 service（只读聚合，禁止直查其他模块内部表）

## 特殊约束

- 聚合在 DB 层完成（groupBy/aggregate），禁止全表加载到内存
- 跨模块数据只走对方模块 service（架构门禁强制）
