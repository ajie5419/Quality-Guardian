import { ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import {
  getMergedPreferenceApi,
  saveSystemSettingApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';
import { useErrorHandler } from '#/hooks/useErrorHandler';

export function useIssueChartPreferences() {
  const { handleApiError } = useErrorHandler();
  const showCharts = ref(false);
  const isFirstLoad = ref(true);

  async function loadPreferences() {
    try {
      const pref = await getMergedPreferenceApi(
        'inspection-issues-charts',
        'qms:inspection_issues:default_charts',
      );
      if (pref) {
        showCharts.value = !!pref.showCharts;
      }
    } catch (error) {
      handleApiError(error, 'Load Issue Chart Preferences');
    } finally {
      isFirstLoad.value = false;
    }
  }

  async function savePreferences() {
    if (isFirstLoad.value) return;
    try {
      await saveUserPreferenceApi('inspection-issues-charts', {
        showCharts: showCharts.value,
      });
    } catch (error) {
      handleApiError(error, 'Save Issue Chart Preferences');
    }
  }

  async function handleSaveSystemDefault() {
    try {
      await saveSystemSettingApi('qms:inspection_issues:default_charts', {
        showCharts: showCharts.value,
      });
      message.success('已存为系统默认配置');
    } catch (error) {
      handleApiError(error, 'Save Issue Chart System Default');
      message.error('保存失败');
    }
  }

  watch(showCharts, () => {
    if (isFirstLoad.value) return;
    savePreferences();
  });

  return {
    showCharts,
    loadPreferences,
    handleSaveSystemDefault,
  };
}
