<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { BomItem } from '#/api/qms/planning';

import { computed, ref, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { getBomList } from '#/api/qms/planning';

defineOptions({
  name: 'BomItemSelect',
});

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    placeholder?: string;
    value?: string;
    workOrderNumber?: string;
  }>(),
  {
    value: undefined,
    workOrderNumber: '',
    placeholder: '请选择或输入一级部件',
    disabled: false,
  },
);

const emit = defineEmits(['update:value', 'change']);

const options = ref<BomItem[]>([]);
const loading = ref(false);

const selectOptions = computed<SelectProps['options']>(() => {
  return options.value.map((item) => ({
    label: `${item.partName} ${item.partNumber ? `(${item.partNumber})` : ''}`,
    value: item.partName,
    item,
  }));
});

async function fetchBomItems() {
  if (!props.workOrderNumber) {
    options.value = [];
    return;
  }

  loading.value = true;
  try {
    const items = await getBomList({ projectId: props.workOrderNumber });
    options.value = items || [];
  } catch (error) {
    console.error('Fetch BOM items error:', error);
    options.value = [];
  } finally {
    loading.value = false;
  }
}

function handleChange(val: SelectProps['value'], option: any) {
  emit('update:value', val);
  emit('change', val, option);
}

watch(
  () => props.workOrderNumber,
  () => {
    fetchBomItems();
  },
  { immediate: true },
);
</script>

<template>
  <Select
    :value="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    show-search
    allow-clear
    :options="selectOptions"
    :filter-option="
      (input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
    "
    @change="handleChange"
    style="width: 100%"
  />
</template>
