<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { useI18n } from '@vben/locales';

import { Table, Tag } from 'ant-design-vue';

defineProps<{
  items: QmsMetrologyApi.MetrologyBorrowRecordItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', record: QmsMetrologyApi.MetrologyBorrowRecordItem): void;
}>();

const { t } = useI18n();

const columns = [
  {
    dataIndex: 'instrumentName',
    ellipsis: true,
    title: t('qms.metrology.instrumentName'),
    width: 160,
  },
  {
    dataIndex: 'instrumentCode',
    title: t('qms.metrology.instrumentCode'),
    width: 120,
  },
  {
    dataIndex: 'borrowerName',
    title: t('qms.metrology.borrow.borrowerName'),
    width: 100,
  },
  {
    dataIndex: 'expectedReturnAt',
    title: t('qms.metrology.borrow.expectedReturnAt'),
    width: 120,
  },
  {
    dataIndex: 'statusLabel',
    title: t('qms.metrology.borrow.status.label'),
    width: 110,
  },
  {
    dataIndex: 'action',
    title: t('common.action'),
    width: 90,
  },
];

function getStatusColor(status: QmsMetrologyApi.MetrologyBorrowRecordStatus) {
  switch (status) {
    case 'OVERDUE': {
      return 'red';
    }
    case 'RETURN_PENDING': {
      return 'orange';
    }
    case 'RETURNED': {
      return 'green';
    }
    default: {
      return 'blue';
    }
  }
}
</script>

<template>
  <div
    class="flex h-full min-h-[368px] flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
  >
    <div class="mb-3 text-sm font-medium text-gray-700">
      {{ t('qms.metrology.borrow.overview.upcomingTable') }}
    </div>
    <Table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="false"
      :row-key="
        (record: QmsMetrologyApi.MetrologyBorrowRecordItem) => record.id
      "
      :scroll="{ x: 610, y: 280 }"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'statusLabel'">
          <Tag :color="getStatusColor(record.status)">
            {{ record.statusLabel }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <a
            @click="
              emit('open', record as QmsMetrologyApi.MetrologyBorrowRecordItem)
            "
          >
            {{ t('common.detail') }}
          </a>
        </template>
      </template>
    </Table>
  </div>
</template>
