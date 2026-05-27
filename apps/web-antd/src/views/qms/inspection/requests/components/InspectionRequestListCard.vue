<script setup lang="ts">
import type { InspectionRequestTableProps } from './InspectionRequestTable.vue';

import type { InspectionRequest } from '#/api/qms/inspection-request';

import { Card, Tag } from 'ant-design-vue';

import InspectionRequestTable from './InspectionRequestTable.vue';

interface Props extends InspectionRequestTableProps {}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [record: InspectionRequest];
  delete: [record: InspectionRequest];
  detail: [record: InspectionRequest];
  dispatch: [record: InspectionRequest];
  pageChange: [nextPage: number, nextPageSize: number];
  qr: [record: InspectionRequest];
  record: [record: InspectionRequest];
}>();
</script>

<template>
  <Card>
    <template #title>
      <div class="flex items-center justify-between gap-3">
        <span>任务列表</span>
        <Tag color="default">共 {{ props.total }} 条</Tag>
      </div>
    </template>
    <InspectionRequestTable
      v-bind="props"
      @page-change="
        (nextPage, nextPageSize) => emit('pageChange', nextPage, nextPageSize)
      "
      @detail="(record) => emit('detail', record)"
      @dispatch="(record) => emit('dispatch', record)"
      @close="(record) => emit('close', record)"
      @record="(record) => emit('record', record)"
      @qr="(record) => emit('qr', record)"
      @delete="(record) => emit('delete', record)"
    />
  </Card>
</template>

<style scoped>
:deep(.inspection-request-row-closed) td {
  background: #fafafa;
}

:deep(.inspection-request-row-closed .text-gray-900) {
  color: #6b7280;
}
</style>
