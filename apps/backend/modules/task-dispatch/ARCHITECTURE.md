# task-dispatch 模块

## 职责

ITP 任务派发与流转：分配、状态推进、归档联动、过滤规则。

## 文件结构

```
task-dispatch/
├── task-dispatch.service.ts   # 任务派发主服务
├── task-dispatch-rules.ts     # 状态机/过滤/分配规则纯函数
└── task-dispatch.module.ts    # 模块声明
```

## 对外接口

- `TaskDispatchService` — 任务派发主服务
- `task-dispatch-rules.ts` — 状态归一化、过滤规则、分配候选解析

## 依赖

- `~/utils/prisma`
- `~/modules/inspection` — 报检任务联动
- `~/modules/planning` — ITP
- `~/modules/user` — 检验员/派单人

## 特殊约束

- 状态推进有严格契约（`TASK_DISPATCH_STATUS`），V2 写契约 ID-required
- 派单只显示启用的 QC 检验员（前后端一致校验）
- 归档与报检关单联动在同一事务或队列
