import type { Ref } from 'vue';

// No import needed
import { ref, watch } from 'vue';

import { generateInspectionNcNumber } from '#/api/qms/inspection';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface UseNcNumberOptions {
  formApi: { setFieldValue: (field: string, value: unknown) => void };
  isEditMode: Ref<boolean>;
}

/**
 * NC 编号生成 Composable
 */
export function useNcNumber(options: UseNcNumberOptions) {
  const { formApi, isEditMode } = options;
  const { handleApiError } = useErrorHandler();

  const isAutoNc = ref(false);

  /**
   * 生成 NC 编号
   */
  async function generateNcNumber(): Promise<string> {
    try {
      const { ncNumber } = await generateInspectionNcNumber();
      return ncNumber;
    } catch (error) {
      handleApiError(error, 'Generate NC Number');
      throw error;
    }
  }

  // 监听自动生成开关
  watch(isAutoNc, async (val) => {
    if (val && !isEditMode.value) {
      const ncNumber = await generateNcNumber();
      formApi.setFieldValue('ncNumber', ncNumber);
    } else if (!val && !isEditMode.value) {
      // 关闭自动生成时，清空编号，防止误提交
      formApi.setFieldValue('ncNumber', '');
    }
  });

  /**
   * 重置自动生成状态
   */
  function resetAutoNc() {
    isAutoNc.value = false;
  }

  return {
    isAutoNc,
    generateNcNumber,
    resetAutoNc,
  };
}
