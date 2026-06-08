<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { EchartsUIType } from '@vben/plugins/echarts';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';
import { Button, DatePicker, Segmented } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getInspectionRequestStatsWithParams } from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import {
  buildDailyTrendChartOptions,
  buildHistoryInspectorChartOptions,
  buildHistoryReinspectionChartOptions,
  buildHistoryTeamChartOptions,
} from './chart-options';
import InspectionDashboardDetailDrawer from './components/InspectionDashboardDetailDrawer.vue';
import InspectionDashboardHistoryCard from './components/InspectionDashboardHistoryCard.vue';
import InspectionDashboardHistoryList from './components/InspectionDashboardHistoryList.vue';
import InspectionDashboardRankCards from './components/InspectionDashboardRankCards.vue';
import InspectionDashboardStatsCards from './components/InspectionDashboardStatsCards.vue';
import InspectionDashboardTrendCard from './components/InspectionDashboardTrendCard.vue';

defineOptions({ name: 'QMSInspectionDashboard' });

const { handleApiError } = useErrorHandler();
const loading = ref(false);
const detailDrawerOpen = ref(false);
const detailDrawerTeamSource = ref<'current' | 'history'>('current');
const detailDrawerType = ref<
  'inspector' | 'reinspection' | 'supplier' | 'supplierReinspection' | 'team'
>('team');
const rangeMode = ref<'custom' | 'halfYear' | 'month' | 'quarter' | 'year'>(
  'month',
);
const customRange = ref<[Dayjs, Dayjs]>();
const historyStatsView = ref<'inspector' | 'reinspection' | 'team'>('team');
const dailyTrendChartRef = ref<EchartsUIType>();
const historyChartRef = ref<EchartsUIType>();
const {
  getChartInstance: getDailyTrendChartInstance,
  renderEcharts: renderDailyTrendEcharts,
} = useEcharts(dailyTrendChartRef);
const {
  getChartInstance: getHistoryChartInstance,
  renderEcharts: renderHistoryEcharts,
} = useEcharts(historyChartRef);

const rangeModeOptions = [
  { label: '本月', value: 'month' },
  { label: '近季度', value: 'quarter' },
  { label: '近半年', value: 'halfYear' },
  { label: '本年', value: 'year' },
  { label: '自定义', value: 'custom' },
];

const historyStatsOptions: Array<{
  label: string;
  value: 'inspector' | 'reinspection' | 'team';
}> = [
  { label: '班组报检', value: 'team' },
  { label: '班组复检率', value: 'reinspection' },
  { label: '检验效率', value: 'inspector' },
];

const requestStats = ref({
  byInspector: [] as Array<{ count: number; inspector: string }>,
  bySupplier: [] as Array<{ count: number; team: string }>,
  byTeam: [] as Array<{ count: number; team: string }>,
  dailyTrend: [] as Array<{
    closedCount: number;
    date: string;
    submittedCount: number;
  }>,
  historyByInspector: [] as Array<{
    averageTaskMinutes: number;
    completedTaskCount: number;
    inspector: string;
  }>,
  historyByTeam: [] as Array<{ count: number; team: string }>,
  inspectorStatus: [] as Array<{
    activeTaskCount: number;
    averageTaskMinutes: number;
    completedTaskCount: number;
    currentTaskMinutes: number;
    inspector: string;
    status: 'BUSY' | 'IDLE';
  }>,
  pendingDispatchCount: 0,
  pendingInspectionCount: 0,
  reinspectionRateBySupplier: [] as Array<{
    inspectedCount: number;
    reinspectionCount: number;
    reinspectionRate: number;
    submittedCount: number;
    team: string;
  }>,
  reinspectionRateByTeam: [] as Array<{
    inspectedCount: number;
    reinspectionCount: number;
    reinspectionRate: number;
    submittedCount: number;
    team: string;
  }>,
  todayClosedCount: 0,
  todaySubmittedCount: 0,
});

const dashboardRangeLabel = computed(() => {
  if (rangeMode.value === 'custom' && customRange.value) {
    return `${customRange.value[0].format('YYYY-MM-DD')} 至 ${customRange.value[1].format('YYYY-MM-DD')}`;
  }
  const map = {
    custom: '自定义范围',
    halfYear: '近半年',
    month: '本月',
    quarter: '近季度',
    year: '本年',
  };
  return map[rangeMode.value] || '本月';
});

const sortedTeamStats = computed(() =>
  [...requestStats.value.byTeam].sort((a, b) => b.count - a.count),
);
const topTeamStats = computed(() => sortedTeamStats.value.slice(0, 12));
const maxTeamCount = computed(() =>
  Math.max(1, ...topTeamStats.value.map((item) => item.count)),
);

const sortedSupplierStats = computed(() =>
  [...requestStats.value.bySupplier].sort((a, b) => b.count - a.count),
);
const topSupplierStats = computed(() => sortedSupplierStats.value.slice(0, 12));
const maxSupplierCount = computed(() =>
  Math.max(1, ...topSupplierStats.value.map((item) => item.count)),
);

const topSupplierReinspectionStats = computed(() =>
  [...requestStats.value.reinspectionRateBySupplier].slice(0, 8),
);

const hasDailyTrendData = computed(() =>
  requestStats.value.dailyTrend.some(
    (item) => item.submittedCount > 0 || item.closedCount > 0,
  ),
);

const averageDailySubmittedCount = computed(() => {
  const days = requestStats.value.dailyTrend.length;
  if (days === 0) return 0;
  return Math.round((requestStats.value.todaySubmittedCount / days) * 10) / 10;
});

const busiestDailyTrend = computed(
  () =>
    [...requestStats.value.dailyTrend].sort(
      (a, b) => b.submittedCount - a.submittedCount,
    )[0],
);

const topHistoryTeamStats = computed(() =>
  [...requestStats.value.historyByTeam]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8),
);

const topHistoryInspectorStats = computed(() =>
  [...requestStats.value.historyByInspector]
    .sort((a, b) => {
      const countDiff = b.completedTaskCount - a.completedTaskCount;
      if (countDiff !== 0) return countDiff;
      return a.averageTaskMinutes - b.averageTaskMinutes;
    })
    .slice(0, 8),
);

const topReinspectionStats = computed(() =>
  [...requestStats.value.reinspectionRateByTeam].slice(0, 8),
);

const historyTeamChartRows = computed(() =>
  [...requestStats.value.historyByTeam]
    .filter((item) => item.team)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .reverse(),
);

const historyInspectorChartRows = computed(() =>
  [...requestStats.value.historyByInspector]
    .filter((item) => item.inspector)
    .sort((a, b) => b.completedTaskCount - a.completedTaskCount)
    .slice(0, 10)
    .reverse(),
);

const reinspectionChartRows = computed(() =>
  [...requestStats.value.reinspectionRateByTeam]
    .filter((item) => item.team)
    .sort((a, b) => b.reinspectionRate - a.reinspectionRate)
    .slice(0, 10)
    .reverse(),
);

const hasHistoryStatsData = computed(() => {
  if (historyStatsView.value === 'team') {
    return historyTeamChartRows.value.length > 0;
  }
  if (historyStatsView.value === 'reinspection') {
    return reinspectionChartRows.value.length > 0;
  }
  return historyInspectorChartRows.value.length > 0;
});

function minutesText(value?: number) {
  const totalMinutes = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function openDetailDrawer(
  type:
    | 'inspector'
    | 'reinspection'
    | 'supplier'
    | 'supplierReinspection'
    | 'team',
  teamSource: 'current' | 'history' = 'current',
) {
  detailDrawerType.value = type;
  detailDrawerTeamSource.value = teamSource;
  detailDrawerOpen.value = true;
}

function renderHistoryStatsChart() {
  if (!historyChartRef.value || !hasHistoryStatsData.value) {
    getHistoryChartInstance()?.clear();
    return;
  }

  if (historyStatsView.value === 'team') {
    renderHistoryEcharts(
      buildHistoryTeamChartOptions(historyTeamChartRows.value),
    );
    return;
  }

  if (historyStatsView.value === 'reinspection') {
    renderHistoryEcharts(
      buildHistoryReinspectionChartOptions(reinspectionChartRows.value),
    );
    return;
  }

  renderHistoryEcharts(
    buildHistoryInspectorChartOptions(historyInspectorChartRows.value),
  );
}

function renderDailyTrendChart() {
  if (!dailyTrendChartRef.value || !hasDailyTrendData.value) {
    getDailyTrendChartInstance()?.clear();
    return;
  }

  renderDailyTrendEcharts(
    buildDailyTrendChartOptions(requestStats.value.dailyTrend),
  );
}

function scheduleRenderDailyTrendChart() {
  void nextTick(() => {
    renderDailyTrendChart();
  });
}

function scheduleRenderHistoryStatsChart() {
  void nextTick(() => {
    renderHistoryStatsChart();
  });
}

async function loadStats() {
  loading.value = true;
  try {
    const params =
      rangeMode.value === 'custom' && customRange.value
        ? {
            endDate: customRange.value[1].format('YYYY-MM-DD'),
            startDate: customRange.value[0].format('YYYY-MM-DD'),
          }
        : {
            period: rangeMode.value === 'custom' ? 'month' : rangeMode.value,
          };
    requestStats.value = await getInspectionRequestStatsWithParams(params);
    scheduleRenderDailyTrendChart();
    scheduleRenderHistoryStatsChart();
  } catch (error) {
    handleApiError(error, '加载报检看板失败');
  } finally {
    loading.value = false;
  }
}

watch(
  [
    () => requestStats.value.dailyTrend,
    historyStatsView,
    historyTeamChartRows,
    historyInspectorChartRows,
    reinspectionChartRows,
  ],
  () => {
    scheduleRenderDailyTrendChart();
    scheduleRenderHistoryStatsChart();
  },
  { deep: true },
);

watch(rangeMode, () => {
  if (rangeMode.value !== 'custom') {
    customRange.value = undefined;
    void loadStats();
  }
});

watch(customRange, () => {
  if (rangeMode.value === 'custom' && customRange.value) {
    void loadStats();
  }
});

onMounted(() => {
  customRange.value = [dayjs().startOf('month'), dayjs()];
  void loadStats();
});

tryOnUnmounted(() => {
  getDailyTrendChartInstance()?.dispose();
  getHistoryChartInstance()?.dispose();
});
</script>

<template>
  <Page content-class="p-0">
    <QmsPageShell>
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="m-0 text-lg font-semibold text-gray-900">报检看板</h2>
            <p class="m-0 mt-1 text-sm text-gray-500">
              {{ dashboardRangeLabel }}报检、复检和检验效率统计
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Segmented v-model:value="rangeMode" :options="rangeModeOptions" />
            <DatePicker.RangePicker
              v-if="rangeMode === 'custom'"
              v-model:value="customRange"
              :allow-clear="false"
              class="w-[260px]"
            />
            <Button :loading="loading" @click="loadStats">
              <template #icon>
                <IconifyIcon icon="ant-design:reload-outlined" />
              </template>
              刷新
            </Button>
          </div>
        </div>

        <InspectionDashboardStatsCards
          :average-daily-submitted-count="averageDailySubmittedCount"
          :busiest-daily-trend="busiestDailyTrend"
          :range-label="dashboardRangeLabel"
          :stats="requestStats"
        />

        <InspectionDashboardTrendCard
          :has-data="hasDailyTrendData"
          :range-label="dashboardRangeLabel"
        >
          <EchartsUI ref="dailyTrendChartRef" class="h-[300px] w-full" />
        </InspectionDashboardTrendCard>

        <InspectionDashboardRankCards
          :max-supplier-count="maxSupplierCount"
          :max-team-count="maxTeamCount"
          :reinspection-stats-total="requestStats.reinspectionRateByTeam.length"
          :supplier-reinspection-stats-total="
            requestStats.reinspectionRateBySupplier.length
          "
          :supplier-stats-total="requestStats.bySupplier.length"
          :team-stats-total="requestStats.byTeam.length"
          :top-reinspection-stats="topReinspectionStats"
          :top-supplier-reinspection-stats="topSupplierReinspectionStats"
          :top-supplier-stats="topSupplierStats"
          :top-team-stats="topTeamStats"
          @open-detail="openDetailDrawer"
        />

        <InspectionDashboardHistoryCard
          v-model:view="historyStatsView"
          :has-data="hasHistoryStatsData"
          :options="historyStatsOptions"
          :range-label="dashboardRangeLabel"
          @open-detail="
            openDetailDrawer(
              historyStatsView,
              historyStatsView === 'team' ? 'history' : 'current',
            )
          "
        >
          <template #chart>
            <EchartsUI
              v-if="hasHistoryStatsData"
              ref="historyChartRef"
              class="h-[300px] w-full"
            />
            <div
              v-else
              class="flex h-[300px] items-center justify-center text-sm text-gray-400"
            >
              暂无历史统计数据
            </div>
          </template>

          <template #list>
            <InspectionDashboardHistoryList
              :inspector-stats="topHistoryInspectorStats"
              :minutes-text="minutesText"
              :reinspection-stats="topReinspectionStats"
              :team-stats="topHistoryTeamStats"
              :view="historyStatsView"
            />
          </template>
        </InspectionDashboardHistoryCard>
      </div>
    </QmsPageShell>

    <InspectionDashboardDetailDrawer
      v-model:open="detailDrawerOpen"
      :inspector-stats="requestStats.historyByInspector"
      :range-label="dashboardRangeLabel"
      :reinspection-stats="requestStats.reinspectionRateByTeam"
      :supplier-reinspection-stats="requestStats.reinspectionRateBySupplier"
      :supplier-stats="requestStats.bySupplier"
      :team-stats="
        detailDrawerTeamSource === 'history'
          ? requestStats.historyByTeam
          : requestStats.byTeam
      "
      :type="detailDrawerType"
    />
  </Page>
</template>
