<script lang="ts" setup>
import type { BomItem } from '@qgs/shared';
import type { SelectProps } from 'ant-design-vue';

import { computed, ref, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { getBomList } from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

defineOptions({
  name: 'BomItemSelect',
});

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    placeholder?: string;
    value?: null | string;
    workOrderNumber?: null | string;
  }>(),
  {
    value: undefined,
    workOrderNumber: '',
    placeholder: '请选择一级部件',
    disabled: false,
  },
);

const emit = defineEmits<{
  change: [value: unknown, option: unknown];
  'update:value': [value: SelectProps['value']];
}>();
const { handleApiError } = useErrorHandler();

const options = ref<BomItem[]>([]);
const loading = ref(false);
let requestSequence = 0;

const selectOptions = computed<SelectProps['options']>(() =>
  options.value.map((item) => ({
    label: `${item.partName}${item.partNumber ? ` (${item.partNumber})` : ''}`,
    value: item.partName,
    item,
  })),
);

async function fetchBomItems() {
  const workOrderNumber = String(props.workOrderNumber ?? '').trim();
  const requestId = ++requestSequence;
  options.value = [];
  if (!workOrderNumber) {
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const items = await getBomList({ projectId: workOrderNumber });
    if (
      requestId === requestSequence &&
      workOrderNumber === String(props.workOrderNumber ?? '').trim()
    ) {
      options.value = items || [];
    }
  } catch (error) {
    if (requestId === requestSequence) {
      handleApiError(error, 'Fetch BOM Items');
      options.value = [];
    }
  } finally {
    if (requestId === requestSequence) loading.value = false;
  }
}

const handleChange: NonNullable<SelectProps['onChange']> = (value, option) => {
  emit('update:value', value);
  emit('change', value, option);
};

watch(() => props.workOrderNumber, fetchBomItems, { immediate: true });
</script>

<template>
  <Select
    :value="value ?? undefined"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    :options="selectOptions"
    show-search
    allow-clear
    style="width: 100%"
    :filter-option="
      (input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
    "
    @change="handleChange"
  />
</template>
