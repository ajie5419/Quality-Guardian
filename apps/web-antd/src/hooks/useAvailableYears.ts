import { ref, onMounted } from 'vue';
import { requestClient } from '#/api/request';

/**
 * 动态获取数据库中存在的统计年份列表
 */
export function useAvailableYears() {
  const years = ref<number[]>([]);
  const loading = ref(false);

  const fetchYears = async () => {
    loading.value = true;
    try {
      // 调用后端动态发现接口
      const res = await requestClient.get<number[]>('/qms/common/years');
      years.value = res;
    } catch (err) {
      console.error('获取统计年份失败', err);
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
    refreshYears: fetchYears
  };
}
