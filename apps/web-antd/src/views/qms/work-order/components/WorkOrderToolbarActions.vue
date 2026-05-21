<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import { Button, DatePicker, Segmented, Select, Space } from 'ant-design-vue';

import { useMobileViewport } from '#/hooks/useMobileViewport';

const props = defineProps<{
  canCreate: boolean;
  canDelete: boolean;
  checkedRowsLength: number;
  currentDate: Dayjs;
  currentDateMode: 'month' | 'week' | 'year';
  currentYear: number;
  dateModeOptions: Array<{ label: string; value: 'month' | 'week' | 'year' }>;
  isMobile?: boolean;
  showDashboard: boolean;
  yearOptions: Array<{ label: string; value: number }>;
}>();

const emit = defineEmits<{
  (e: 'add'): void;
  (e: 'batchDelete'): void;
  (e: 'reload'): void;
  (e: 'toggleDashboard'): void;
  (e: 'update:currentDate', value: Dayjs): void;
  (e: 'update:currentDateMode', value: 'month' | 'week' | 'year'): void;
  (e: 'update:currentYear', value: number): void;
}>();

const { t } = useI18n();
const { isMobile: viewportMobile } = useMobileViewport();
const isMobile = computed(() => props.isMobile ?? viewportMobile.value);
</script>

<template>
  <div class="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
    <Space :direction="isMobile ? 'vertical' : 'horizontal'" :size="8">
      <Button
        v-if="props.canCreate"
        shape="round"
        type="primary"
        @click="emit('add')"
      >
        <template #icon>
          <IconifyIcon icon="lucide:plus" />
        </template>
        {{ t('qms.workOrder.createWorkOrder') }}
      </Button>
      <Button
        v-if="props.checkedRowsLength > 0 && props.canDelete"
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
      <Button @click="emit('toggleDashboard')">
        <template #icon>
          <IconifyIcon
            :icon="
              props.showDashboard
                ? 'lucide:layout-panel-top'
                : 'lucide:layout-panel-off'
            "
          />
        </template>
        {{
          props.showDashboard
            ? t('qms.workOrder.hideChart')
            : t('qms.workOrder.showChart')
        }}
      </Button>
    </Space>
    <div
      class="flex w-full flex-col gap-2 lg:ml-2 lg:w-auto lg:flex-row lg:items-center"
    >
      <span class="text-xs text-gray-500"
        >{{ t('qms.workOrder.dateMode') }}:</span
      >
      <div class="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <Segmented
          :value="props.currentDateMode"
          :options="props.dateModeOptions"
          :block="isMobile"
          size="small"
          @update:value="
            (value) =>
              emit('update:currentDateMode', value as 'month' | 'week' | 'year')
          "
          @change="emit('reload')"
        />
        <Select
          v-if="props.currentDateMode === 'year'"
          :value="props.currentYear"
          :options="props.yearOptions"
          size="small"
          :class="isMobile ? 'w-full' : 'w-[100px]'"
          @update:value="(value) => emit('update:currentYear', Number(value))"
          @change="emit('reload')"
        />
        <DatePicker
          v-else
          :value="props.currentDate"
          :picker="props.currentDateMode"
          size="small"
          :class="isMobile ? 'w-full' : 'w-[140px]'"
          @update:value="(value) => emit('update:currentDate', value as Dayjs)"
          @change="emit('reload')"
        />
      </div>
    </div>
  </div>
</template>
