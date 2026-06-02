<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, DatePicker, Select } from 'ant-design-vue';

export interface AfterSalesToolbarActionsProps {
  canAddChart: boolean;
  canCreate: boolean;
  canDelete: boolean;
  checkedCount: number;
  dateMode: 'month' | 'week' | 'year';
  dateModeOptions: Array<{ label: string; value: 'month' | 'week' | 'year' }>;
  dateValue: Dayjs;
  isAdmin: boolean;
  isMobile: boolean;
  showCharts: boolean;
  year: number;
  yearOptions: Array<{ label: string; value: number }>;
}

const props = defineProps<AfterSalesToolbarActionsProps>();

const emit = defineEmits<{
  addChart: [];
  batchDelete: [];
  create: [];
  saveSystemDefault: [];
  toggleCharts: [];
  'update:dateMode': [value: 'month' | 'week' | 'year'];
  'update:dateValue': [value: Dayjs];
  'update:year': [value: number];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <Button
      v-if="props.canCreate"
      shape="round"
      type="primary"
      @click="emit('create')"
    >
      <template #icon>
        <IconifyIcon icon="lucide:plus" />
      </template>
      {{ t('qms.inspection.issues.createIssue') }}
    </Button>
    <Button
      v-if="props.checkedCount > 0 && props.canDelete"
      danger
      shape="round"
      type="primary"
      @click="emit('batchDelete')"
    >
      <template #icon>
        <IconifyIcon icon="lucide:trash-2" />
      </template>
      {{ t('common.batchDelete') }}
    </Button>
    <Button v-if="props.canAddChart" shape="round" @click="emit('addChart')">
      <template #icon>
        <IconifyIcon icon="lucide:plus" />
      </template>
      新增图表
    </Button>
    <Button shape="round" @click="emit('toggleCharts')">
      <template #icon>
        <IconifyIcon icon="lucide:bar-chart-3" />
      </template>
      {{ props.showCharts ? t('common.hideChart') : t('common.showChart') }}
    </Button>
    <div
      class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
    >
      <span class="text-xs text-gray-500">
        {{ t('qms.afterSales.dateMode.label') }}:
      </span>
      <Select
        :value="props.dateMode"
        :options="props.dateModeOptions"
        :class="props.isMobile ? 'w-full' : 'w-[100px]'"
        size="small"
        @update:value="
          (value) => emit('update:dateMode', value as 'month' | 'week' | 'year')
        "
      />
      <Select
        v-if="props.dateMode === 'year'"
        :value="props.year"
        :options="props.yearOptions"
        :class="props.isMobile ? 'w-full' : 'w-[100px]'"
        size="small"
        @update:value="(value) => emit('update:year', Number(value))"
      />
      <DatePicker
        v-else
        :value="props.dateValue"
        :allow-clear="false"
        :picker="props.dateMode"
        :class="props.isMobile ? 'w-full' : 'w-[140px]'"
        size="small"
        @update:value="(value) => emit('update:dateValue', value as Dayjs)"
      />
    </div>
    <Button
      v-if="props.isAdmin"
      shape="round"
      type="link"
      @click="emit('saveSystemDefault')"
    >
      <template #icon>
        <IconifyIcon icon="lucide:save" />
      </template>
      存为系统默认
    </Button>
  </div>
</template>
