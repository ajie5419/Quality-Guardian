<script lang="ts" setup>
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { useI18n } from '@vben/locales';

const props = defineProps<{
  loading: boolean;
  overview: QmsMetrologyApi.MetrologyOverview;
}>();

const { t } = useI18n();

const cards: Array<{
  colorClass: string;
  key:
    | 'disabledCount'
    | 'expiredCount'
    | 'expiringSoonCount'
    | 'totalCount'
    | 'validCount';
  label: string;
}> = [
  {
    colorClass: 'text-slate-800',
    key: 'totalCount',
    label: t('qms.metrology.overview.totalCount'),
  },
  {
    colorClass: 'text-green-600',
    key: 'validCount',
    label: t('qms.metrology.overview.validCount'),
  },
  {
    colorClass: 'text-red-600',
    key: 'expiredCount',
    label: t('qms.metrology.overview.expiredCount'),
  },
  {
    colorClass: 'text-amber-600',
    key: 'expiringSoonCount',
    label: t('qms.metrology.overview.expiringSoonCount'),
  },
  {
    colorClass: 'text-gray-500',
    key: 'disabledCount',
    label: t('qms.metrology.overview.disabledCount'),
  },
];
</script>

<template>
  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
    <div
      v-for="card in cards"
      :key="card.key"
      class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div class="text-sm text-gray-500">{{ card.label }}</div>
      <div
        class="mt-3 text-3xl font-extrabold leading-none"
        :class="card.colorClass"
      >
        {{ props.loading ? '-' : Number(props.overview[card.key] || 0) }}
      </div>
      <div
        v-if="card.key === 'expiringSoonCount'"
        class="mt-2 text-xs text-gray-400"
      >
        {{ t('qms.metrology.overview.expiringSoonHint') }}
      </div>
    </div>
  </div>
</template>
