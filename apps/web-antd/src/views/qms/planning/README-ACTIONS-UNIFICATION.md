# 质量策划组件按钮统一方案

## 概述

为统一 BOM、DFMEA、ITP、Project Docs 四个组件的编辑、删除、归档按钮，创建了以下通用组件和 Hook。

## 核心文件

### 1. `useProjectActions` Hook
**位置**: `apps/web-antd/src/views/qms/planning/composables/useProjectActions.ts`

提供统一的项目操作逻辑：
- `handleArchiveProject()` - 归档/恢复项目
- `handleDeleteProject()` - 删除项目
- `handleDeleteItem()` - 删除项目明细
- `isArchivedStatus()` - 判断是否归档状态

**使用示例**:
```typescript
const {
  handleArchiveProject,
  handleDeleteProject,
  handleDeleteItem,
  isArchivedStatus,
} = useProjectActions<QmsPlanningApi.BomTreeNode>({
  archiveProject: async (id, status) => {
    await updateBomProject(id, { status });
  },
  deleteItem: async (id) => {
    await deleteBom(id);
  },
  deleteProject: async (id) => {
    await deleteBomProject(id);
  },
  loadData,
  resetSelectionOnDelete: true,
  selectedProjectId,
});
```

### 2. `ProjectActionButtons` 组件
**位置**: `apps/web-antd/src/views/qms/planning/components/ProjectActionButtons.vue`

统一的操作按钮下拉菜单，支持：
- 权限控制（通过 `authPrefix`）
- 状态判断（归档/活跃）
- 自定义可见性（`canEdit`、`canDelete`、`canArchive`）

**使用示例**:
```vue
<ProjectActionButtons
  :project="project"
  auth-prefix="QMS:Planning:BOM"
  @archive="handleArchiveProject"
  @delete="handleDeleteProject"
  @edit="openEditModal"
/>
```

## 迁移步骤

### 步骤 1: 引入 Hook

将原有的 `handleArchive`、`handleDeleteProject`、`handleDeleteItem` 函数替换为 `useProjectActions` Hook：

```typescript
// 引入
import { useProjectActions } from '../composables/useProjectActions';

// 原有代码
/*
async function handleArchive(proj: QmsPlanningApi.BomTreeNode) {
  // ... 大量重复代码
}

async function handleDeleteItem(row: QmsPlanningApi.BomTreeNode) {
  // ... 大量重复代码
}
*/

// 替换为
const {
  handleArchiveProject,
  handleDeleteProject,
  handleDeleteItem,
} = useProjectActions<QmsPlanningApi.BomTreeNode>({
  archiveProject: async (id, status) => {
    await updateYourProject(id, { status });
  },
  deleteItem: async (id, projectId) => {
    await deleteYourItem(id, projectId);
  },
  deleteProject: async (id) => {
    await deleteYourProject(id);
  },
  loadData,
  selectedProjectId,
});
```

### 步骤 2: 更新模板调用

将模板中的函数调用更新为新的 Hook 函数：

```vue
<!-- 侧边栏归档 -->
<PlanningSidebar
  @archive="(proj) => handleArchiveProject(proj)"
  @delete="(proj) => handleDeleteProject(proj)"
>

<!-- 列表删除 -->
<Table>
  <template #bodyCell="{ record }">
    <Space>
      <Tooltip :title="t('common.edit')">
        <Button @click="openEditModal(record)">编辑</Button>
      </Tooltip>
      <Tooltip :title="t('common.delete')">
        <Button danger @click="handleDeleteItem(record)">删除</Button>
      </Tooltip>
    </Space>
  </template>
</Table>
```

### 步骤 3: 可选 - 使用统一按钮组件

在需要的地方使用 `ProjectActionButtons` 组件：

```vue
<script setup>
import ProjectActionButtons from '../components/ProjectActionButtons.vue';
</script>

<template>
  <Space>
    <!-- 其他操作 -->
    <ProjectActionButtons
      :project="currentProject"
      auth-prefix="QMS:Planning:BOM"
      @archive="handleArchiveProject"
      @delete="handleDeleteProject"
      @edit="openEditModal"
    />
  </Space>
</template>
```

## 各组件迁移状态

| 组件 | 状态 | 说明 |
|------|------|------|
| BOM | ✅ 已更新 | 已引入 `useProjectActions` Hook |
| DFMEA | ✅ 已更新 | 已引入 `useProjectActions` Hook |
| ITP | ✅ 已更新 | 已引入 `useProjectActions` Hook |
| Project Docs | ✅ 已更新 | 已引入 `useProjectActions` Hook |

## 优势

### 代码复用
- 消除了约 80% 的重复代码
- 统一的操作逻辑和错误处理

### 一致性
- 所有组件的确认对话框样式一致
- 操作反馈（消息提示）一致
- 权限检查逻辑一致

### 可维护性
- 修改一处即可影响所有组件
- 易于添加新功能（如批量操作）

### 类型安全
- 完整的 TypeScript 类型支持
- 泛型支持不同组件的节点类型

## 后续优化建议

1. **批量操作**: 在 `useProjectActions` 中添加批量归档/删除功能
2. **操作历史**: 记录操作历史，支持撤销功能
3. **权限细化**: 支持更细粒度的权限控制（如只能归档不能删除）
4. **国际化**: 完善所有提示信息的国际化
