<script setup lang="ts">
import type { InspectionGridRow } from '../composables/useIssueGridOptions';
import type { InspectionIssue } from '../types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, Empty, Image, Pagination, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getSeverityColor,
  getSeverityLabel,
  getStatusColor,
  getStatusLabel,
} from '../utils/statusHelper';

export interface IssueMobileListProps {
  canDelete: boolean;
  canEdit: boolean;
  canManageIssue: (record: InspectionIssue) => boolean;
  canSettle: boolean;
  issues: InspectionGridRow[];
  page: number;
  pageSize: number;
  total: number;
}

const props = defineProps<IssueMobileListProps>();

const emit = defineEmits<{
  delete: [record: InspectionIssue];
  detail: [record: InspectionIssue];
  edit: [record: InspectionIssue];
  pageChange: [nextPage: number, nextPageSize: number];
  settle: [record: InspectionIssue];
}>();

const { t } = useI18n();

const hasIssues = computed(() => props.issues.length > 0);

function formatDate(value?: string) {
  if (!value) return '-';
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD') : value;
}

function displayValue(value?: null | number | string) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function displayNcNumber(value?: null | string) {
  return value || 'Unnumbered';
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="record in props.issues"
      :key="record.id"
      class="rounded border border-gray-100 bg-white px-3 py-2"
    >
      <div class="flex min-w-0 items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="truncate font-medium text-gray-900">
            {{ displayNcNumber(record.ncNumber) }}
          </div>
          <div class="truncate text-xs text-gray-500">
            {{ displayValue(record.partName) }}
            <span v-if="record.processName"> · {{ record.processName }}</span>
          </div>
          <div class="truncate text-xs text-gray-400">
            {{ displayValue(record.workOrderNumber) }} /
            {{ displayValue(record.projectName) }}
          </div>
        </div>
        <div class="flex shrink-0 flex-col items-end gap-1">
          <Tag :color="getStatusColor(record.status)">
            {{ getStatusLabel(record.status) }}
          </Tag>
          <Tag :color="getSeverityColor(record.severity)">
            {{ getSeverityLabel(record.severity) }}
          </Tag>
        </div>
      </div>

      <div v-if="record.description" class="mt-2 text-xs text-gray-600">
        {{ record.description }}
      </div>

      <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div class="min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.inspection.issues.reportDate') }}：
          </span>
          {{ formatDate(record.reportDate) }}
        </div>
        <div class="min-w-0 truncate text-right">
          <span class="text-gray-400">{{ t('qms.workOrder.quantity') }}：</span>
          {{ displayValue(record.quantity) }}
        </div>
        <div class="min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.inspection.issues.responsibleDepartment') }}：
          </span>
          {{ displayValue(record.responsibleDepartment) }}
        </div>
        <div class="min-w-0 truncate text-right">
          <span class="text-gray-400">
            {{ t('qms.inspection.issues.responsibleWelder') }}：
          </span>
          {{ displayValue(record.responsibleWelder) }}
        </div>
        <div class="col-span-2 min-w-0 truncate">
          <span class="text-gray-400">
            {{ t('qms.inspection.issues.defectType') }}：
          </span>
          {{ displayValue(record.defectType) }}
          <span v-if="record.defectSubtype"> / {{ record.defectSubtype }}</span>
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
        <Button
          v-if="props.canEdit && props.canManageIssue(record)"
          size="small"
          @click="emit('edit', record)"
        >
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
          v-if="props.canDelete && props.canManageIssue(record)"
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

    <Empty v-if="!hasIssues" :image="Empty.PRESENTED_IMAGE_SIMPLE" />

    <Pagination
      v-if="hasIssues || props.total > 0"
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
