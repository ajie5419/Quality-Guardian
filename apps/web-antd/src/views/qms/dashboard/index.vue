<script lang="ts" setup>
import type { AnalysisOverviewItem } from '@vben/common-ui';

import type { QmsDashboardApi } from '#/api/qms/dashboard';
import type { SystemDeptApi } from '#/api/system/dept';
import type { EChartsClickParams } from '#/types';

import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';

import { AnalysisOverview } from '@vben/common-ui';
import {
  SvgBellIcon,
  SvgCakeIcon,
  SvgCardIcon,
  SvgDownloadIcon,
} from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  message,
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
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useDashboardQuery } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import PassRateTargetModal from './components/PassRateTargetModal.vue';
import PassRateTrendChart from './components/PassRateTrendChart.vue';
import QualityLossTrendChart from './components/QualityLossTrendChart.vue';
import VehicleFailureChart from './components/VehicleFailureChart.vue';
import { useDrillDown } from './composables/useDrillDown';
import { useTrendLoader } from './composables/useTrendLoader';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { data: dashboardData, isLoading: dashboardLoading } =
  useDashboardQuery();

const CONSTANTS = {
  CHART_RENDER_DELAY: 200,
  DEFAULT_PAGE_SIZE: 10,
  PASS_RATE_THRESHOLD: {
    HIGH: 98,
    MID: 95,
  },
};

function formatPercent(value: null | number | undefined) {
  return Number(value ?? 0).toFixed(2);
}

const granularity = ref<'month' | 'week'>('week');
const qualityLossGranularity = ref<'month' | 'week'>('week');
const passRateSource = ref<'inspection' | 'issue'>('inspection');

const targetModalRef = ref();

function handleTargetSuccess() {
  loadPassRateTrend();
}

const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptLoading = ref(false);

const loadDeptList = async () => {
  deptLoading.value = true;
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    message.error(t('qms.dashboard.error.deptLoadFailed'));
    handleApiError(error, 'Load Dashboard Dept List');
  } finally {
    deptLoading.value = false;
  }
};

const {
  data: trendData,
  isLoading: passRateLoading,
  load: loadPassRateTrend,
} = useTrendLoader<QmsDashboardApi.PassRateTrendItem[]>(
  (g, p) =>
    getPassRateTrend(g, p, passRateSource.value).then(
      (res) => res.trend || res.data || [],
    ),
  granularity,
  [],
  () => passRateSource.value,
);

const {
  data: qualityLossData,
  isLoading: qualityLossLoading,
  load: loadQualityLossTrend,
} = useTrendLoader<QmsDashboardApi.QualityLossTrendItem[]>(
  (g, p) =>
    getQualityLossTrend(g, p).then((res) => res.trend || res.data || []),
  qualityLossGranularity,
  [],
);

const deptNameMap = computed(() => {
  const map = new Map<string, string>();
  const traverse = (items: SystemDeptApi.Dept[]) => {
    items?.forEach((item) => {
      map.set(item.id, item.name);
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    });
  };
  traverse(deptRawData.value);
  return map;
});

const currentDrillDownType = ref<'passRate' | 'qualityLoss'>('passRate');

const passRateDrillDown = useDrillDown<QmsDashboardApi.PassRateDrillDownItem>(
  'passRate',
  (period) =>
    getPassRateTrend(granularity.value, period, passRateSource.value).then(
      (res) => res.drillDown || [],
    ),
);

const qualityLossDrillDown =
  useDrillDown<QmsDashboardApi.QualityLossDrillDownItem>(
    'qualityLoss',
    (period) =>
      getQualityLossTrend(qualityLossGranularity.value, period).then(
        (res) => res.drillDown || [],
      ),
  );

const drillDownVisible = computed({
  get: () =>
    passRateDrillDown.visible.value || qualityLossDrillDown.visible.value,
  set: (val) => {
    if (!val) {
      passRateDrillDown.visible.value && passRateDrillDown.close();
      qualityLossDrillDown.visible.value && qualityLossDrillDown.close();
    }
  },
});

const modalTitle = computed(() => {
  const period =
    currentDrillDownType.value === 'passRate'
      ? passRateDrillDown.period.value
      : qualityLossDrillDown.period.value;
  const suffix =
    currentDrillDownType.value === 'passRate'
      ? t('qms.dashboard.passRateDetail')
      : t('qms.dashboard.qualityLossDetail');
  return `${period} ${suffix}`;
});

function handleChartClick(params: EChartsClickParams) {
  currentDrillDownType.value = 'passRate';
  passRateDrillDown.open(params.name);
}

function handleQualityLossClick(params: EChartsClickParams) {
  currentDrillDownType.value = 'qualityLoss';
  qualityLossDrillDown.open(params.name);
}

onMounted(async () => {
  try {
    loadDeptList();
    await nextTick();
    setTimeout(() => {
      loadPassRateTrend();
      loadQualityLossTrend();
    }, CONSTANTS.CHART_RENDER_DELAY);
  } catch (error) {
    message.error(t('qms.dashboard.error.chartLoadFailed'));
    handleApiError(error, 'Load Dashboard Chart Data');
  }
});

watch(granularity, () => {
  passRateDrillDown.close();
});
watch(passRateSource, () => {
  passRateDrillDown.close();
  loadPassRateTrend({ force: true });
});
watch(qualityLossGranularity, () => {
  qualityLossDrillDown.close();
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

const drillDownColumns = shallowRef([
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

const qualityLossDrillDownColumns = shallowRef([
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
    title: t('qms.workOrder.workOrderNumber'),
    dataIndex: 'workOrderNumber',
    key: 'workOrderNumber',
    width: 150,
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

const activeTab = ref('trends');
</script>

<template>
  <QmsPageShell>
    <div
      v-if="dashboardLoading || deptLoading"
      class="flex justify-center p-12"
    >
      <Spin size="large" :tip="t('common.loadingText')" />
    </div>
    <div v-else>
      <AnalysisOverview :items="overviewItems" />

      <div
        class="card-box bg-card mt-5 w-full rounded-md border px-4 pb-5 pt-3"
      >
        <Tabs v-model:active-key="activeTab">
          <template #rightExtra>
            <Button
              v-if="activeTab === 'trends'"
              type="link"
              size="small"
              class="flex items-center gap-1"
              @click="targetModalRef?.open()"
            >
              <SvgCardIcon class="size-3" />
              <span>指标配置</span>
            </Button>
          </template>
          <TabPane key="trends" :tab="t('qms.dashboard.passRateTrend')">
            <div class="pt-2">
              <div class="mb-4">
                <div class="flex flex-wrap gap-3">
                  <Segmented
                    v-model:value="granularity"
                    :options="[
                      { label: t('common.unit.week'), value: 'week' },
                      { label: t('common.unit.month'), value: 'month' },
                    ]"
                  />
                  <Segmented
                    v-model:value="passRateSource"
                    :options="[
                      { label: '按检验记录', value: 'inspection' },
                      { label: '按不合格项', value: 'issue' },
                    ]"
                  />
                </div>
              </div>
              <div v-show="activeTab === 'trends'">
                <Spin v-if="passRateLoading" tip="Loading pass rate data..." />
                <PassRateTrendChart
                  v-else
                  :active="true"
                  :trend-data="trendData"
                  :granularity="granularity"
                  @chart-click="handleChartClick"
                />
              </div>
            </div>
          </TabPane>

          <TabPane key="qualityLoss" :tab="t('qms.dashboard.qualityLossStats')">
            <div class="pt-2">
              <div class="mb-4">
                <Segmented
                  v-model:value="qualityLossGranularity"
                  :options="[
                    { label: t('common.unit.week'), value: 'week' },
                    { label: t('common.unit.month'), value: 'month' },
                  ]"
                />
              </div>
              <div v-show="activeTab === 'qualityLoss'">
                <Spin
                  v-if="qualityLossLoading"
                  tip="Loading quality loss data..."
                />
                <QualityLossTrendChart
                  v-else
                  :active="true"
                  :data="qualityLossData"
                  :granularity="qualityLossGranularity"
                  @chart-click="handleQualityLossClick"
                />
              </div>
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

    <Modal
      v-model:open="drillDownVisible"
      :title="modalTitle"
      width="1000px"
      :footer="null"
    >
      <Table
        :data-source="
          currentDrillDownType === 'passRate'
            ? passRateDrillDown.data.value
            : qualityLossDrillDown.data.value
        "
        :columns="
          currentDrillDownType === 'passRate'
            ? drillDownColumns
            : qualityLossDrillDownColumns
        "
        :pagination="{
          pageSize: CONSTANTS.DEFAULT_PAGE_SIZE,
          showSizeChanger: true,
        }"
        :row-key="(record) => record.id || record.process"
        :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, text }">
          <template v-if="column.key === 'targetPassRate'">
            {{ text != null ? `${formatPercent(text)}%` : '-' }}
          </template>
          <template v-if="column.key === 'passRate'">
            <Tag
              :color="
                text >= CONSTANTS.PASS_RATE_THRESHOLD.HIGH
                  ? 'green'
                  : text >= CONSTANTS.PASS_RATE_THRESHOLD.MID
                    ? 'orange'
                    : 'red'
              "
            >
              {{ formatPercent(text) }}%
            </Tag>
          </template>
          <template v-if="column.key === 'dept'">
            {{ deptNameMap.get(text) || text }}
          </template>
          <template v-if="column.key === 'type'">
            <Tag
              :color="
                text === 'INTERNAL'
                  ? 'orange'
                  : text === 'EXTERNAL'
                    ? 'red'
                    : text === 'COMMISSIONING'
                      ? 'purple'
                      : 'green'
              "
            >
              {{
                text === 'INTERNAL'
                  ? t('qms.qualityLoss.source.internal')
                  : text === 'EXTERNAL'
                    ? t('qms.qualityLoss.source.external')
                    : text === 'COMMISSIONING'
                      ? t('qms.qualityLoss.source.commissioning')
                      : t('qms.qualityLoss.source.manual')
              }}
            </Tag>
          </template>
          <template v-if="column.key === 'amount'"> ¥{{ text }} </template>
        </template>
      </Table>
    </Modal>

    <PassRateTargetModal ref="targetModalRef" @success="handleTargetSuccess" />
  </QmsPageShell>
</template>
