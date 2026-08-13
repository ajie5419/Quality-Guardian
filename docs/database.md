# 数据库文档

## ORM

Prisma 6.2.1，Schema 文件：`apps/backend/prisma/schema.prisma`

## 命名约定

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 表名 | snake_case 复数 | `inspections`、`quality_records`、`after_sales` |
| 列名 | camelCase | `workOrderNumber`、`processName`、`isDeleted` |
| 关联 ID 列 | `{entity}Id` | `processId`、`supplierId`、`templateId` |
| 主键 | `id` String @id @default(cuid()) | 全表统一 |
| 枚举 | snake_case 前缀 + 描述 | `inspection_category`、`inspection_result` |

## 通用字段模式

```prisma
model xxx {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  isDeleted Boolean  @default(false)      // 软删除
  createdBy String?                        // 创建人 userId
}
```

## Migration 规范

1. 创建：`pnpm --dir apps/backend exec prisma migrate dev --name {描述}`
2. 命名格式：`YYYYMMDDHHMMSS_{简短英文描述}`，如 `20250521000000_add_processes_table_and_processId`
3. 部署：`pnpm --dir apps/backend exec prisma migrate deploy`
4. 禁止手动改 migration 文件内容（会破坏 checksum）
5. 禁止在 migration 中写业务数据操作（用单独脚本）

## 发布前置数据任务

Prisma migration 只负责数据库结构。仅当一个幂等数据任务是**当前版本启动前的必要条件**时，才能作为 release maintenance 纳入同步发布路径。

- 任务必须在 `apps/backend/scripts/release-maintenance-manifest.ts` 中显式登记，不能再向 shell 脚本追加永久任务清单。
- 每项任务使用稳定的 `taskKey`、递增的 `revision` 和任务定义的 SHA-256 `checksum`。修改已发布任务必须新增 revision，禁止原地修改完成 revision 的定义或 checksum。
- `release_maintenance_tasks` 是持久化 ledger，按 `(taskKey, revision)` 唯一。checksum 相同且状态为 `COMPLETED` 时跳过；`FAILED` 和租约过期的 `RUNNING` 任务可以在后续发布中重新领取；未过期的 `RUNNING` 任务阻断并发发布。
- ledger 中同一 revision 的 checksum 与 manifest 不一致属于定义漂移，必须 fail-closed 阻断发布，先新增正确 revision 后再发布。
- 历史 remediation、sidecar 初始化或重建、投影重建、窗口/评分对账不得加入 manifest。它们必须以独立命令、审批、dry-run、执行记录和结果核对完成，不能阻塞常规切流。

空 manifest 是合法基线：它表示该版本没有新的启动前置数据任务，绝不意味着需要重放历史回填波次。

## 质量分类主数据

三套二级分类树由 `quality-classification` 模块统一管理：

| Scope | 一级表 | 二级表 | 业务引用 |
| --- | --- | --- | --- |
| `INSPECTION_ISSUE_DEFECT` | `quality_classification_categories` | `quality_classification_subcategories` | `quality_records.defectCategoryId/defectSubcategoryId` |
| `AFTER_SALES_PRODUCT` | 同上 | 同上 | `after_sales.productCategoryId/productSubcategoryId` |
| `AFTER_SALES_DEFECT` | 同上 | 同上 | `after_sales.defectCategoryId/defectSubcategoryId` |

- `code` 是稳定语义标识，创建后不可修改；名称是可在系统设置中调整的显示快照。
- 在线写入必须提交一级、二级 ID，并由模块校验 scope、父子关系、启停和软删除状态。
- migration 只创建结构；`scripts/backfill-quality-classifications.ts --apply` 负责幂等初始化和历史 ID 回填。
- 历史回填只接受一级、二级名称的精确匹配；缺失、无法匹配或已有 ID 冲突写入 `unresolved_master_data_refs`。

## 查询规范

1. 通过 `~/utils/prisma` 导入 client，不要自己实例化
2. 软删除：查询默认加 `where: { isDeleted: false }`
3. 分页：`skip` + `take`，前端传 `page` + `pageSize`
4. 批量写入用事务：`prisma.$transaction([])`
5. 原始 SQL 用 `prisma.$queryRawUnsafe` / `$executeRawUnsafe`，必须参数化防注入

## 历史身份旁路

`master-data-identity` 模块新增的四张表不替代也不修改事实表：

- `historical_identity_resolutions`：追加式身份决策账本；修正通过 `supersedesId` 创建新版本。
- `identity_resolution_projection`：当前解析读模型；可删除并从账本重建。
- `identity_reconciliation_runs`、`identity_reconciliation_metrics`：WP2 影子统计的事实集合 cutoff 与差异指标。

`MANUAL_DECISION` 必须记录 `decidedById`。迁移只能创建结构，旁路初始化必须通过 `scripts/historical-identity-sidecar-bootstrap.ts`，默认 dry-run，只有 `--apply` 才会写旁路表；该脚本不得纳入 release maintenance。
