import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getDeptList } from '#/api/system/dept';
import { convertToTreeSelectData } from '#/types';

/**
 * 质量问题数据加载 Composable
 */
export function useIssueData() {
  const { t } = useI18n();

  const deptTreeData = ref<any[]>([]);
  const deptRawData = ref<any[]>([]);
  const isLoading = ref(false);

  /**
   * 加载初始数据（部门）
   */
  async function loadInitialData() {
    isLoading.value = true;
    try {
      const deptRes = await getDeptList();

      deptRawData.value = deptRes as any[];
      deptTreeData.value = convertToTreeSelectData(deptRes) as any[];
    } catch (error) {
      console.error('Failed to load initial data', error);
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
