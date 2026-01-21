import type { Ref } from 'vue';

import type { PlanningTreeNode } from '../types';

import { computed, ref } from 'vue';

import { ProjectStatusEnum } from '#/api/qms/enums';

/**
 * 通用的项目列表管理 Hook
 * 处理分页、过滤、选中状态等逻辑
 */
export function useProjectManager<T extends PlanningTreeNode>(
  allProjects: Ref<T[]>,
  initialTab: string = ProjectStatusEnum.ACTIVE,
) {
  const searchText = ref('');
  const activeTab = ref(initialTab);
  const selectedProjectId = ref<null | string>(null);

  /**
   * 过滤后的项目列表
   */
  const filteredProjects = computed(() => {
    let list = allProjects.value;

    // 状态过滤 (兼容多种状态标识: active/archived, OPEN/COMPLETED, In Progress/Completed)
    const isArchivedTab = activeTab.value === ProjectStatusEnum.ARCHIVED;

    list = list.filter((p) => {
      const s = String(p.status || '').toLowerCase();
      const isArchived = [
        'archived',
        'closed',
        'completed',
        '已完成',
        '已归档',
      ].includes(s);
      return isArchivedTab ? isArchived : !isArchived;
    });

    // 搜索过滤
    if (searchText.value) {
      const lower = searchText.value.toLowerCase();
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(lower) ||
          (p.workOrderNumber &&
            p.workOrderNumber.toLowerCase().includes(lower)),
      );
    }
    return list;
  });

  /**
   * 当前选中的项目对象
   */
  const currentProject = computed(() => {
    return (
      allProjects.value.find((p) => p.id === selectedProjectId.value) || null
    );
  });

  /**
   * 切换标签时重置选中项（仅当当前选中项不在新列表中时）
   */
  function handleTabChange() {
    const isStillVisible = filteredProjects.value.some(
      (p) => p.id === selectedProjectId.value,
    );
    if (!isStillVisible) {
      selectedProjectId.value =
        filteredProjects.value.length > 0
          ? filteredProjects.value[0]?.id || null
          : null;
    }
  }

  return {
    searchText,
    activeTab,
    selectedProjectId,
    filteredProjects,
    currentProject,
    handleTabChange,
  };
}
