# system-log 模块

## 职责

系统操作日志记录与审计：审计事件写入、查询、telegram-webhook 事件归类。

## 文件结构

```
system-log/
├── system-log.service.ts   # 日志查询主服务
├── audit-log.ts            # 审计日志写入（recordBusinessAuditLog）
└── system-log.module.ts    # 模块声明
```

## 对外接口

- `SystemLogService` — 操作日志查询
- `recordBusinessAuditLog` — 业务审计写入（框架调用）

## 依赖

- `~/utils/prisma`
- `~/utils/module-loader` — 审计动作声明（`<module>.module.ts` 的 `audit`）

## 特殊约束

- 审计由框架按模块声明自动落库，业务 service 禁止手动调用日志服务
- telegram-webhook 等外部事件归类在 `audit-log.ts`
