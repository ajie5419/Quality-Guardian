<script lang="ts" setup>
import type { StatisticsData } from '../types';

import { useI18n } from '@vben/locales';

import { Button, Card, Statistic } from 'ant-design-vue';

defineProps<{
  loading?: boolean;
  statistics: StatisticsData;
}>();

const emit = defineEmits<{
  generateInsight: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Card size="small" class="mb-4 border-none bg-gray-50 shadow-sm">
    <div
      class="grid grid-cols-1 gap-3 text-center sm:grid-cols-2 lg:grid-cols-5"
    >
      <Statistic
        :title="t('qms.inspection.issues.totalCount')"
        :value="statistics.totalCount"
      />
      <Statistic
        :title="t('qms.inspection.issues.status.open')"
        :value="statistics.openCount"
        :value-style="{ color: '#cf1322' }"
      />
      <Statistic
        :title="t('qms.inspection.issues.status.closed')"
        :value="statistics.closedCount"
        :value-style="{ color: '#3f8600' }"
      />
      <Statistic
        :title="`${t('qms.inspection.issues.lossAmount')} (RMB)`"
        :value="statistics.totalLoss"
        prefix="¥"
        :precision="2"
      />
      <Button
        type="primary"
        shape="round"
        block
        :loading="loading"
        @click="emit('generateInsight')"
      >
        <span class="i-lucide-scroll-text mr-1"></span>
        {{ t('qms.inspection.issues.aiInsightReport') }}
      </Button>
    </div>
  </Card>
</template>
