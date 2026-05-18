<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { EchartsUIType } from '@vben/plugins/echarts';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';
import { Button, Card, DatePicker, Segmented } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getInspectionRequestStatsWithParams } from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';

defineOptions({ name: 'QMSInspectionDashboard' });

const { handleApiError } = useErrorHandler();
const loading = ref(false);
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

const historyStatsOptions = [
  { label: '班组报检', value: 'team' },
  { label: '班组复检率', value: 'reinspection' },
  { label: '检验效率', value: 'inspector' },
];

const requestStats = ref({
  byInspector: [] as Array<{ count: number; inspector: string }>,
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

function renderHistoryStatsChart() {
  if (!historyChartRef.value || !hasHistoryStatsData.value) {
    getHistoryChartInstance()?.clear();
    return;
  }

  if (historyStatsView.value === 'team') {
    const rows = historyTeamChartRows.value;
    renderHistoryEcharts({
      grid: { bottom: 16, left: 16, right: 18, top: 12, containLabel: true },
      series: [
        {
          barMaxWidth: 20,
          data: rows.map((item) => item.count),
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: '#1677ff',
          },
          type: 'bar',
        },
      ],
      tooltip: { trigger: 'axis' },
      xAxis: { axisLabel: { color: '#6b7280' }, type: 'value' },
      yAxis: {
        axisLabel: { color: '#374151' },
        data: rows.map((item) => item.team || '未填写'),
        type: 'category',
      },
    });
    return;
  }

  if (historyStatsView.value === 'reinspection') {
    const rows = reinspectionChartRows.value;
    renderHistoryEcharts({
      grid: { bottom: 16, left: 16, right: 24, top: 12, containLabel: true },
      series: [
        {
          barMaxWidth: 20,
          data: rows.map((item) => item.reinspectionRate),
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: '#fa8c16',
          },
          type: 'bar',
        },
      ],
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: {
          color: '#6b7280',
          formatter: (value: number) => `${value}%`,
        },
        type: 'value',
      },
      yAxis: {
        axisLabel: { color: '#374151' },
        data: rows.map((item) => item.team || '未填写'),
        type: 'category',
      },
    });
    return;
  }

  const rows = historyInspectorChartRows.value;
  renderHistoryEcharts({
    grid: { bottom: 22, left: 16, right: 18, top: 36, containLabel: true },
    legend: { top: 0 },
    series: [
      {
        barMaxWidth: 20,
        data: rows.map((item) => item.completedTaskCount),
        itemStyle: { borderRadius: [4, 4, 0, 0], color: '#13c2c2' },
        name: '完成数量',
        type: 'bar',
      },
      {
        data: rows.map((item) => item.averageTaskMinutes),
        name: '平均时长',
        smooth: true,
        type: 'line',
        yAxisIndex: 1,
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: { color: '#374151' },
      data: rows.map((item) => item.inspector || '未记录'),
      type: 'category',
    },
    yAxis: [
      {
        axisLabel: { color: '#6b7280' },
        name: '完成',
        type: 'value',
      },
      {
        axisLabel: {
          color: '#6b7280',
          formatter: (value: number) => `${value}分`,
        },
        name: '均时长',
        type: 'value',
      },
    ],
  });
}

function renderDailyTrendChart() {
  if (!dailyTrendChartRef.value || !hasDailyTrendData.value) {
    getDailyTrendChartInstance()?.clear();
    return;
  }

  const rows = requestStats.value.dailyTrend;
  renderDailyTrendEcharts({
    grid: { bottom: 22, left: 12, right: 18, top: 36, containLabel: true },
    legend: { top: 0 },
    series: [
      {
        barMaxWidth: 18,
        data: rows.map((item) => item.submittedCount),
        itemStyle: { borderRadius: [4, 4, 0, 0], color: '#1677ff' },
        name: '报检数量',
        type: 'bar',
      },
      {
        data: rows.map((item) => item.closedCount),
        itemStyle: { color: '#52c41a' },
        name: '完成数量',
        smooth: true,
        symbolSize: 6,
        type: 'line',
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: {
        color: '#6b7280',
        formatter: (value: string) => dayjs(value).format('MM-DD'),
      },
      data: rows.map((item) => item.date),
      type: 'category',
    },
    yAxis: {
      axisLabel: { color: '#6b7280' },
      minInterval: 1,
      type: 'value',
    },
  });
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
  <Page content-class="p-4">
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

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded border bg-white p-4">
          <div class="text-sm font-medium text-gray-600">报检数量</div>
          <div class="mt-3 text-3xl font-semibold text-blue-900">
            {{ requestStats.todaySubmittedCount }}
          </div>
          <div class="mt-2 flex items-center justify-between text-xs">
            <span class="text-gray-500">{{ dashboardRangeLabel }}</span>
            <span class="text-blue-700">
              待派单 {{ requestStats.pendingDispatchCount }}
            </span>
          </div>
        </div>
        <div class="rounded border bg-white p-4">
          <div class="text-sm font-medium text-gray-600">完成数量</div>
          <div class="mt-3 text-3xl font-semibold text-green-900">
            {{ requestStats.todayClosedCount }}
          </div>
          <div class="mt-2 flex items-center justify-between text-xs">
            <span class="text-gray-500">待检验任务</span>
            <span class="text-green-700">
              {{ requestStats.pendingInspectionCount }}
            </span>
          </div>
        </div>
        <div class="rounded border bg-white p-4">
          <div class="text-sm font-medium text-gray-600">平均每日报检</div>
          <div class="mt-3 text-3xl font-semibold text-cyan-900">
            {{ averageDailySubmittedCount }}
          </div>
          <div class="mt-2 text-xs text-gray-500">
            统计 {{ requestStats.dailyTrend.length }} 天
          </div>
        </div>
        <div class="rounded border bg-white p-4">
          <div class="text-sm font-medium text-gray-600">最高日峰值</div>
          <div class="mt-3 text-3xl font-semibold text-orange-900">
            {{ busiestDailyTrend?.submittedCount || 0 }}
          </div>
          <div class="mt-2 text-xs text-gray-500">
            {{ busiestDailyTrend?.date || dashboardRangeLabel }}
          </div>
        </div>
      </div>

      <Card :body-style="{ padding: '16px' }">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-medium text-gray-900">每日报检数量</div>
            <div class="mt-1 text-xs text-gray-500">
              按报检日期汇总，完成数量作为对比线
            </div>
          </div>
          <span class="text-xs text-gray-500">{{ dashboardRangeLabel }}</span>
        </div>
        <div class="min-h-[320px] rounded bg-gray-50 p-3">
          <EchartsUI
            v-if="hasDailyTrendData"
            ref="dailyTrendChartRef"
            class="h-[300px] w-full"
          />
          <div
            v-else
            class="flex h-[300px] items-center justify-center text-sm text-gray-400"
          >
            当前范围暂无报检趋势数据
          </div>
        </div>
      </Card>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card :body-style="{ padding: '16px' }">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900">班组报检排行</div>
              <div class="mt-1 text-xs text-gray-500">
                共 {{ requestStats.byTeam.length }} 个班组
              </div>
            </div>
            <span class="text-xs text-gray-500">前 12 项</span>
          </div>
          <div v-if="topTeamStats.length > 0" class="space-y-3">
            <div
              v-for="item in topTeamStats"
              :key="item.team"
              class="space-y-1"
            >
              <div class="flex items-start justify-between gap-3 text-sm">
                <span class="break-words text-gray-800">
                  {{ item.team || '未填写' }}
                </span>
                <span class="shrink-0 font-semibold text-gray-900">
                  {{ item.count }}
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded bg-gray-100">
                <div
                  class="h-full rounded bg-blue-500"
                  :style="{ width: `${(item.count / maxTeamCount) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
          <div v-else class="py-10 text-center text-sm text-gray-400">
            当前范围暂无班组报检
          </div>
        </Card>

        <Card :body-style="{ padding: '16px' }">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900">班组复检率</div>
              <div class="mt-1 text-xs text-gray-500">
                只按已完成检验或已产生不合格项的任务计算
              </div>
            </div>
            <span class="text-xs text-gray-500">
              {{ requestStats.reinspectionRateByTeam.length }} 个班组
            </span>
          </div>
          <div v-if="topReinspectionStats.length > 0" class="space-y-2">
            <div
              v-for="(item, index) in topReinspectionStats"
              :key="item.team"
              class="rounded bg-gray-50 px-3 py-2"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-800">
                    <span class="mr-2 text-xs text-gray-400">
                      {{ index + 1 }}
                    </span>
                    <span class="break-words">{{ item.team || '未填写' }}</span>
                  </div>
                  <div class="mt-1 text-xs text-gray-500">
                    复检 {{ item.reinspectionCount }} / 已检
                    {{ item.inspectedCount }}
                    <span class="text-gray-400">
                      · 报检 {{ item.submittedCount }}
                    </span>
                  </div>
                </div>
                <span class="shrink-0 text-base font-semibold text-orange-600">
                  {{ item.reinspectionRate }}%
                </span>
              </div>
            </div>
          </div>
          <div v-else class="py-10 text-center text-sm text-gray-400">
            当前范围暂无复检率数据
          </div>
        </Card>
      </div>

      <Card :body-style="{ padding: '16px' }">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-medium text-gray-900">历史统计</div>
            <div class="mt-1 text-xs text-gray-500">
              {{
                dashboardRangeLabel
              }}班组报检、复检率、检验员完成数量与平均任务时长
            </div>
          </div>
          <Segmented
            v-model:value="historyStatsView"
            :options="historyStatsOptions"
          />
        </div>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div class="min-h-[320px] rounded bg-gray-50 p-3">
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
          </div>

          <div class="space-y-2">
            <template v-if="historyStatsView === 'team'">
              <div
                v-for="(item, index) in topHistoryTeamStats"
                :key="item.team"
                class="flex items-center justify-between rounded bg-gray-50 px-3 py-2"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <span class="w-5 text-xs text-gray-400">{{ index + 1 }}</span>
                  <span class="truncate text-sm text-gray-800">
                    {{ item.team || '未填写' }}
                  </span>
                </div>
                <span class="text-sm font-semibold text-gray-900">
                  {{ item.count }}
                </span>
              </div>
            </template>
            <template v-else-if="historyStatsView === 'reinspection'">
              <div
                v-for="(item, index) in topReinspectionStats"
                :key="item.team"
                class="rounded bg-gray-50 px-3 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="w-5 text-xs text-gray-400">
                      {{ index + 1 }}
                    </span>
                    <span class="truncate text-sm text-gray-800">
                      {{ item.team || '未填写' }}
                    </span>
                  </div>
                  <span class="text-sm font-semibold text-orange-600">
                    {{ item.reinspectionRate }}%
                  </span>
                </div>
                <div class="mt-1 text-xs text-gray-500">
                  复检 {{ item.reinspectionCount }} / 已检
                  {{ item.inspectedCount }}
                  <span class="text-gray-400">
                    · 报检 {{ item.submittedCount }}
                  </span>
                </div>
              </div>
            </template>
            <template v-else>
              <div
                v-for="(item, index) in topHistoryInspectorStats"
                :key="item.inspector"
                class="rounded bg-gray-50 px-3 py-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="w-5 text-xs text-gray-400">
                      {{ index + 1 }}
                    </span>
                    <span class="truncate text-sm text-gray-800">
                      {{ item.inspector || '未记录' }}
                    </span>
                  </div>
                  <span class="text-sm font-semibold text-gray-900">
                    {{ item.completedTaskCount }}
                  </span>
                </div>
                <div class="mt-1 text-xs text-gray-500">
                  平均任务时长 {{ minutesText(item.averageTaskMinutes) }}
                </div>
              </div>
            </template>
          </div>
        </div>
      </Card>
    </div>
  </Page>
</template>
