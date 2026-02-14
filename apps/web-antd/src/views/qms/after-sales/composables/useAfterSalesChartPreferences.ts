import { ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import {
  getMergedPreferenceApi,
  saveSystemSettingApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import type { ChartConfig } from './useChartAggregation';

export function useAfterSalesChartPreferences() {
  const { handleApiError } = useErrorHandler();
  const showCharts = ref(false);
  const customChartsData = ref<ChartConfig[]>([]);
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
      handleApiError(error, 'Load After Sales Chart Preferences');
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
      handleApiError(error, 'Save After Sales Chart Preferences');
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
      handleApiError(error, 'Save After Sales Chart System Default');
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
