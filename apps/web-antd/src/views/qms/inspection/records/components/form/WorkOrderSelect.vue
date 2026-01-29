<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';

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

const options = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
const loading = ref(false);
const cachedSelectedItem = ref<QmsWorkOrderApi.WorkOrderItem | null>(null);

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
    label: item.workOrderNumber,
    value: item.workOrderNumber, // Use workOrderNumber as value
  }));
});

async function fetchWorkOrders(
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
      ignoreYearFilter: true,
      keyword: searchText.value,
    };

    const { items, total } = await getWorkOrderList(params);
    pagination.total = total;

    let newItems = items || [];
    let currentOptions = loadMore ? options.value : [];

    // Deduplicate
    const merged = [...currentOptions, ...newItems];
    const uniqueMap = new Map();
    merged.forEach((item) => uniqueMap.set(item.workOrderNumber, item));

    // Handle selected item echo
    if (props.value) {
      if (uniqueMap.has(props.value)) {
        cachedSelectedItem.value = uniqueMap.get(props.value);
      } else if (
        cachedSelectedItem.value &&
        cachedSelectedItem.value.workOrderNumber === props.value
      ) {
        uniqueMap.set(props.value, cachedSelectedItem.value);
      } else {
        // Fetch specific if missing
        try {
          const { items: specificItems } = await getWorkOrderList({
            workOrderNumber: props.value, // Approximate fetch by WO number
            pageSize: 1,
            ignoreYearFilter: true
          });
          // Ideally we need an API to fetch by exact ID or WO number list, but this works for now
          // Or update backend getList to support `ids` (list of WO numbers)
          if (specificItems && specificItems.length > 0) {
             const exactMatch = specificItems.find(i => i.workOrderNumber === props.value);
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
  fetchWorkOrders(val, false);
}, 300);

const handlePopupScroll = (e: any) => {
  const { target } = e;
  if (target.scrollTop + target.offsetHeight >= target.scrollHeight - 10) {
    if (options.value.length < pagination.total && !loading.value) {
      fetchWorkOrders(searchText.value, true);
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
    // Re-trigger fetch logic if needed to ensure echo, but fetchWorkOrders handles it
    if (newVal && !options.value.find(o => o.workOrderNumber === newVal)) {
        fetchWorkOrders(searchText.value, false);
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
    @popupScroll="handlePopupScroll"
    style="width: 100%"
  >
    <template #option="{ item }">
      <div class="flex justify-between items-center">
        <span>{{ item?.workOrderNumber }}</span>
        <span
          v-if="item?.projectName"
          class="text-gray-400 text-xs ml-2 truncate max-w-[150px]"
        >
          {{ item?.projectName }}
        </span>
      </div>
    </template>
  </Select>
</template>
