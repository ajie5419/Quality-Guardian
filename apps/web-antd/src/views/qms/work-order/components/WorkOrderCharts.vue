<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { WorkOrderDashboardStats } from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, nextTick, ref, shallowRef, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import {
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Spin,
  Statistic,
} from 'ant-design-vue';

import { findNameById } from '#/types';

import { CHART_COLORS, getStableColor } from '../constants';

const props = defineProps<{
  deptData: SystemDeptApi.Dept[];
  loading?: boolean;
  statsData: null | WorkOrderDashboardStats;
}>();

const { t } = useI18n();

function normalizeDivisionKey(value: string) {
  return value.replaceAll(/\s+/g, '').toUpperCase();
}

function formatDivisionName(value: string) {
  const compact = value.replaceAll(/\s+/g, '');
  return compact.replace(/(SOBU|OBU|BU)$/i, ' $1').trim();
}

const dashboardStats = computed(() => {
  const source = props.statsData;
  if (!source) {
    return {
      completed: 0,
      inProgress: 0,
      pieData: [] as Array<{ color: string; name: string; value: number }>,
      progressPercent: 0,
      rankings: [] as Array<{
        division: string;
        productName: string;
        productNames?: string[];
        warrantyCount: number;
      }>,
      total: 0,
    };
  }

  const pieMap = new Map<string, { name: string; value: number }>();
  for (const item of source.pieData || []) {
    const rawName = String(item.name || t('qms.common.other')).trim();
    const displayName = formatDivisionName(
      findNameById(props.deptData, rawName) || rawName,
    );
    const key = normalizeDivisionKey(displayName);
    const existing = pieMap.get(key);
    pieMap.set(key, {
      name: existing?.name || displayName,
      value: (existing?.value || 0) + Number(item.value || 0),
    });
  }

  const pieData = [...pieMap.values()]
    .map(({ name, value }) => ({
      name,
      value,
      color: getStableColor(name),
    }))
    .sort((a, b) => b.value - a.value);

  const rankingMap = new Map<
    string,
    {
      division: string;
      productNames: Set<string>;
      warrantyCount: number;
    }
  >();
  for (const item of source.rankings || []) {
    const rawDivision = String(item.division || t('qms.common.other')).trim();
    const productNames =
      Array.isArray(item.productNames) && item.productNames.length > 0
        ? item.productNames
        : [item.productName || '未知产品'];
    const division = formatDivisionName(
      findNameById(props.deptData, rawDivision) || rawDivision,
    );
    const key = normalizeDivisionKey(division);
    const existing = rankingMap.get(key);
    const names = existing?.productNames || new Set<string>();
    productNames.forEach((name) => {
      const normalizedName = String(name || '').trim();
      if (normalizedName) names.add(normalizedName);
    });
    rankingMap.set(key, {
      division: existing?.division || division,
      productNames: names,
      warrantyCount:
        (existing?.warrantyCount || 0) + Number(item.warrantyCount || 0),
    });
  }

  const rankings = [...rankingMap.values()]
    .map((item) => {
      const productNames = [...item.productNames].sort();
      return {
        division: item.division,
        productName: productNames.join('、') || '未知产品',
        productNames,
        warrantyCount: item.warrantyCount,
      };
    })
    .sort((a, b) => b.warrantyCount - a.warrantyCount);

  return {
    ...source,
    pieData,
    rankings,
  };
});

// ECharts 饼图逻辑
const pieChartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(pieChartRef);

const pieChartOptions = shallowRef({
  tooltip: {
    trigger: 'item' as const,
    formatter: `{b}: {c}${t('common.unit.project')} ({d}%)`,
    confine: true,
  },
  // 彻底移除 ECharts 图例，改用 HTML/CSS 渲染
  legend: {
    show: false,
  },
  color: CHART_COLORS,
  series: [
    {
      name: t('qms.workOrder.divisionRatio'),
      type: 'pie' as const,
      // 半径调整：从 ['60%', '90%'] 缩小到 ['45%', '75%']
      // 这样既保证足够大清晰可见，又留有呼吸空间，不显得拥挤
      radius: ['45%', '75%'],
      // 居中：在左侧图表区域内居中
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 4,
        borderColor: '#fff',
        borderWidth: 2,
      },
      label: {
        show: false,
        position: 'center' as const,
      },
      emphasis: {
        scale: true,
        scaleSize: 10,
        label: {
          show: true,
          fontSize: 18,
          fontWeight: 'bold' as const,
          formatter: '{b}\n{d}%',
        },
      },
      data: [] as Array<{ color: string; name: string; value: number }>,
    },
  ],
});

watch(
  () => dashboardStats.value.pieData,
  (newData) => {
    if (newData.length > 0) {
      pieChartOptions.value.series[0]!.data = newData;
      nextTick(() => {
        renderEcharts(pieChartOptions.value);
      });
    }
  },
  { immediate: true },
);
</script>

<template>
  <Row :gutter="16">
    <Col :span="8">
      <Card
        :title="t('qms.workOrder.divisionRatio')"
        size="small"
        class="h-full shadow-sm"
      >
        <Spin :spinning="loading">
          <div class="flex h-[300px] w-full items-center overflow-hidden">
            <!-- 左侧：纯图表区域 (60%) -->
            <div class="h-full w-3/5">
              <EchartsUI
                v-show="dashboardStats.pieData.length > 0"
                ref="pieChartRef"
                class="h-full w-full"
              />
              <div
                v-if="dashboardStats.pieData.length === 0 && !loading"
                class="flex h-full w-full items-center justify-center"
              >
                <Empty
                  :image="Empty.PRESENTED_IMAGE_SIMPLE"
                  :description="t('common.noData')"
                />
              </div>
            </div>

            <!-- 右侧：自定义图例区域 (40%) -->
            <div
              class="custom-scrollbar flex h-full w-2/5 flex-col gap-2 overflow-y-auto pr-2"
            >
              <div
                v-for="item in dashboardStats.pieData"
                :key="item.name"
                class="flex shrink-0 cursor-default items-center justify-between rounded px-1 py-0.5 text-xs transition-colors hover:bg-gray-50"
              >
                <div class="flex min-w-0 items-center gap-2 overflow-hidden">
                  <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: item.color }"
                  ></span>
                  <span class="truncate text-gray-600" :title="item.name">
                    {{ item.name }}
                  </span>
                </div>
                <!-- 显示百分比或数值，这里显示数值 -->
                <span class="ml-2 shrink-0 font-medium text-gray-800">{{
                  item.value
                }}</span>
              </div>
            </div>
          </div>
        </Spin>
      </Card>
    </Col>

    <Col :span="10">
      <Card
        :title="t('qms.workOrder.warrantyRanking')"
        size="small"
        class="h-full shadow-sm"
      >
        <div class="custom-scrollbar h-[300px] overflow-y-auto pr-2">
          <Spin :spinning="loading">
            <div class="space-y-1.5 py-1">
              <div
                v-for="(rank, idx) in dashboardStats.rankings"
                :key="rank.division"
                class="group flex items-center justify-between rounded-lg border-b border-gray-50 p-2.5 transition-all hover:bg-blue-50/30"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold shadow-sm"
                    :class="[
                      idx === 0 ? 'bg-yellow-400 text-white' : '',
                      idx === 1 ? 'bg-slate-300 text-white' : '',
                      idx === 2 ? 'bg-orange-300 text-white' : '',
                      idx > 2 ? 'bg-gray-100 text-gray-400' : '',
                    ]"
                  >
                    {{ idx + 1 }}
                  </div>
                  <div class="flex flex-col">
                    <span class="text-sm font-bold text-gray-700">{{
                      rank.division
                    }}</span>
                    <span class="text-xs text-gray-500">
                      {{ rank.productName }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-gray-400">{{
                    t('qms.workOrder.warrantyCount')
                  }}</span>
                  <span class="font-mono text-base font-bold text-blue-600">{{
                    rank.warrantyCount
                  }}</span>
                  <span class="text-[11px] text-gray-400">{{
                    t('common.unit.piece')
                  }}</span>
                </div>
              </div>
            </div>
            <Empty
              v-if="dashboardStats.rankings.length === 0 && !loading"
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
            />
          </Spin>
        </div>
      </Card>
    </Col>

    <Col :span="6">
      <Card
        :title="t('qms.workOrder.executionOverview')"
        size="small"
        class="h-full shadow-sm"
      >
        <Spin :spinning="loading">
          <div class="flex h-[300px] flex-col justify-center gap-10 py-2">
            <Row :gutter="8">
              <Col :span="8">
                <Statistic
                  :title="t('qms.workOrder.totalProjects')"
                  :value="dashboardStats.total"
                />
              </Col>
              <Col :span="8">
                <Statistic
                  :title="t('qms.workOrder.manufacturing')"
                  :value="dashboardStats.inProgress"
                  :value-style="{ color: '#1890ff' }"
                />
              </Col>
              <Col :span="8">
                <Statistic
                  :title="t('qms.workOrder.completedOnly')"
                  :value="dashboardStats.completed"
                  :value-style="{ color: '#52c41a' }"
                />
              </Col>
            </Row>
            <div class="mt-4">
              <div class="mb-1 flex justify-between text-xs">
                <span class="font-medium text-gray-400">{{
                  t('qms.workOrder.completionRate')
                }}</span>
                <span class="font-bold text-green-600">
                  {{ dashboardStats.completed }} / {{ dashboardStats.total }}
                </span>
              </div>
              <Progress
                :percent="dashboardStats.progressPercent"
                stroke-color="#52c41a"
                :stroke-width="12"
                status="active"
              />
            </div>
          </div>
        </Spin>
      </Card>
    </Col>
  </Row>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
</style>
