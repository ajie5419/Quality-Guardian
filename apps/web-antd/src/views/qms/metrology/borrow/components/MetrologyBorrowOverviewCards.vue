<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { useI18n } from '@vben/locales';

const props = defineProps<{
  loading: boolean;
  summary: QmsMetrologyApi.MetrologyBorrowOverview['summary'];
}>();

const emit = defineEmits<{
  (
    e: 'open',
    payload: { status?: QmsMetrologyApi.MetrologyBorrowRecordStatus },
  ): void;
}>();

const { t } = useI18n();

const cards: Array<{
  colorClass: string;
  key:
    | 'borrowedCount'
    | 'overdueCount'
    | 'todayBorrowedCount'
    | 'todayReturnedCount'
    | 'totalCount'
    | 'upcomingReturnCount';
  label: string;
  payload: { status?: QmsMetrologyApi.MetrologyBorrowRecordStatus };
}> = [
  {
    colorClass: 'text-slate-800',
    key: 'totalCount',
    label: t('qms.metrology.borrow.overview.totalCount'),
    payload: {},
  },
  {
    colorClass: 'text-blue-600',
    key: 'borrowedCount',
    label: t('qms.metrology.borrow.overview.borrowedCount'),
    payload: { status: 'BORROWED' },
  },
  {
    colorClass: 'text-red-600',
    key: 'overdueCount',
    label: t('qms.metrology.borrow.overview.overdueCount'),
    payload: { status: 'OVERDUE' },
  },
  {
    colorClass: 'text-emerald-600',
    key: 'todayBorrowedCount',
    label: t('qms.metrology.borrow.overview.todayBorrowedCount'),
    payload: {},
  },
  {
    colorClass: 'text-teal-600',
    key: 'todayReturnedCount',
    label: t('qms.metrology.borrow.overview.todayReturnedCount'),
    payload: { status: 'RETURNED' },
  },
  {
    colorClass: 'text-amber-600',
    key: 'upcomingReturnCount',
    label: t('qms.metrology.borrow.overview.upcomingReturnCount'),
    payload: {},
  },
];
</script>

<template>
  <div class="grid grid-cols-2 gap-3 xl:grid-cols-6">
    <button
      v-for="card in cards"
      :key="card.key"
      type="button"
      class="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
      @click="emit('open', card.payload)"
    >
      <div class="text-xs font-medium tracking-wide text-gray-500">
        {{ card.label }}
      </div>
      <div
        class="mt-3 text-3xl font-extrabold leading-none md:text-4xl"
        :class="card.colorClass"
      >
        {{ props.loading ? '-' : Number(props.summary[card.key] || 0) }}
      </div>
    </button>
  </div>
</template>
