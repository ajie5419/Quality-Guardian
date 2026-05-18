<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { EchartsUIType } from '@vben/plugins/echarts';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { tryOnUnmounted } from '@vueuse/core';
import { Button, Card, DatePicker, Segmented, Tag } from 'ant-design-vue';
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
const historyChartRef = ref<EchartsUIType>();
const { getChartInstance, renderEcharts } = useEcharts(historyChartRef);

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

const sortedInspectorStatus = computed(() =>
  [...requestStats.value.inspectorStatus].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'BUSY' ? -1 : 1;
    return b.completedTaskCount - a.completedTaskCount;
  }),
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
    getChartInstance()?.clear();
    return;
  }

  if (historyStatsView.value === 'team') {
    const rows = historyTeamChartRows.value;
    renderEcharts({
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
    renderEcharts({
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
  renderEcharts({
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
    scheduleRenderHistoryStatsChart();
  } catch (error) {
    handleApiError(error, '加载报检看板失败');
  } finally {
    loading.value = false;
  }
}

watch(
  [
    historyStatsView,
    historyTeamChartRows,
    historyInspectorChartRows,
    reinspectionChartRows,
  ],
  () => scheduleRenderHistoryStatsChart(),
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
  getChartInstance()?.dispose();
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
        <Card :body-style="{ padding: '16px' }">
          <div class="text-sm font-medium text-blue-700">报检数量</div>
          <div class="mt-2 flex items-end justify-between gap-3">
            <span class="text-3xl font-semibold text-blue-900">
              {{ requestStats.todaySubmittedCount }}
            </span>
            <span class="text-xs text-blue-700">
              待派单 {{ requestStats.pendingDispatchCount }}
            </span>
          </div>
          <div class="mt-1 text-xs text-blue-600">
            {{ dashboardRangeLabel }}
          </div>
        </Card>

        <Card :body-style="{ padding: '16px' }">
          <div class="text-sm font-medium text-green-700">完成数量</div>
          <div class="mt-2 flex items-end justify-between gap-3">
            <span class="text-3xl font-semibold text-green-900">
              {{ requestStats.todayClosedCount }}
            </span>
            <span class="text-xs text-green-700">
              待检验 {{ requestStats.pendingInspectionCount }}
            </span>
          </div>
          <div class="mt-1 text-xs text-green-600">
            {{ dashboardRangeLabel }}
          </div>
        </Card>

        <Card :body-style="{ padding: '16px' }">
          <div class="text-sm font-medium text-orange-700">班组复检率</div>
          <div class="mt-2 flex items-end justify-between gap-3">
            <span class="text-3xl font-semibold text-orange-900">
              {{
                topReinspectionStats.length > 0
                  ? `${topReinspectionStats[0]?.reinspectionRate || 0}%`
                  : '0%'
              }}
            </span>
            <span class="text-xs text-orange-700">
              {{ requestStats.reinspectionRateByTeam.length }} 个班组
            </span>
          </div>
        </Card>

        <Card :body-style="{ padding: '16px' }">
          <div class="text-sm font-medium text-cyan-700">检验员状态</div>
          <div class="mt-2 flex items-end justify-between gap-3">
            <span class="text-3xl font-semibold text-cyan-900">
              {{ requestStats.inspectorStatus.length }}
            </span>
            <span class="text-xs text-cyan-700">
              忙碌
              {{
                requestStats.inspectorStatus.filter(
                  (item) => item.status === 'BUSY',
                ).length
              }}
            </span>
          </div>
        </Card>
      </div>

      <div class="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_480px]">
        <Card :body-style="{ padding: '16px' }">
          <div class="mb-3 flex items-center justify-between">
            <span class="font-medium text-gray-900">班组报检</span>
            <span class="text-xs text-gray-500">
              共 {{ requestStats.byTeam.length }} 个班组
            </span>
          </div>
          <div
            v-if="sortedTeamStats.length > 0"
            class="max-h-[176px] overflow-y-auto pr-1"
          >
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div
                v-for="item in sortedTeamStats"
                :key="item.team"
                class="flex items-center justify-between rounded bg-gray-50 px-3 py-2"
              >
                <span class="truncate text-sm text-gray-700">
                  {{ item.team || '未填写' }}
                </span>
                <span class="text-sm font-semibold text-gray-900">
                  {{ item.count }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center text-sm text-gray-400">
            当前范围暂无班组报检
          </div>
        </Card>

        <Card :body-style="{ padding: '16px' }">
          <div class="mb-3 flex items-center justify-between">
            <span class="font-medium text-gray-900">检验员状态</span>
            <span class="text-xs text-gray-500">
              共 {{ requestStats.inspectorStatus.length }} 人
            </span>
          </div>
          <div
            v-if="sortedInspectorStatus.length > 0"
            class="max-h-[176px] space-y-2 overflow-y-auto pr-1"
          >
            <div
              v-for="item in sortedInspectorStatus"
              :key="item.inspector"
              class="rounded bg-gray-50 px-3 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-medium text-gray-800">
                  {{ item.inspector || '未记录' }}
                </span>
                <Tag :color="item.status === 'BUSY' ? 'processing' : 'success'">
                  {{ item.status === 'BUSY' ? '有任务' : '空闲' }}
                </Tag>
              </div>
              <div
                class="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"
              >
                <span>当前 {{ item.activeTaskCount }} 项</span>
                <span>已用 {{ minutesText(item.currentTaskMinutes) }}</span>
                <span>
                  完成 {{ item.completedTaskCount }} · 均
                  {{ minutesText(item.averageTaskMinutes) }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="py-8 text-center text-sm text-gray-400">
            暂无检验员任务数据
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
