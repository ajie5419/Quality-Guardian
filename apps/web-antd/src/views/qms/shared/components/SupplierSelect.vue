<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';
import { Select } from 'ant-design-vue';

import { getSupplierList } from '#/api/qms/supplier';

defineOptions({
  name: 'SupplierSelect',
});

const props = defineProps({
  value: {
    type: String,
    default: undefined,
  },
  placeholder: {
    type: String,
    default: '请选择供应商',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  allowClear: {
    type: Boolean,
    default: true,
  },
  category: {
    type: String,
    default: 'Supplier',
  },
});

const emit = defineEmits(['update:value', 'change']);

const options = ref<QmsSupplierApi.SupplierItem[]>([]);
const loading = ref(false);
const cachedSelectedItem = ref<null | QmsSupplierApi.SupplierItem>(null);

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});
const searchText = ref('');

const selectOptions = computed<SelectProps['options']>(() => {
  return options.value.map((item) => ({
    ...item,
    item,
    label: item.name,
    value: item.name, // Usually we bind by name in these forms, but could be ID
  }));
});

async function fetchSuppliers(keyword: string = '', loadMore: boolean = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    if (loadMore) {
      pagination.page += 1;
    } else {
      pagination.page = 1;
      searchText.value = keyword.trim();
    }

    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchText.value,
      category: props.category,
    };

    const { items, total } = await getSupplierList(params);
    pagination.total = total;

    const newItems = items || [];
    const currentOptions = loadMore ? options.value : [];

    const merged = [...currentOptions, ...newItems];
    const uniqueMap = new Map();
    merged.forEach((item) => uniqueMap.set(item.name, item));

    // Maintain selection in list
    if (props.value && !uniqueMap.has(props.value)) {
      if (
        cachedSelectedItem.value &&
        cachedSelectedItem.value.name === props.value
      ) {
        uniqueMap.set(props.value, cachedSelectedItem.value);
      } else {
        // Try to fetch specific if needed? Usually name is enough for search
      }
    }

    options.value = [...uniqueMap.values()];
  } catch (error) {
    console.error('Failed to fetch suppliers', error);
    if (loadMore) pagination.page -= 1;
  } finally {
    loading.value = false;
  }
}

const handleSearch = useDebounceFn((val: string) => {
  fetchSuppliers(val, false);
}, 300);

const handlePopupScroll = (e: any) => {
  const { target } = e;
  if (
    target.scrollTop + target.offsetHeight >= target.scrollHeight - 10 &&
    options.value.length < pagination.total &&
    !loading.value
  ) {
    fetchSuppliers(searchText.value, true);
  }
};

function handleChange(val: any, option: any) {
  emit('update:value', val);
  emit('change', val, option);

  if (val && option) {
    cachedSelectedItem.value = option.item || option;
  } else if (!val) {
    cachedSelectedItem.value = null;
  }
}

watch(
  () => props.value,
  (newVal) => {
    if (newVal) {
      const existing = options.value.find((o) => o.name === newVal);
      if (existing) {
        cachedSelectedItem.value = existing;
      }
    }
  },
);

onMounted(() => {
  fetchSuppliers('', false);
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
    :options="selectOptions"
    @search="handleSearch"
    @change="handleChange"
    @popup-scroll="handlePopupScroll"
    style="width: 100%"
  />
</template>
