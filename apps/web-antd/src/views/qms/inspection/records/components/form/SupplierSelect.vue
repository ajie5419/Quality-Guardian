<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';
import type { SupplierItem } from '#/api/qms/supplier';

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
});

const emit = defineEmits(['update:value', 'change']);

const options = ref<SupplierItem[]>([]);
const loading = ref(false);
const cachedSelectedItem = ref<SupplierItem | null>(null);

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
    value: item.name, // Use name as value
  }));
});

async function fetchSuppliers(
  keyword: string = '',
  loadMore: boolean = false,
) {
  if (loading.value) return;
  loading.value = true;
  try {
    if (!loadMore) {
      pagination.page = 1;
      searchText.value = keyword.trim();
    } else {
      pagination.page += 1;
    }

    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      name: searchText.value,
    };

    const { items, total } = await getSupplierList(params);
    pagination.total = total;

    let newItems = items || [];
    let currentOptions = loadMore ? options.value : [];

    // Deduplicate
    const merged = [...currentOptions, ...newItems];
    const uniqueMap = new Map();
    merged.forEach((item) => uniqueMap.set(item.name, item));

    // Handle selected item echo
    if (props.value) {
      if (uniqueMap.has(props.value)) {
        cachedSelectedItem.value = uniqueMap.get(props.value);
      } else if (
        cachedSelectedItem.value &&
        cachedSelectedItem.value.name === props.value
      ) {
        uniqueMap.set(props.value, cachedSelectedItem.value);
      } else {
        // Fetch specific if missing
        try {
          const { items: specificItems } = await getSupplierList({
            name: props.value,
            pageSize: 10,
          } as any);
          if (specificItems && specificItems.length > 0) {
            const exactMatch = specificItems.find(
              (i) => i.name === props.value,
            );
            if (exactMatch) {
              cachedSelectedItem.value = exactMatch;
              uniqueMap.set(props.value, exactMatch);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    }

    options.value = Array.from(uniqueMap.values());
  } catch (error) {
    console.error(error);
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
  if (target.scrollTop + target.offsetHeight >= target.scrollHeight - 10) {
    if (options.value.length < pagination.total && !loading.value) {
      fetchSuppliers(searchText.value, true);
    }
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
    // Re-trigger fetch logic if needed to ensure echo
    if (newVal && !options.value.find((o) => o.name === newVal)) {
      fetchSuppliers(searchText.value, false);
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
    :default-active-first-option="false"
    :not-found-content="loading ? undefined : null"
    :options="selectOptions"
    @search="handleSearch"
    @change="handleChange"
    @popupScroll="handlePopupScroll"
    style="width: 100%"
  >
    <template #option="{ item }">
      <div class="flex justify-between items-center">
        <span>{{ item?.name }}</span>
        <span
          v-if="item?.contactPerson"
          class="text-gray-400 text-xs ml-2 truncate max-w-[150px]"
        >
          {{ item?.contactPerson }}
        </span>
      </div>
    </template>
  </Select>
</template>
