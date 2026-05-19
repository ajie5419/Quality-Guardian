import type { DictionaryOptionItem } from '#/api/system/dictionary';

import { ref } from 'vue';

import { getDictionaryOptions } from '#/api/system/dictionary';

interface UseDictionaryOptionsParams<TOption> {
  dictType: string;
  fallbackOptions: TOption[];
  mapOptions: (
    options: DictionaryOptionItem[] | undefined,
    fallbackOptions: TOption[],
  ) => TOption[];
}

export function useDictionaryOptions<TOption>(
  params: UseDictionaryOptionsParams<TOption>,
) {
  const { dictType, fallbackOptions, mapOptions } = params;
  const options = ref<TOption[]>(mapOptions(undefined, fallbackOptions));

  async function loadOptions() {
    try {
      const dictOptions = await getDictionaryOptions(dictType);
      options.value = mapOptions(dictOptions, fallbackOptions);
    } catch {
      options.value = mapOptions(undefined, fallbackOptions);
    }
  }

  return {
    options,
    loadOptions,
  };
}
