import { onMounted, ref } from 'vue';

import { requestClient } from '#/api/request';

const CACHE = new Map<string, number[]>();

/**
 * 动态获取数据库中存在的统计年份列表（docs/available-years.md）。
 * @param scopes 按模块取年份（如 ['inspection-record']）；不传 = 系统全部来源
 */
export function useAvailableYears(scopes?: string[]) {
  const years = ref<number[]>([]);
  const loading = ref(false);
  const cacheKey = scopes && scopes.length > 0 ? scopes.join(',') : '*';

  const fetchYears = async () => {
    loading.value = true;
    try {
      const cached = CACHE.get(cacheKey);
      if (cached) {
        years.value = cached;
        return;
      }
      const params =
        scopes && scopes.length > 0 ? { scopes: scopes.join(',') } : undefined;
      const res = await requestClient.get<number[]>('/qms/common/years', {
        params,
      });
      years.value = res;
      CACHE.set(cacheKey, res);
    } catch (error) {
      console.error('获取统计年份失败', error);
      // 容错处理：显示当前年份及前一年
      const current = new Date().getFullYear();
      years.value = [current, current - 1];
    } finally {
      loading.value = false;
    }
  };

  onMounted(fetchYears);

  return {
    years,
    loading,
    refreshYears: fetchYears,
  };
}
