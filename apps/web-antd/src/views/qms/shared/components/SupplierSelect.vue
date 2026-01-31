<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { computed, onMounted, toRef, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { getSupplierList } from '#/api/qms/supplier';

import { useSelectPagination } from '../composables/useSelectPagination';

defineOptions({
  name: 'SupplierSelect',
});

const props = withDefaults(
  defineProps<{
    allowClear?: boolean;
    category?: string;
    disabled?: boolean;
    placeholder?: string;
    value?: string;
  }>(),
  {
    value: undefined,
    placeholder: '请选择供应商',
    disabled: false,
    allowClear: true,
    category: 'Supplier',
  },
);

const emit = defineEmits(['update:value', 'change']);

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
    valueKey: 'name',
  },
  toRef(props, 'value'),
  emit,
);

const selectOptions = computed<SelectProps['options']>(() => {
  return options.value.map((item) => ({
    ...item,
    item,
    label: item.name,
    value: item.name,
  }));
});

onMounted(() => {
  fetchItems('', false);
});

watch(
  () => props.category,
  () => {
    // Check if current value is still valid?
    // Usually when category changes (e.g. Dept change), the parent might clear the value.
    // Here we just refresh the list.
    fetchItems('', false);
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
