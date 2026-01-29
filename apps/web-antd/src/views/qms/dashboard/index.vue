<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { QmsDashboardApi } from '#/api/qms/dashboard';
import type { EChartsClickParams } from '#/types';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { AnalysisOverview } from '@vben/common-ui';
import {
  SvgBellIcon,
  SvgCakeIcon,
  SvgCardIcon,
  SvgDownloadIcon,
} from '@vben/icons';
import { useI18n } from '@vben/locales';
import { useEcharts } from '@vben/plugins/echarts';

import {
  Modal,
  Segmented,
  Spin,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { getPassRateTrend, getQualityLossTrend } from '#/api/qms/dashboard';
import { getDeptList } from '#/api/system/dept';
import { useDashboardQuery } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';

import PassRateTrendChart from './components/PassRateTrendChart.vue';
import QualityLossTrendChart from './components/QualityLossTrendChart.vue';
import VehicleFailureChart from './components/VehicleFailureChart.vue';

const { t } = useI18n();
const { data: dashboardData, isLoading: loading } = useDashboardQuery();

// ECharts refs
// ECharts refs
const pieChartRef = ref<EchartsUIType>();
const miniPassRateChartRef = ref<EchartsUIType>();

useEcharts(pieChartRef);

const { renderEcharts: renderMiniPassRateChart } =
  useEcharts(miniPassRateChartRef);

// 合格率趋势状态
const granularity = ref<'month' | 'week'>('week');
const trendData = ref<QmsDashboardApi.PassRateTrendItem[]>([]);
const drillDownVisible = ref(false);
const drillDownData = ref<
  | QmsDashboardApi.PassRateDrillDownItem[]
  | QmsDashboardApi.QualityLossDrillDownItem[]
>([]);
const drillDownPeriod = ref('');

// 质量损失统计状态
const qualityLossGranularity = ref<'month' | 'week'>('week');
const qualityLossData = ref<QmsDashboardApi.QualityLossTrendItem[]>([]);

const deptRawData = ref<any[]>([]);

onMounted(async () => {
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    console.error('Failed to load dept list:', error);
  }
});

// ... (keep existing computed overviewItems)

// 加载合格率趋势数据
async function loadPassRateTrend() {
  try {
    const res = await getPassRateTrend(granularity.value);
    if (res && res.trend) {
      trendData.value = res.trend;
      // Update mini chart after data load
      nextTick(() => {
        updatePassRateChart();
      });
    }
  } catch (error) {
    console.error('Failed to load trend data:', error);
  }
}

// 加载质量损失趋势数据
async function loadQualityLossTrend() {
  try {
    const res = await getQualityLossTrend(qualityLossGranularity.value);
    if (res && res.trend) {
      qualityLossData.value = res.trend;
    }
  } catch (error) {
    console.error('Failed to load quality loss data:', error);
  }
}

// 监听粒度变化
watch(granularity, () => {
  loadPassRateTrend();
});

watch(qualityLossGranularity, () => {
  loadQualityLossTrend();
});

// 初始化
onMounted(() => {
  // 确保 DOM 准备好后再加载图表数据
  nextTick(() => {
    setTimeout(() => {
      loadPassRateTrend();
      loadQualityLossTrend();
    }, 200);
  });
});
const overviewItems = computed<AnalysisOverviewItem[]>(() => {
  const data = dashboardData.value;
  if (!data) return [];

  return [
    {
      icon: SvgBellIcon,
      title: t('qms.dashboard.overview.fieldIssues'),
      totalTitle: t('qms.dashboard.overview.totalIssues'),
      totalValue: data.overview?.fieldIssues?.total || 0,
      value: data.overview?.fieldIssues?.open || 0,
    },
    {
      icon: SvgCakeIcon,
      title: t('qms.dashboard.overview.processIssues'),
      totalTitle: t('qms.dashboard.overview.totalIssues'),
      totalValue: data.overview?.processIssues?.total || 0,
      value: data.overview?.processIssues?.open || 0,
    },
    {
      icon: SvgDownloadIcon,
      prefix: '¥',
      title: t('qms.qualityLoss.title'),
      totalTitle: t('qms.dashboard.overview.totalLoss'),
      totalValue:
        typeof data.overview?.qualityLoss === 'object'
          ? data.overview.qualityLoss.total
          : data.overview?.qualityLoss || 0,
      value:
        typeof data.overview?.qualityLoss === 'object'
          ? data.overview.qualityLoss.weekly
          : data.overview?.qualityLoss || 0,
    },
    {
      icon: SvgCardIcon,
      title: t('qms.workOrder.title'),
      totalTitle: t('qms.dashboard.overview.totalOrders'),
      totalValue: data.overview?.workOrders?.total || 0,
      value: data.overview?.workOrders?.weekly || 0,
    },
  ];
});

// 更新合格率图表
function updatePassRateChart() {
  if (trendData.value.length === 0) {
    return;
  }

  // Mini Chart Render Logic (keep this for the small chart at bottom)
  const chartOption = {
    title: {
      text:
        granularity.value === 'week'
          ? t('qms.dashboard.weeklyPassRateTrend')
          : t('qms.dashboard.monthlyPassRateTrend'),
      left: 'center',
    },
    tooltip: {
      trigger: 'axis' as const,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: trendData.value.map((i: any) => i.period),
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%' },
    },
    series: [
      {
        data: trendData.value.map((i: any) => i.passRate),
        type: 'bar' as const,
        itemStyle: {
          color: '#5ab1ef',
          borderRadius: [4, 4, 0, 0],
        },
        label: {
          show: true,
          position: 'top' as const,
          formatter: '{c}%',
          color: '#666',
        },
        barWidth: '50%',
      },
    ],
  };

  renderMiniPassRateChart(chartOption);
}

// 下钻表格列配置
const drillDownColumns = computed(() => [
  {
    title: t('qms.planning.itp.processStep'),
    dataIndex: 'process',
    key: 'process',
  },
  { title: t('common.category'), dataIndex: 'category', key: 'category' },
  {
    title: t('qms.dashboard.targetPassRate'),
    dataIndex: 'targetPassRate',
    key: 'targetPassRate',
  },
  {
    title: t('qms.dashboard.passRate'),
    dataIndex: 'passRate',
    key: 'passRate',
  },
  {
    title: t('qms.dashboard.totalInspection'),
    dataIndex: 'totalCount',
    key: 'totalCount',
  },
  {
    title: t('qms.dashboard.qualifiedCount'),
    dataIndex: 'passCount',
    key: 'passCount',
  },
]);

// 质量损失下钻表格列配置
const qualityLossDrillDownColumns = computed(() => [
  {
    title: t('qms.inspection.issues.reportDate'),
    dataIndex: 'date',
    key: 'date',
    width: 120,
  },
  { title: t('common.type'), dataIndex: 'type', key: 'type', width: 100 },
  {
    title: t('qms.qualityLoss.amountLabel'),
    dataIndex: 'amount',
    key: 'amount',
    width: 120,
  },
  {
    title: t('qms.inspection.issues.responsibleDepartment'),
    dataIndex: 'dept',
    key: 'dept',
    width: 150,
    customRender: ({ text }: { text: string }) =>
      findNameById(deptRawData.value, text) || text,
  },
  {
    title: t('qms.inspection.issues.description'),
    dataIndex: 'desc',
    key: 'desc',
    ellipsis: true,
  },
]);

const currentDrillDownType = ref<'passRate' | 'qualityLoss'>('passRate');

// 点击质量损失图表触发下钻
async function handleQualityLossClick(params: EChartsClickParams) {
  const period = params.name;
  drillDownPeriod.value = period;
  currentDrillDownType.value = 'qualityLoss';

  try {
    const result = await getQualityLossTrend(
      qualityLossGranularity.value,
      period,
    );
    drillDownData.value = result.drillDown || [];
    drillDownVisible.value = true;
  } catch (error) {
    console.error('Failed to load quality loss drill-down:', error);
  }
}

// 点击合格率图表触发下钻
async function handleChartClick(params: EChartsClickParams) {
  const period = params.name;
  drillDownPeriod.value = period;
  currentDrillDownType.value = 'passRate';

  try {
    const result = await getPassRateTrend(granularity.value, period);
    drillDownData.value = result.drillDown || [];
    drillDownVisible.value = true;
  } catch (error) {
    console.error('Failed to load drill-down data:', error);
  }
}

const activeTab = ref('trends');

// 监听 Tab 切换
watch(activeTab, (val) => {
  if (val === 'trends') {
    // Optional: explicit refresh if needed, but v-if handles it
  }
});
</script>

<template>
  <div class="p-5">
    <div v-if="loading" class="flex justify-center p-12">
      <Spin size="large" />
    </div>
    <div v-else>
      <!-- 统计卡片 -->
      <AnalysisOverview :items="overviewItems" />

      <!-- 图表区域 -->
      <div
        class="card-box bg-card mt-5 w-full rounded-md border px-4 pb-5 pt-3"
      >
        <Tabs v-model:active-key="activeTab">
          <TabPane key="trends" :tab="t('qms.dashboard.passRateTrend')">
            <div class="pt-2">
              <!-- 粒度切换 -->
              <div class="mb-4">
                <Segmented
                  v-model:value="granularity"
                  :options="[
                    { label: t('common.unit.week'), value: 'week' },
                    { label: t('common.unit.month'), value: 'month' },
                  ]"
                />
              </div>
              <PassRateTrendChart
                v-if="activeTab === 'trends'"
                :active="true"
                :trend-data="trendData"
                :granularity="granularity"
                @chart-click="handleChartClick"
              />
            </div>
          </TabPane>

          <TabPane key="qualityLoss" :tab="t('qms.dashboard.qualityLossStats')">
            <div class="pt-2">
              <!-- 粒度切换 -->
              <div class="mb-4">
                <Segmented
                  v-model:value="qualityLossGranularity"
                  :options="[
                    { label: t('common.unit.week'), value: 'week' },
                    { label: t('common.unit.month'), value: 'month' },
                  ]"
                />
              </div>
              <QualityLossTrendChart
                v-if="activeTab === 'qualityLoss'"
                :active="true"
                :data="qualityLossData"
                :granularity="qualityLossGranularity"
                @chart-click="handleQualityLossClick"
              />
            </div>
          </TabPane>

          <TabPane
            key="vehicleFailure"
            :tab="t('qms.dashboard.vehicleFailureRate')"
          >
            <div class="pt-2">
              <VehicleFailureChart :active="activeTab === 'vehicleFailure'" />
            </div>
          </TabPane>
        </Tabs>
      </div>
    </div>

    <!-- 下钻弹窗 -->
    <Modal
      v-model:open="drillDownVisible"
      :title="`${drillDownPeriod} ${currentDrillDownType === 'passRate' ? t('qms.dashboard.passRateDetail') : t('qms.dashboard.qualityLossDetail')}`"
      width="1000px"
      :footer="null"
    >
      <Table
        :data-source="drillDownData"
        :columns="
          currentDrillDownType === 'passRate'
            ? drillDownColumns
            : qualityLossDrillDownColumns
        "
        :pagination="{ pageSize: 10 }"
        :row-key="currentDrillDownType === 'passRate' ? 'process' : 'id'"
        :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, text }">
          <template v-if="column.key === 'targetPassRate'">
            {{ text != null ? text + '%' : '-' }}
          </template>
          <template v-if="column.key === 'passRate'">
            <Tag :color="text >= 98 ? 'green' : text >= 95 ? 'orange' : 'red'">
              {{ text }}%
            </Tag>
          </template>
          <template v-if="column.key === 'type'">
            <Tag
              :color="
                text === '内部损失'
                  ? 'orange'
                  : text === '外部损失'
                    ? 'red'
                    : 'green'
              "
            >
              {{ text }}
            </Tag>
          </template>
          <template v-if="column.key === 'amount'"> ¥{{ text }} </template>
        </template>
      </Table>
    </Modal>
  </div>
</template>
