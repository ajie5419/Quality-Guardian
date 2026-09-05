# metrology 模块

## 职责

计量器具全生命周期管理：器具台账、借用/归还、检定计划与到期提醒。

## 文件结构

```
metrology/
├── metrology.service.ts              # 器具台账 CRUD、状态管理
├── borrow/
│   ├── metrology-borrow.service.ts   # 借用流程（CAS 互斥）
│   ├── metrology-borrow-return.service.ts  # 归还流程（CAS 状态机）
│   ├── metrology-borrow-state.ts     # 借用域状态常量与冲突错误
│   └── metrology-borrow-route-error.ts     # 借用路由错误映射
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

## Borrow 状态机（METROLOGY-BORROW-001）

- `measuring_instruments.borrowStatus` 是互斥资源的权威状态源，值域 `AVAILABLE / BORROWED / RETURN_PENDING`（OVERDUE 只属于借用记录的历史流程状态，不写入器具表）。
- `metrology_borrow_records.status` 是历史流程状态：`BORROWED → OVERDUE | RETURN_PENDING → RETURNED`。
- 所有状态转换通过 CAS 写（`updateMany` where 携带期望状态）在同一事务内完成：borrow 需 `borrowStatus = AVAILABLE`，requestReturn 需 record 为 `BORROWED/OVERDUE` 且 instrument 为 `BORROWED`，confirmReturn 需 record 为 `RETURN_PENDING` 且 instrument 为 `RETURN_PENDING`。
- CAS 失败返回 409 Conflict；记录创建失败时整个事务回滚，器具状态不会停留在中间态。
- 不变量：`instrument.borrowStatus !== AVAILABLE` 当且仅当存在唯一 active 借用记录（BORROWED/OVERDUE/RETURN_PENDING）。
- 公共扫码借还入口是受 `METROLOGY_PUBLIC_BORROW_TOKEN` 保护的能力入口；未配置凭证时必须返回 403，不能降级为匿名借还。
