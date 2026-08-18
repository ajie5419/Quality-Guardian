# work-order-requirement 模块

## 职责

工单质量要求汇总：关联工单的质检附件与条目管理、汇总查询。

## 文件结构

```
work-order-requirement/
├── work-order-requirement.service.ts   # 工单要求主服务
├── work-order-requirement-summary.ts   # 汇总查询
└── work-order-requirement.module.ts    # 模块声明
```

## 对外接口

- `WorkOrderRequirementService` — 工单质量要求 CRUD 与汇总

## 依赖

- `~/utils/prisma`
- `~/modules/work-order` — 工单
- `~/modules/file-storage` — 质检附件

## 特殊约束

- 确认/撤销操作带 RBAC 与数据范围校验；QC 可确认
- 软删除联动质量损失索引与审计
- 写契约引用 canonical ID（工单/工序身份 V2）
