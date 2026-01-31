<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { WorkOrderItem } from '#/api/qms/work-order';

import { computed, onMounted, toRef } from 'vue';

import { Select } from 'ant-design-vue';

import { getWorkOrderList } from '#/api/qms/work-order';

import { useSelectPagination } from '../composables/useSelectPagination';

defineOptions({
  name: 'WorkOrderSelect',
});

const props = withDefaults(
  defineProps<{
    allowClear?: boolean;
    disabled?: boolean;
    placeholder?: string;
    value?: string;
  }>(),
  {
    value: undefined,
    placeholder: '请选择工单',
    disabled: false,
    allowClear: true,
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
} = useSelectPagination<WorkOrderItem>(
  {
    fetchDataFn: getWorkOrderList,
    getParams: (keyword) => ({
      keyword,
      ignoreYearFilter: true,
    }),
    valueKey: 'workOrderNumber', // Or 'id' depending on backend consistency
    echoFetcher: async (val) => {
      try {
        const { items } = await getWorkOrderList({
          ids: val,
          workOrderNumber: val,
        });
        return items?.[0] || null;
      } catch {
        return null;
      }
    },
  },
  toRef(props, 'value'),
  emit,
);

// Transform to Ant Design Select options
const selectOptions = computed<SelectProps['options']>(() => {
  return options.value.map((item) => ({
    ...item,
    item,
    label: item.workOrderNumber,
    value: item.id || item.workOrderNumber,
  }));
});

onMounted(() => {
  fetchItems('', false);
});
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
    :default-active-first-option="false"
    :not-found-content="loading ? undefined : null"
    :options="selectOptions"
    @search="handleSearch"
    @change="handleChange"
    @popup-scroll="handlePopupScroll"
    style="width: 100%"
  >
    <template #option="{ item }">
      <div class="flex items-center justify-between">
        <span>{{ item?.workOrderNumber }}</span>
        <span
          v-if="item?.projectName"
          class="ml-2 max-w-[150px] truncate text-xs text-gray-400"
        >
          {{ item?.projectName }}
        </span>
      </div>
    </template>
  </Select>
</template>
