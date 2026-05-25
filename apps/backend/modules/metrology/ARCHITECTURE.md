# metrology 模块

## 职责

计量器具全生命周期管理：器具台账、借用/归还、检定计划与到期提醒。

## 文件结构

```
metrology/
├── metrology.service.ts              # 器具台账 CRUD、状态管理
├── borrow/
│   └── metrology-borrow.service.ts   # 借用/归还流程
└── calibration-plan/
    └── metrology-calibration-plan.service.ts  # 检定计划与周期管理
```

## 对外接口

- `MetrologyService` — 器具台账
- `MetrologyBorrowService` — 借用管理
- `MetrologyCalibrationPlanService` — 检定计划

## 依赖

- `~/utils/prisma`
- `~/modules/data-scope/` — 数据权限

## 特殊约束

- 借用中的器具不可删除、不可再次借出
- 检定计划到期判定基于 `nextCalibrationDate` 字段
