<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { computed, onMounted, toRef, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { getSupplierList } from '#/api/qms/supplier';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { useSelectPagination } from '../composables/useSelectPagination';

defineOptions({
  name: 'SupplierSelect',
});

const props = withDefaults(
  defineProps<{
    allowClear?: boolean;
    category?: QmsSupplierApi.SupplierListParams['category'];
    disabled?: boolean;
    legacyName?: string;
    placeholder?: string;
    value?: string;
    valueMode?: 'id' | 'name';
  }>(),
  {
    value: undefined,
    placeholder: '请选择供应商',
    disabled: false,
    allowClear: true,
    category: 'Supplier',
    legacyName: undefined,
    valueMode: 'name',
  },
);

const emit = defineEmits<{
  change: [value: string | undefined, option?: SupplierSelectOption];
  'update:value': [value: string | undefined];
}>();
const { handleApiError } = useErrorHandler();

type SupplierItem = QmsSupplierApi.SupplierItem;
type SupplierSelectOption = {
  item: SupplierItem;
  label: string;
  value: string;
};

function createSelectOption(item: SupplierItem): SupplierSelectOption {
  return {
    item,
    label: item.name,
    value: props.valueMode === 'id' ? item.id : item.name,
  };
}

function emitSelectEvent(event: 'change' | 'update:value', ...args: unknown[]) {
  const value = args[0] as string | undefined;
  if (event === 'update:value') {
    emit(event, value);
    return;
  }
  emit(event, value, args[1] as SupplierSelectOption | undefined);
}

const {
  options,
  loading,
  handleSearch,
  handlePopupScroll,
  handleChange,
  fetchItems,
} = useSelectPagination<QmsSupplierApi.SupplierItem>(
  {
    fetchDataFn: getSupplierList,
    getParams: (keyword) => ({
      keyword,
      category: props.category,
    }),
    valueKey: props.valueMode === 'id' ? 'id' : 'name',
  },
  toRef(props, 'value'),
  emitSelectEvent,
);

const selectOptions = computed<SelectProps['options']>(() => {
  return options.value.map((item) => createSelectOption(item));
});

let legacyResolutionToken = 0;

async function fetchExactMatches(legacyName: string, category?: string) {
  const exactMatches = new Map<string, SupplierItem>();
  const pageSize = 100;
  let page = 1;
  let total = 0;

  do {
    const result = await getSupplierList({
      ...(category ? { category } : {}),
      keyword: legacyName,
      page,
      pageSize,
    });
    total = result.total;
    result.items.forEach((item) => {
      if (item.name.trim() === legacyName) exactMatches.set(item.id, item);
    });
    page += 1;
  } while ((page - 1) * pageSize < total);
  return exactMatches;
}

async function resolveLegacyName() {
  const legacyName = props.legacyName?.trim();
  if (props.valueMode !== 'id' || !legacyName) return false;

  const resolutionToken = ++legacyResolutionToken;
  const selectedValue = String(props.value || '').trim();

  try {
    let exactMatches = await fetchExactMatches(legacyName, props.category);
    // A supplier may belong to a category that differs from the form's
    // responsibility mapping (e.g. an Outsourcing supplier under an INCOMING
    // request). Retry without the category filter only when the preselected
    // supplier is missing, so the legacy name still resolves to its canonical
    // id instead of showing the raw id. Without a preselected value we never
    // guess across categories.
    if (selectedValue && !exactMatches.has(selectedValue)) {
      exactMatches = await fetchExactMatches(legacyName);
    }
    if (exactMatches.size > 1 && !selectedValue) return true;

    if (resolutionToken !== legacyResolutionToken) return true;
    if (selectedValue) {
      const currentMatch = exactMatches.get(selectedValue);
      if (
        currentMatch &&
        !options.value.some((item) => item.id === currentMatch.id)
      ) {
        options.value = [currentMatch, ...options.value];
      }
      return Boolean(currentMatch);
    }
    const exactMatch = [...exactMatches.values()][0];
    if (!exactMatch) return true;

    if (!options.value.some((item) => item.id === exactMatch.id)) {
      options.value = [exactMatch, ...options.value];
    }
    handleChange(exactMatch.id, createSelectOption(exactMatch));
    return true;
  } catch (error) {
    handleApiError(error, 'Resolve Legacy Supplier Name');
    return true;
  }
}

async function loadInitialOptions() {
  if (await resolveLegacyName()) return;
  await fetchItems('', false);
}

onMounted(loadInitialOptions);

watch(
  () => props.category,
  () => {
    legacyResolutionToken += 1;
    loadInitialOptions();
  },
);

watch(
  () => [props.legacyName, props.value, props.valueMode] as const,
  () => {
    resolveLegacyName();
  },
);
</script>

<template>
  <Select
    :value="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :allow-clear="allowClear"
    :loading="loading"
    show-search
    :filter-option="false"
    :options="selectOptions"
    @search="handleSearch"
    @change="handleChange"
    @popup-scroll="handlePopupScroll"
    style="width: 100%"
  />
</template>
