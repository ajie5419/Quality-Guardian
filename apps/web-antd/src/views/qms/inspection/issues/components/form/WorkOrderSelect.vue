<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';

import type { WorkOrderItem } from '#/api/qms/work-order';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';
import { Select } from 'ant-design-vue';

import { getWorkOrderList } from '#/api/qms/work-order';

defineOptions({
  name: 'WorkOrderSelect',
});

const props = defineProps({
  value: {
    type: String,
    default: undefined,
  },
  placeholder: {
    type: String,
    default: '请选择工单',
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

const options = ref<WorkOrderItem[]>([]);
const loading = ref(false);
const cachedSelectedItem = ref<null | WorkOrderItem>(null);

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});
const searchText = ref('');

// Transform to Ant Design Select options
const selectOptions = computed<SelectProps['options']>(() => {
  return options.value.map((item) => ({
    ...item, // Spread all properties so they are available in the slot scope
    item, // Ensure item is available as a property for slot and change handler
    label: item.workOrderNumber,
    value: item.id,
  }));
});

async function fetchWorkOrders(
  keyword: string = '',
  loadMore: boolean = false,
) {
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
      ignoreYearFilter: true,
      keyword: searchText.value,
    };

    const { items, total } = await getWorkOrderList(params);
    pagination.total = total;

    const newItems = items || [];
    const currentOptions = loadMore ? options.value : [];

    // Combine and deduplicate options
    const merged = [...currentOptions, ...newItems];
    const uniqueMap = new Map();
    merged.forEach((item) => uniqueMap.set(item.id, item));

    // Ensure the currently selected item is in the options list so it displays correctly
    if (props.value) {
      // Check if currently selected item is in the unique map
      if (uniqueMap.has(props.value)) {
        cachedSelectedItem.value = uniqueMap.get(props.value);
      } else if (
        cachedSelectedItem.value &&
        cachedSelectedItem.value.id === props.value
      ) {
        // Restore from cache if not in current list
        uniqueMap.set(props.value, cachedSelectedItem.value);
      } else {
        // Not in list and not in cache, fetch it
        try {
          const { items: specificItems } = await getWorkOrderList({
            ids: props.value,
          });
          if (specificItems && specificItems.length > 0) {
            cachedSelectedItem.value = specificItems[0]!;
            uniqueMap.set(props.value, specificItems[0]);
          }
        } catch (error) {
          console.error('Failed to fetch selected work order details', error);
        }
      }
    }

    options.value = [...uniqueMap.values()];
  } catch (error) {
    console.error('Failed to fetch work orders', error);
    if (loadMore) pagination.page -= 1; // Revert page if failed
  } finally {
    loading.value = false;
  }
}

const handleSearch = useDebounceFn((val: string) => {
  fetchWorkOrders(val, false);
}, 300);

const handlePopupScroll = (e: any) => {
  const { target } = e;
  // Threshold to trigger load more
  if (
    target.scrollTop + target.offsetHeight >= target.scrollHeight - 10 &&
    options.value.length < pagination.total &&
    !loading.value
  ) {
    fetchWorkOrders(searchText.value, true);
  }
};

function handleChange(val: any, option: any) {
  emit('update:value', val);
  emit('change', val, option);

  // Update cache if selected
  if (val && option) {
    cachedSelectedItem.value = option.item || option;
  } else if (!val) {
    cachedSelectedItem.value = null;
  }
}

// Watch value to ensure display if set programmatically
watch(
  () => props.value,
  async (newVal) => {
    if (newVal) {
      const existing = options.value.find((o) => o.id === newVal);
      if (existing) {
        cachedSelectedItem.value = existing;
      } else {
        try {
          const { items } = await getWorkOrderList({ ids: newVal });
          if (items && items.length > 0) {
            cachedSelectedItem.value = items[0]!;
            if (!options.value.some((o) => o.id === newVal)) {
              options.value.push(items[0]!);
            }
          }
        } catch (error) {
          console.error(error);
        }
      }
    }
  },
);

onMounted(() => {
  fetchWorkOrders('', false);
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
