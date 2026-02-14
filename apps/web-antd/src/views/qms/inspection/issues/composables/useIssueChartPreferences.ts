import { ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import {
  getMergedPreferenceApi,
  saveSystemSettingApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';

export function useIssueChartPreferences() {
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
      console.error('Failed to load preferences', error);
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
      console.error('Failed to save preferences', error);
    }
  }

  async function handleSaveSystemDefault() {
    try {
      await saveSystemSettingApi('qms:inspection_issues:default_charts', {
        showCharts: showCharts.value,
      });
      message.success('已存为系统默认配置');
    } catch (error) {
      console.error('Failed to save system default', error);
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
