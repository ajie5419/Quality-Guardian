import type {
  QualityClassificationCategory,
  QualityClassificationScope,
} from '@qgs/shared';

import { ref } from 'vue';

import { getQualityClassificationOptionsApi } from '#/api/qms/quality-classification';

export function useQualityClassificationOptions(
  scope: QualityClassificationScope,
) {
  const loading = ref(false);
  const options = ref<QualityClassificationCategory[]>([]);

  async function loadOptions() {
    loading.value = true;
    try {
      options.value = await getQualityClassificationOptionsApi(scope);
    } finally {
      loading.value = false;
    }
  }

  return { loadOptions, loading, options };
}
