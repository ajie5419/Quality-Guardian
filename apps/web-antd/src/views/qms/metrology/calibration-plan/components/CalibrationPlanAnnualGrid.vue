<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { computed, h } from 'vue';

import { useI18n } from '@vben/locales';

import { Empty, Table, Tag, Tooltip } from 'ant-design-vue';

const props = defineProps<{
  items: QmsMetrologyApi.MetrologyCalibrationAnnualRow[];
  loading?: boolean;
}>();

const { t } = useI18n();

const monthColumns = computed(() =>
  Array.from({ length: 12 }, (_, index) => ({
    align: 'center' as const,
    customRender: ({
      record,
    }: {
      record: QmsMetrologyApi.MetrologyCalibrationAnnualRow;
    }) => {
      const cell = record.months[String(index + 1)];
      if (!cell?.planDay) {
        return '-';
      }

      let color = 'blue';
      if (cell.status === 'COMPLETED') {
        color = 'green';
      } else if (cell.status === 'OVERDUE') {
        color = 'red';
      }

      return h(
        Tooltip,
        { title: `${cell.planDay} / ${cell.statusLabel || '-'}` },
        {
          default: () => h(Tag, { color }, () => String(cell.planDay)),
        },
      );
    },
    dataIndex: String(index + 1),
    title: String(index + 1),
    width: 72,
  })),
);

const columns = computed(() => [
  {
    dataIndex: 'orderNo',
    title: t('qms.metrology.orderNo'),
    width: 90,
  },
  {
    dataIndex: 'instrumentName',
    title: t('qms.metrology.instrumentName'),
    width: 180,
  },
  {
    dataIndex: 'instrumentCode',
    title: t('qms.metrology.instrumentCode'),
    width: 160,
  },
  {
    dataIndex: 'model',
    title: t('qms.metrology.model'),
    width: 140,
  },
  ...monthColumns.value,
]);
</script>

<template>
  <Table
    v-if="props.items.length > 0"
    :columns="columns"
    :data-source="props.items"
    :loading="props.loading"
    :pagination="false"
    :row-key="
      (record: QmsMetrologyApi.MetrologyCalibrationAnnualRow) =>
        record.instrumentId
    "
    :scroll="{ x: 1500 }"
    size="middle"
  />
  <Empty
    v-else
    :description="t('qms.metrology.calibrationPlan.empty')"
    class="py-10"
  />
</template>
