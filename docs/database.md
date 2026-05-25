# 数据库文档

## ORM

Prisma 6.2.1，Schema 文件：`apps/backend/prisma/schema.prisma`

## 命名约定

| 对象 | 规则 | 示例 |
|------|------|------|
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

## 查询规范

1. 通过 `~/utils/prisma` 导入 client，不要自己实例化
2. 软删除：查询默认加 `where: { isDeleted: false }`
3. 分页：`skip` + `take`，前端传 `page` + `pageSize`
4. 批量写入用事务：`prisma.$transaction([])`
5. 原始 SQL 用 `prisma.$queryRawUnsafe` / `$executeRawUnsafe`，必须参数化防注入
