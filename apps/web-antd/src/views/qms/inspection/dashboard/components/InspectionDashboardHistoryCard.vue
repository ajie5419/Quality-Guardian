<script lang="ts" setup>
import type { SegmentedValue } from 'ant-design-vue/es/segmented/src/segmented';

import { Button, Card, Segmented } from 'ant-design-vue';

type HistoryView = 'inspector' | 'reinspection' | 'team';

defineProps<{
  hasData: boolean;
  options: Array<{ label: string; value: HistoryView }>;
  rangeLabel: string;
  view: HistoryView;
}>();

const emit = defineEmits<{
  openDetail: [];
  'update:view': [value: HistoryView];
}>();

function isHistoryView(value: SegmentedValue): value is HistoryView {
  return value === 'team' || value === 'reinspection' || value === 'inspector';
}

function handleViewUpdate(value: SegmentedValue) {
  if (isHistoryView(value)) emit('update:view', value);
}
</script>

<template>
  <Card :body-style="{ padding: '16px' }">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="font-medium text-gray-900">历史统计</div>
        <div class="mt-1 text-xs text-gray-500">
          {{ rangeLabel }}班组报检、复检率、检验员完成数量与平均任务时长
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Segmented
          :value="view"
          :options="options"
          @update:value="handleViewUpdate"
        />
        <Button v-if="hasData" size="small" @click="emit('openDetail')">
          查看全部
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div class="min-h-[320px] rounded bg-gray-50 p-3">
        <slot name="chart"></slot>
      </div>
      <slot name="list"></slot>
    </div>
  </Card>
</template>
