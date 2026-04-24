<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { useI18n } from '@vben/locales';

import { Table, Tag } from 'ant-design-vue';

defineProps<{
  items: QmsMetrologyApi.MetrologyCalibrationPlanItem[];
  loading: boolean;
}>();

const { t } = useI18n();

const columns = [
  {
    dataIndex: 'instrumentName',
    ellipsis: true,
    title: t('qms.metrology.instrumentName'),
    width: 180,
  },
  {
    dataIndex: 'instrumentCode',
    title: t('qms.metrology.instrumentCode'),
    width: 120,
  },
  { dataIndex: 'usingUnit', title: t('qms.metrology.usingUnit'), width: 110 },
  {
    dataIndex: 'plannedDate',
    title: t('qms.metrology.calibrationPlan.plannedDate'),
    width: 120,
  },
  {
    dataIndex: 'statusLabel',
    title: t('qms.metrology.calibrationPlan.status.label'),
    width: 100,
  },
];

function getStatusColor(
  status: QmsMetrologyApi.MetrologyCalibrationPlanStatus,
) {
  switch (status) {
    case 'COMPLETED': {
      return 'green';
    }
    case 'OVERDUE': {
      return 'red';
    }
    default: {
      return 'blue';
    }
  }
}
</script>

<template>
  <div
    class="flex h-full min-h-[408px] flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
  >
    <div class="mb-3 text-sm font-medium text-gray-700">
      {{ t('qms.metrology.calibrationPlan.overview.upcomingTable') }}
    </div>
    <Table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="false"
      :row-key="
        (record: QmsMetrologyApi.MetrologyCalibrationPlanItem) => record.id
      "
      :scroll="{ x: 630, y: 320 }"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'statusLabel'">
          <Tag :color="getStatusColor(record.status)">
            {{ record.statusLabel }}
          </Tag>
        </template>
      </template>
    </Table>
  </div>
</template>
