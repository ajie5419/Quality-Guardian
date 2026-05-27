# 责任部门多选

## 日期

2026-05-27

## 需求描述

不合格品和售后问题的"责任部门"字段从单选改为多选，支持同时选择多个责任部门。

## 涉及模块

- inspection（不合格品）
- after-sales（售后问题）

## 数据库变更

- quality_records 新增 responsibleDepartments (TEXT, JSON array)
- after_sales 新增 responsibleDepartments (TEXT, JSON array)

## 改动文件

- apps/backend/utils/department-multi.ts
- apps/backend/prisma/schema.prisma
- apps/backend/prisma/migrations/20260527000100_add_responsible_departments_multi/migration.sql
- apps/backend/modules/inspection/inspection-issue.ts
- apps/backend/modules/inspection/inspection-issue-list.service.ts
- apps/backend/modules/inspection/inspection-issue.test.ts
- apps/backend/modules/after-sales/after-sales-payload.ts
- apps/backend/modules/after-sales/after-sales.service.ts
- apps/backend/modules/after-sales/after-sales-payload.test.ts
- apps/backend/modules/after-sales/after-sales.service.test.ts
- packages/qgs-shared/src/modules/qms/inspection.ts
- packages/qgs-shared/src/modules/qms/after-sales.ts
- apps/web-antd/src/views/qms/inspection/issues/components/IssueEditModal.vue
- apps/web-antd/src/views/qms/inspection/issues/components/IssueDetailDrawer.vue
- apps/web-antd/src/views/qms/inspection/issues/components/issueFormData.ts
- apps/web-antd/src/views/qms/inspection/issues/composables/useIssueForm.ts
- apps/web-antd/src/views/qms/inspection/issues/composables/useIssueGridOptions.ts
- apps/web-antd/src/views/qms/inspection/issues/composables/useIssueDetail.ts
- apps/web-antd/src/views/qms/inspection/issues/index.vue
- apps/web-antd/src/views/qms/inspection/issues/types/index.ts
- apps/web-antd/src/views/qms/after-sales/components/AfterSalesResponsibility.vue
- apps/web-antd/src/views/qms/after-sales/composables/useAfterSalesForm.ts
- apps/web-antd/src/views/qms/after-sales/composables/useAfterSalesGrid.ts
- apps/web-antd/src/views/qms/after-sales/index.vue
- apps/web-antd/src/api/qms/file-center.ts
- apps/web-antd/src/views/qms/after-sales/composables/useAfterSalesChartPreferences.ts
- apps/web-antd/src/views/qms/file-center/index.vue
- scripts/qms-architecture-baseline.txt

## 兼容性

- 旧字段 responsibleDepartment / responsibleDept 保留，写入时取数组第一个值
- 读取时兼容旧数据：单值自动包装为数组
