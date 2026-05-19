import { computed, ref } from 'vue';

import {
  QMS_DICTIONARY_TYPE_LABELS,
  QMS_DICTIONARY_TYPE_OPTIONS,
} from '@qgs/shared';

import { getDictionaryTypes } from '#/api/system/dictionary';

type DictionaryTypeOption = { label: string; value: string };

function getFallbackOptions(): DictionaryTypeOption[] {
  return QMS_DICTIONARY_TYPE_OPTIONS.map((item) => ({
    label: String(item.label),
    value: String(item.value),
  }));
}

function mapTypeLabel(value: string) {
  return (
    QMS_DICTIONARY_TYPE_LABELS[
      value as keyof typeof QMS_DICTIONARY_TYPE_LABELS
    ] || value
  );
}

export function useDictionaryTypeOptions(
  handleApiError: (error: unknown, context: string) => void,
) {
  const options = ref<DictionaryTypeOption[]>(getFallbackOptions());

  const optionSet = computed(
    () => new Set(options.value.map((item) => String(item.value))),
  );

  async function loadOptions() {
    try {
      const types = await getDictionaryTypes();
      const normalized = [...new Set((types || []).map(String))];
      if (normalized.length === 0) return;
      options.value = normalized.map((value) => ({
        label: mapTypeLabel(value),
        value,
      }));
    } catch (error) {
      handleApiError(error, 'Load Dictionary Types');
      options.value = getFallbackOptions();
    }
  }

  return {
    optionSet,
    options,
    loadOptions,
  };
}
