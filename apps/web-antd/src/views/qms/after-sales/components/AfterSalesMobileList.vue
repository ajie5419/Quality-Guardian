<script setup lang="ts">
import type { AfterSalesGridRow } from '../composables/useAfterSalesGrid';

import type { QmsAfterSalesApi } from '#/api/qms/after-sales';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, Empty, Image, Pagination, Tag } from 'ant-design-vue';

import { QmsStatusTag } from '#/components/Qms';

export interface AfterSalesMobileListProps {
  canDelete: boolean;
  canEdit: boolean;
  canSettle: boolean;
  records: AfterSalesGridRow[];
  page: number;
  pageSize: number;
  total: number;
}

const props = defineProps<AfterSalesMobileListProps>();

const emit = defineEmits<{
  delete: [record: QmsAfterSalesApi.AfterSalesItem];
  detail: [record: QmsAfterSalesApi.AfterSalesItem];
  edit: [record: QmsAfterSalesApi.AfterSalesItem];
  pageChange: [nextPage: number, nextPageSize: number];
  settle: [record: QmsAfterSalesApi.AfterSalesItem];
}>();

const { t } = useI18n();
const hasRecords = computed(() => props.records.length > 0);

function displayValue(value?: null | number | string) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function moneyValue(value?: null | number) {
  if (value === undefined || value === null) return '0';
  return String(value);
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="record in props.records"
      :key="record.id"
      class="rounded border border-gray-100 bg-white px-3 py-2"
    >
      <div class="flex min-w-0 items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="truncate font-medium text-gray-900">
            {{ displayValue(record.workOrderNumber) }}
          </div>
          <div class="truncate text-xs text-gray-500">
            {{ displayValue(record.partName) }}
            <span v-if="record.projectName"> · {{ record.projectName }}</span>
          </div>
          <div class="truncate text-xs text-gray-400">
            {{ displayValue(record.customerName) }} /
            {{ displayValue(record.location) }}
          </div>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <QmsStatusTag :status="record.status" type="after-sales" />
          <Tag :color="record.isClaim ? 'red' : 'green'">
            {{ record.isClaim ? t('common.yes') : t('common.no') }}
          </Tag>
        </div>
      </div>

      <div v-if="record.issueDescription" class="mt-2 text-xs text-gray-600">
        {{ record.issueDescription }}
      </div>

      <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div class="min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.issueDate') }}：
          </span>
          {{ displayValue(record.issueDate) }}
        </div>
        <div class="min-w-0 truncate text-right">
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.quantity') }}：
          </span>
          {{ displayValue(record.quantity) }}
        </div>
        <div class="min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.responsibleDept') }}：
          </span>
          {{ displayValue(record.responsibleDept) }}
        </div>
        <div class="min-w-0 truncate text-right">
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.severity') }}：
          </span>
          {{ displayValue(record.severity) }}
        </div>
        <div class="col-span-2 min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.defectType') }}：
          </span>
          {{ displayValue(record.defectType) }}
          <span v-if="record.defectSubtype"> / {{ record.defectSubtype }}</span>
        </div>
        <div class="col-span-2 min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.materialCost') }}：
          </span>
          ¥{{ moneyValue(record.materialCost) }}
          <span class="mx-1 text-gray-300">/</span>
          <span class="text-gray-400">
            {{ t('qms.afterSales.form.laborTravelCost') }}：
          </span>
          ¥{{ moneyValue(record.laborTravelCost) }}
        </div>
      </div>

      <div v-if="record.photoThumbUrl" class="mt-2">
        <Image
          :width="56"
          :height="56"
          :src="record.photoThumbUrl"
          :fallback="record.photoExportUrl"
          class="rounded object-cover shadow-sm"
        />
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
          v-if="props.canSettle"
          size="small"
          @click="emit('settle', record)"
        >
          <template #icon>
            <IconifyIcon icon="lucide:book-check" />
          </template>
          {{ t('qms.inspection.issues.settleToKnowledge') }}
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
