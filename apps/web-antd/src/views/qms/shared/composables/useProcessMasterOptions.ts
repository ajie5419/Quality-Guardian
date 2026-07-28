import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { ref } from 'vue';

import { getProcessMasterOptionsApi } from '#/api/qms/process-master';

interface UseProcessMasterOptionsParams<TOption> {
  mapOptions: (options: DictionaryOptionItem[] | undefined) => TOption[];
}

export function useProcessMasterOptions<TOption>(
  params: UseProcessMasterOptionsParams<TOption>,
) {
  const { mapOptions } = params;
  const options = ref<TOption[]>([]);

  async function loadOptions() {
    try {
      const masterOptions = await getProcessMasterOptionsApi();
      options.value = mapOptions(masterOptions);
    } catch {
      options.value = [];
    }
  }

  return { loadOptions, options };
}
