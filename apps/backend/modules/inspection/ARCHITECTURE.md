# inspection 模块

## 职责

QMS 核心模块，覆盖检验全生命周期：检验策划（ITP）、检验表模板、检验记录、报检任务。

## 文件结构

- `inspection.service.ts`（2250 行）— 主 service，包含检验记录 CRUD、模板绑定、统计

## 对外接口

```typescript
export const InspectionService = {
  findAll(params, userinfo)      // 检验记录列表（分页、筛选）
  findOne(id)                    // 检验记录详情
  create(data, userinfo)         // 创建检验记录
  update(id, data, userinfo)     // 更新检验记录
  remove(id)                     // 软删除
  getTemplateItems(templateId)   // 获取检验表项目
  bindTemplate(inspectionId, templateId)  // 绑定检验表
}
```

## 调用方

- `api/qms/inspection/` — 所有检验相关路由
- `modules/dashboard/` — 合格率统计
- `modules/report/` — 质量报表

## 依赖

- `~/utils/prisma` — 数据库
- `~/core/master-data/` — processName/processId 双写
- `~/modules/data-scope/` — 数据权限过滤

## 特殊约束

- 检验记录创建时必须通过 master-data governance 写入 processId
- 检验表模板绑定后不可更换（只能解绑重绑）
- findAll 的 where 条件构建复杂，涉及团队权限、状态过滤、关键字搜索
