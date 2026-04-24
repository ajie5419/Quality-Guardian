<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { useI18n } from '@vben/locales';

const props = defineProps<{
  loading: boolean;
  summary: QmsMetrologyApi.MetrologyCalibrationPlanOverview['summary'];
}>();

const emit = defineEmits<{
  (
    e: 'open',
    payload: {
      month?: number;
      status?: QmsMetrologyApi.MetrologyCalibrationPlanStatus;
    },
  ): void;
}>();

const { t } = useI18n();

const cards: Array<{
  colorClass: string;
  key:
    | 'completedCount'
    | 'currentMonthCount'
    | 'overdueCount'
    | 'totalCount'
    | 'upcomingCount';
  label: string;
  payload: {
    month?: number;
    status?: QmsMetrologyApi.MetrologyCalibrationPlanStatus;
  };
}> = [
  {
    colorClass: 'text-slate-800',
    key: 'totalCount',
    label: t('qms.metrology.calibrationPlan.overview.totalCount'),
    payload: {},
  },
  {
    colorClass: 'text-blue-600',
    key: 'currentMonthCount',
    label: t('qms.metrology.calibrationPlan.overview.currentMonthCount'),
    payload: { month: new Date().getMonth() + 1 },
  },
  {
    colorClass: 'text-green-600',
    key: 'completedCount',
    label: t('qms.metrology.calibrationPlan.overview.completedCount'),
    payload: { status: 'COMPLETED' },
  },
  {
    colorClass: 'text-red-600',
    key: 'overdueCount',
    label: t('qms.metrology.calibrationPlan.overview.overdueCount'),
    payload: { status: 'OVERDUE' },
  },
  {
    colorClass: 'text-amber-600',
    key: 'upcomingCount',
    label: t('qms.metrology.calibrationPlan.overview.upcomingCount'),
    payload: {},
  },
];
</script>

<template>
  <div class="grid grid-cols-2 gap-3 xl:grid-cols-5">
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
