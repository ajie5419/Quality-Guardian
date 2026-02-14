import { ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import {
  getMergedPreferenceApi,
  saveSystemSettingApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';

export function useAfterSalesChartPreferences() {
  const showCharts = ref(false);
  const customChartsData = ref<any[]>([]);
  const isFirstLoad = ref(true);

  async function loadPreferences() {
    try {
      const pref = await getMergedPreferenceApi(
        'after-sales-charts',
        'qms:after_sales:default_charts',
      );
      if (pref) {
        showCharts.value = !!pref.showCharts;
        customChartsData.value = pref.customCharts || [];
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
      await saveUserPreferenceApi('after-sales-charts', {
        showCharts: showCharts.value,
        customCharts: customChartsData.value,
      });
    } catch (error) {
      console.error('Failed to save preferences', error);
    }
  }

  async function handleSaveSystemDefault() {
    try {
      await saveSystemSettingApi('qms:after_sales:default_charts', {
        showCharts: showCharts.value,
        customCharts: customChartsData.value,
      });
      message.success('已存为系统默认配置');
    } catch (error) {
      console.error('Failed to save system default', error);
      message.error('保存失败');
    }
  }

  watch(
    [showCharts, customChartsData],
    () => {
      if (isFirstLoad.value) return;
      savePreferences();
    },
    { deep: true },
  );

  return {
    showCharts,
    customChartsData,
    loadPreferences,
    handleSaveSystemDefault,
  };
}
