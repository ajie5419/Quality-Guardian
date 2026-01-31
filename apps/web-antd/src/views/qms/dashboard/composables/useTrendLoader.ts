import type { Ref } from 'vue';

import { ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { useDebounceFn } from '@vueuse/core';
import { message } from 'ant-design-vue';

/** 趋势请求函数类型 */
type TrendRequestFn<T = any> = (
  granularity: 'month' | 'week',
  period?: string,
) => Promise<T>;

/**
 * 趋势数据加载Hook (手动实现，不依赖 useRequest)
 * @param requestFn 趋势数据请求函数（如getPassRateTrend）
 * @param granularity 粒度响应式变量（week/month）
 * @returns 包含数据、加载状态、手动加载方法的对象
 */
export function useTrendLoader<T = any>(
  requestFn: TrendRequestFn<T>,
  granularity: Ref<'month' | 'week'>,
  initialData?: T,
) {
  const { t } = useI18n();
  const data = ref<T>(initialData as T) as Ref<T>;
  const isLoading = ref(false);

  // 简单的内存缓存
  const cache = ref<Record<string, T>>({});

  // 核心请求逻辑
  const loadTrendData = async (
    params: { force?: boolean; period?: string } = {},
  ) => {
    const key = granularity.value;

    // 如果不是强制刷新，且有缓存，直接使用
    if (!params.force && !params.period && cache.value[key]) {
      data.value = cache.value[key] as T;
      return;
    }

    isLoading.value = true;
    try {
      const res = await requestFn(granularity.value, params.period);
      data.value = res;
      // 仅缓存默认视角的趋势数据（非特定 period 查询）
      if (!params.period) {
        cache.value[key] = res;
      }
    } catch (error) {
      if (error !== 'cancel') {
        message.error(t('qms.dashboard.error.trendLoadFailed'));
        console.error(`[${requestFn.name}] load failed:`, error);
      }
    } finally {
      isLoading.value = false;
    }
  };

  // 防抖处理与自动刷新
  const debouncedLoad = useDebounceFn(loadTrendData, 300);

  // 监听粒度变化，自动刷新数据
  watch(
    () => granularity.value,
    () => {
      debouncedLoad();
    },
    { immediate: false },
  );

  return {
    data,
    isLoading,
    load: loadTrendData,
    refresh: () => loadTrendData({ force: true }),
    cancel: () => {}, // 简易实现暂不支持取消
  };
}
