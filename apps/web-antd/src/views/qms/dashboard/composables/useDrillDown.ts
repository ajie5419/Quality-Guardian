import type { Ref } from 'vue';

import { ref } from 'vue';

import { message } from 'ant-design-vue';

/**
 * 下钻逻辑Hook
 * @param type 下钻类型（passRate/qualityLoss）
 * @param requestFn 下钻数据请求函数
 * @returns 下钻状态及操作方法
 */
export function useDrillDown<T = any>(
  type: 'passRate' | 'qualityLoss',
  requestFn: (period: string) => Promise<T[]>,
) {
  // 下钻状态
  const visible = ref(false); // 弹窗可见性
  const period = ref(''); // 选中的时间段
  const data = ref<T[]>([]); // 下钻数据
  const isLoading = ref(false); // 加载状态

  /**
   * 打开下钻弹窗并加载数据
   * @param periodStr 选中的时间段（如2024-W12、2024-06）
   */
  const open = async (periodStr: string) => {
    visible.value = true;
    period.value = periodStr;
    isLoading.value = true;
    try {
      data.value = await requestFn(periodStr);
    } catch (error) {
      message.error(`Failed to load ${type} detail data`);
      console.error(`[${type}] drill down load failed:`, error);
    } finally {
      isLoading.value = false;
    }
  };

  /** 关闭下钻弹窗（重置状态） */
  const close = () => {
    visible.value = false;
    period.value = '';
    // 可选：清空数据，避免下次打开展示旧数据
    // data.value = [];
  };

  return {
    visible: visible as Ref<boolean>,
    period: period as Ref<string>,
    data: data as Ref<T[]>,
    isLoading: isLoading as Ref<boolean>,
    open,
    close,
  };
}
