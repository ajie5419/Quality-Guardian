<script setup lang="ts">
import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, Empty, Pagination } from 'ant-design-vue';

import { QmsStatusTag } from '#/components/Qms';

export interface WorkOrderMobileListProps {
  canDelete: boolean;
  canEdit: boolean;
  page: number;
  pageSize: number;
  records: QmsWorkOrderApi.WorkOrderItem[];
  total: number;
}

const props = defineProps<WorkOrderMobileListProps>();

const emit = defineEmits<{
  delete: [record: QmsWorkOrderApi.WorkOrderItem];
  detail: [record: QmsWorkOrderApi.WorkOrderItem];
  edit: [record: QmsWorkOrderApi.WorkOrderItem];
  pageChange: [nextPage: number, nextPageSize: number];
}>();

const { t } = useI18n();
const hasRecords = computed(() => props.records.length > 0);

function displayValue(value?: null | number | string) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="record in props.records"
      :key="record.workOrderNumber"
      class="rounded border border-gray-100 bg-white px-3 py-2"
    >
      <div class="flex min-w-0 items-start justify-between gap-2">
        <div class="min-w-0">
          <button
            class="block max-w-full truncate text-left font-medium text-blue-600"
            type="button"
            @click="emit('detail', record)"
          >
            {{ displayValue(record.workOrderNumber) }}
          </button>
          <div class="truncate text-xs text-gray-500">
            {{ displayValue(record.projectName) }}
          </div>
          <div class="truncate text-xs text-gray-400">
            {{ displayValue(record.customerName) }} /
            {{ displayValue(record.division) }}
          </div>
        </div>
        <div class="shrink-0">
          <QmsStatusTag :status="record.status" type="work-order" />
        </div>
      </div>

      <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div class="min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.workOrder.deliveryDate') }}：
          </span>
          {{ displayValue(record.deliveryDate) }}
        </div>
        <div class="min-w-0 truncate text-right">
          <span class="text-gray-400">{{ t('qms.workOrder.quantity') }}：</span>
          {{ displayValue(record.quantity) }}
        </div>
        <div class="min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.workOrder.effectiveTime') }}：
          </span>
          {{ displayValue(record.effectiveTime) }}
        </div>
        <div class="min-w-0 truncate text-right">
          <span class="text-gray-400">
            {{ t('qms.workOrder.warrantyStatus') }}：
          </span>
          {{ displayValue(record.warrantyStatus) }}
        </div>
        <div class="col-span-2 min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.workOrder.requirementTasks') }}：
          </span>
          {{ Number(record.confirmedRequirements || 0) }}/{{
            Number(record.plannedRequirements || 0)
          }}
          <span
            v-if="Number(record.overdueUnconfirmedRequirements || 0) > 0"
            class="ml-2 text-red-500"
          >
            {{ t('qms.workOrder.overdueOverTenDays') }}
            {{ Number(record.overdueUnconfirmedRequirements || 0) }}
          </span>
        </div>
      </div>

      <div class="mt-2 flex min-w-0 flex-wrap justify-end gap-1">
        <Button size="small" @click="emit('detail', record)">
          <template #icon>
            <IconifyIcon icon="lucide:list-checks" />
          </template>
          {{ t('common.detail') }}
        </Button>
        <Button v-if="props.canEdit" size="small" @click="emit('edit', record)">
          <template #icon>
            <IconifyIcon icon="lucide:pencil" />
          </template>
          {{ t('common.edit') }}
        </Button>
        <Button
          v-if="props.canDelete"
          danger
          size="small"
          @click="emit('delete', record)"
        >
          <template #icon>
            <IconifyIcon icon="lucide:trash-2" />
          </template>
          {{ t('common.delete') }}
        </Button>
      </div>
    </div>

    <Empty v-if="!hasRecords" :image="Empty.PRESENTED_IMAGE_SIMPLE" />

    <Pagination
      v-if="hasRecords || props.total > 0"
      size="small"
      :current="props.page"
      :page-size="props.pageSize"
      :total="props.total"
      simple
      @change="
        (nextPage: number, nextPageSize: number) => {
          emit('pageChange', nextPage, nextPageSize);
        }
      "
    />
  </div>
</template>
