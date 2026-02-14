import type { DeptNode } from '../types';

import type { SystemDeptApi } from '#/api/system/dept';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';

/**
 * 质量问题数据加载 Composable
 */
export function useIssueData() {
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();

  const deptTreeData = ref<DeptNode[]>([]);
  const deptRawData = ref<SystemDeptApi.Dept[]>([]);
  const isLoading = ref(false);

  const toDeptNode = (dept: SystemDeptApi.Dept): DeptNode => ({
    children: (dept.children || []).map((child) => toDeptNode(child)),
    id: String(dept.id),
    label: dept.name,
    value: String(dept.id),
  });

  /**
   * 加载初始数据（部门）
   */
  async function loadInitialData() {
    isLoading.value = true;
    try {
      const deptRes = await getDeptList();

      deptRawData.value = deptRes;
      deptTreeData.value = deptRes.map((dept) => toDeptNode(dept));
    } catch (error) {
      handleApiError(error, 'Load Issue Base Data');
      const errorMessage =
        error instanceof Error ? error.message : t('common.loadDataFailed');
      message.error(errorMessage);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    deptTreeData,
    deptRawData,
    isLoading,
    loadInitialData,
  };
}
