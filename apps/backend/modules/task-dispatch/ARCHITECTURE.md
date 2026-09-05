# task-dispatch 模块

## 职责

ITP 任务派发与流转：分配、状态推进、归档联动、过滤规则。

## 文件结构

```
task-dispatch/
├── task-dispatch.service.ts   # 任务派发主服务
├── task-dispatch-rules.ts     # 状态机/过滤/分配规则纯函数
├── task-dispatch-state.ts     # 显式状态转换矩阵 + 转换断言（STATE-MACHINE-001）
└── task-dispatch.module.ts    # 模块声明
```

## 对外接口

- `TaskDispatchService` — 任务派发主服务
- `task-dispatch-rules.ts` — 状态归一化、过滤规则、分配候选解析
- `task-dispatch-state.ts` — `TASK_DISPATCH_TRANSITIONS` 转换矩阵与 `assertTaskDispatchTransition` 断言

## 依赖

- `~/utils/prisma`
- `~/modules/inspection` — 报检任务联动
- `~/modules/planning` — ITP
- `~/modules/user` — 检验员/派单人

## 状态机约束（STATE-MACHINE-001）

- 状态推进必须通过显式转换矩阵 `TASK_DISPATCH_TRANSITIONS`： `PENDING → DISPATCHED/PROCESSING/COMPLETED/CANCELLED`、 `DISPATCHED → PROCESSING/COMPLETED/CANCELLED`、 `PROCESSING → COMPLETED/CANCELLED`；`COMPLETED` / `CANCELLED` 为终态。
- 禁止 `status = body.status` 直接覆盖；所有用户驱动的状态推进必须 CAS： `updateAccessible({ where: { id, status: <期望当前状态> }, data: { status } })`， `count !== 1` 时只读复查区分 404（不存在/无权限）与 409（并发状态已变化）。
- 未知状态文本 → 400（fail closed）；非法跳转 → 409，客户端刷新而非静默覆盖。
- 跨模块系统写（报检关单/派单联动）沿用系统维护语义，不视为用户状态推进。

## 特殊约束

- 状态推进有严格契约（`TASK_DISPATCH_STATUS`），V2 写契约 ID-required
- 派单只显示启用的 QC 检验员（前后端一致校验）
- 归档与报检关单联动在同一事务或队列
