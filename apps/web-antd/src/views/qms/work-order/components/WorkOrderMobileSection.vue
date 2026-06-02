<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import WorkOrderMobileList from './WorkOrderMobileList.vue';
import WorkOrderToolbarActions from './WorkOrderToolbarActions.vue';

export interface WorkOrderMobileSectionProps {
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
  checkedRowsLength: number;
  currentDate: Dayjs;
  currentDateMode: 'month' | 'week' | 'year';
  currentYear: number;
  dateModeOptions: Array<{ label: string; value: 'month' | 'week' | 'year' }>;
  page: number;
  pageSize: number;
  records: QmsWorkOrderApi.WorkOrderItem[];
  showDashboard: boolean;
  total: number;
  yearOptions: Array<{ label: string; value: number }>;
}

const props = defineProps<WorkOrderMobileSectionProps>();

const emit = defineEmits<{
  add: [];
  batchDelete: [];
  delete: [record: QmsWorkOrderApi.WorkOrderItem];
  detail: [record: QmsWorkOrderApi.WorkOrderItem];
  edit: [record: QmsWorkOrderApi.WorkOrderItem];
  pageChange: [nextPage: number, nextPageSize: number];
  reload: [];
  toggleDashboard: [];
  'update:currentDate': [value: Dayjs];
  'update:currentDateMode': [value: 'month' | 'week' | 'year'];
  'update:currentYear': [value: number];
}>();
</script>

<template>
  <WorkOrderToolbarActions
    :can-create="props.canCreate"
    :can-delete="props.canDelete"
    :checked-rows-length="props.checkedRowsLength"
    :current-date="props.currentDate"
    :current-date-mode="props.currentDateMode"
    :current-year="props.currentYear"
    :date-mode-options="props.dateModeOptions"
    :show-dashboard="props.showDashboard"
    :year-options="props.yearOptions"
    :is-mobile="true"
    @add="emit('add')"
    @batch-delete="emit('batchDelete')"
    @reload="emit('reload')"
    @toggle-dashboard="emit('toggleDashboard')"
    @update:current-date="emit('update:currentDate', $event)"
    @update:current-date-mode="emit('update:currentDateMode', $event)"
    @update:current-year="emit('update:currentYear', $event)"
  />

  <WorkOrderMobileList
    :can-delete="props.canDelete"
    :can-edit="props.canEdit"
    :page="props.page"
    :page-size="props.pageSize"
    :records="props.records"
    :total="props.total"
    @delete="emit('delete', $event)"
    @detail="emit('detail', $event)"
    @edit="emit('edit', $event)"
    @page-change="(page, pageSize) => emit('pageChange', page, pageSize)"
  />
</template>
