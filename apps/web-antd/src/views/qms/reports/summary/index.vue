<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { QualityReportSummary } from '#/api/qms/reports';

import { computed, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  RadioButton,
  RadioGroup,
  Row,
  Space,
  Spin,
  Tag,
  TypographyTitle,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getSummaryReport } from '#/api/qms/reports';

const { t } = useI18n();
const loading = ref(false);

const canExport = computed(() => {
  // Restore button visibility for all viewers of this page
  return true;
});

const reportType = ref<'monthly' | 'weekly'>('weekly');
const targetDate = ref<Dayjs>(dayjs());
const reportData = ref<null | QualityReportSummary>(null);

async function loadReport() {
  loading.value = true;
  try {
    const data = await getSummaryReport({
      type: reportType.value,
      date: targetDate.value.format('YYYY-MM-DD'),
    });
    reportData.value = data;
  } catch (error) {
    console.error('Failed to load report', error);
  } finally {
    loading.value = false;
  }
}

function handlePrint() {
  window.print();
}

onMounted(loadReport);
watch([reportType, targetDate], loadReport);

// 辅助函数：生成迷你趋势线 (SVG)
const renderSparkline = (data: number[], color = '#1890ff') => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 30;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`,
    )
    .join(' ');
  return `<svg width="${width}" height="${height}"><polyline fill="none" stroke="${color}" stroke-width="2" points="${points}" /></svg>`;
};
</script>

<template>
  <Page
    :title="t('qms.reports.summary.title')"
    content-class="p-4 bg-gray-100 min-h-screen"
  >
    <div class="mx-auto max-w-7xl space-y-4">
      <!-- 1. 顶部筛选 (非打印区) -->
      <Card size="small" class="no-print shadow-sm">
        <div class="flex items-center justify-between">
          <Space size="large">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-500"
                >{{ t('qms.reports.summary.reportType') }}:</span
              >
              <RadioGroup
                v-model:value="reportType"
                button-style="solid"
                size="small"
              >
                <RadioButton value="weekly">{{
                  t('qms.reports.summary.weekly')
                }}</RadioButton>
                <RadioButton value="monthly">{{
                  t('qms.reports.summary.monthly')
                }}</RadioButton>
              </RadioGroup>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-500"
                >{{ t('qms.reports.summary.selectPeriod') }}:</span
              >
              <DatePicker
                v-model:value="targetDate"
                :picker="reportType === 'weekly' ? 'week' : 'month'"
                :allow-clear="false"
                size="small"
              />
            </div>
          </Space>
          <Button v-if="canExport" @click="handlePrint" type="primary">
            <span class="i-lucide-printer mr-1"></span>
            {{ t('qms.reports.summary.generatePdf') }}
          </Button>
        </div>
      </Card>

      <Spin :spinning="loading">
        <div
          v-if="reportData"
          class="print-area rounded-sm border-t-8 border-blue-600 bg-white p-10 shadow-xl"
        >
          <!-- 2. 报告抬头 -->
          <div class="mb-10 flex items-start justify-between">
            <div>
              <div
                class="mb-1 text-2xl font-black uppercase tracking-tighter text-blue-600"
              >
                {{
                  t('qms.reports.summary.titleEn') ||
                  'QUALITY PERFORMANCE REPORT'
                }}
              </div>
              <TypographyTitle :level="1" class="m-0 text-gray-800">
                {{ reportData.title }}
              </TypographyTitle>
              <div class="mt-2 flex items-center gap-4">
                <Tag color="blue" class="font-mono">
                  {{ reportData.period }}
                </Tag>
                <span class="text-xs text-gray-400"
                  >{{ t('qms.reports.summary.reportNo') }}: QMS-RPT-{{
                    dayjs(targetDate).format('YYYYMMDD')
                  }}-{{ reportType.toUpperCase() }}</span
                >
              </div>
            </div>
            <div class="text-right">
              <div class="font-bold text-gray-700">
                {{ t('qms.reports.summary.qmDept') }}
              </div>
              <div class="mt-1 text-xs italic text-gray-400">
                {{ t('qms.reports.summary.internalOnly') }}
              </div>
            </div>
          </div>

          <!-- 3. 核心 KPI 概览 (带 6 周期趋势) -->
          <div class="mb-10">
            <div class="mb-4 flex items-center gap-2 border-b pb-2">
              <span class="i-lucide-activity text-blue-500"></span>
              <span
                class="text-lg font-bold uppercase tracking-wider text-gray-700"
                >{{ t('qms.reports.summary.keyKpis') }}</span
              >
            </div>
            <Row :gutter="16">
              <Col
                v-for="item in reportData.metrics"
                :key="item.label"
                :span="6"
              >
                <div
                  class="group relative overflow-hidden rounded-lg border border-gray-100 bg-gray-50 p-4"
                >
                  <div class="mb-1 text-xs text-gray-500">{{ item.label }}</div>
                  <div class="flex items-baseline gap-1">
                    <span class="text-2xl font-black text-gray-800">{{
                      item.value.toLocaleString()
                    }}</span>
                    <span class="text-xs text-gray-400">{{ item.unit }}</span>
                  </div>
                  <!-- 趋势箭头 -->
                  <div class="mt-2 flex items-center gap-2">
                    <span
                      :class="
                        item.trend >= 0
                          ? item.label.includes('损失')
                            ? 'text-red-500'
                            : 'text-green-500'
                          : item.label.includes('损失')
                            ? 'text-green-500'
                            : 'text-red-500'
                      "
                    >
                      <span
                        v-if="item.trend > 0"
                        class="i-lucide-arrow-up-right"
                      ></span>
                      <span v-else class="i-lucide-arrow-down-right"></span>
                      <b class="ml-0.5 text-xs">{{ Math.abs(item.trend) }}%</b>
                    </span>
                    <!-- 迷你趋势图 -->
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div
                      class="flex-1 opacity-40 transition-opacity group-hover:opacity-100"
                      v-html="
                        renderSparkline(
                          item.history,
                          item.label.includes('损失') ? '#ff4d4f' : '#52c41a',
                        )
                      "
                    ></div>
                  </div>
                </div>
              </Col>
            </Row>
          </div>

          <Row :gutter="40" class="mb-10">
            <!-- 4. 缺陷分析与分布 -->
            <Col :span="12">
              <div class="mb-4 flex items-center gap-2 border-b pb-2">
                <span class="i-lucide-pie-chart text-blue-500"></span>
                <span
                  class="text-lg font-bold uppercase tracking-wider text-gray-700"
                  >{{ t('qms.reports.summary.defectsAnalysis') }}</span
                >
              </div>
              <div class="space-y-4">
                <div
                  v-for="d in reportData.defects"
                  :key="d.name"
                  class="flex items-center gap-4"
                >
                  <div class="w-24 truncate text-right text-xs text-gray-500">
                    {{ d.name }}
                  </div>
                  <div
                    class="h-3 flex-1 overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      class="h-full bg-blue-500 transition-all"
                      :style="{
                        width: `${reportData.defects[0] ? (d.value / reportData.defects[0].value) * 100 : 0}%`,
                      }"
                    ></div>
                  </div>
                  <div class="w-10 font-mono text-sm font-bold text-gray-700">
                    {{ d.value }}
                  </div>
                </div>
                <Empty
                  v-if="reportData.defects.length === 0"
                  :description="t('qms.reports.summary.noSignificantDefects')"
                />
              </div>
            </Col>

            <!-- 5. 供应商红黑榜 -->
            <Col :span="12">
              <div class="mb-4 flex items-center gap-2 border-b pb-2">
                <span class="i-lucide-award text-blue-500"></span>
                <span
                  class="text-lg font-bold uppercase tracking-wider text-gray-700"
                  >{{ t('qms.reports.summary.supplierPerformance') }}</span
                >
              </div>
              <div class="grid grid-cols-2 gap-4">
                <!-- 红榜 -->
                <div class="rounded-lg bg-green-50 p-4">
                  <div
                    class="mb-3 flex items-center gap-1 text-xs font-bold text-green-700"
                  >
                    <span class="i-lucide-thumbs-up"></span>
                    {{ t('qms.reports.summary.topPerformers') }}
                  </div>
                  <div
                    v-for="s in reportData.suppliers.best"
                    :key="s.name"
                    class="mb-2 flex justify-between text-xs"
                  >
                    <span class="text-gray-700">{{ s.name }}</span>
                    <Tag color="success" class="m-0 scale-75">
                      {{ s.issues }} {{ t('common.unit.item')
                      }}{{ t('qms.inspection.issues.status.resolved') }}
                    </Tag>
                  </div>
                </div>
                <!-- 黑榜 -->
                <div class="rounded-lg bg-red-50 p-4">
                  <div
                    class="mb-3 flex items-center gap-1 text-xs font-bold text-red-700"
                  >
                    <span class="i-lucide-alert-octagon"></span>
                    {{ t('qms.reports.summary.atRiskPerformers') }}
                  </div>
                  <div
                    v-for="s in reportData.suppliers.worst"
                    :key="s.name"
                    class="mb-2 flex justify-between text-xs"
                  >
                    <span class="text-gray-700">{{ s.name }}</span>
                    <Tag color="error" class="m-0 scale-75">
                      {{ s.issues }} {{ t('common.unit.item')
                      }}{{ t('common.status') }}
                    </Tag>
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <!-- 6. 重大质量事件追踪 -->
          <div class="mb-10">
            <div class="mb-4 flex items-center gap-2 border-b pb-2">
              <span class="i-lucide-alert-triangle text-orange-500"></span>
              <span
                class="text-lg font-bold uppercase tracking-wider text-gray-700"
                >{{ t('qms.reports.summary.majorEvents') }}</span
              >
            </div>
            <div class="space-y-4">
              <div
                v-for="event in reportData.majorEvents"
                :key="event.id"
                class="flex gap-6 rounded-lg border p-5 transition-colors hover:bg-gray-50"
              >
                <div
                  class="flex h-24 w-24 flex-shrink-0 flex-col items-center justify-center rounded border bg-gray-100"
                >
                  <div class="text-lg font-black text-red-600">
                    ¥{{ (event.loss / 1000).toFixed(1) }}k
                  </div>
                  <div class="text-[10px] text-gray-400">
                    {{ t('qms.inspection.issues.lossAmount') }}
                  </div>
                </div>
                <div class="flex-1">
                  <div class="mb-2 flex items-start justify-between">
                    <div class="text-lg font-bold text-gray-800">
                      {{ event.title }}
                    </div>
                    <Tag :color="event.status === 'CLOSED' ? 'blue' : 'orange'">
                      {{ event.status }}
                    </Tag>
                  </div>
                  <div class="mb-2 line-clamp-2 text-sm italic text-gray-500">
                    "{{ event.desc || t('common.noDescription') }}"
                  </div>
                  <div class="flex gap-4 text-xs text-gray-400">
                    <span
                      >{{ t('common.project') }}:
                      <b class="text-gray-600">{{ event.project }}</b></span
                    >
                    <span
                      >{{ t('common.date') }}: <b>{{ event.date }}</b></span
                    >
                  </div>
                </div>
              </div>
              <Empty
                v-if="reportData.majorEvents.length === 0"
                :description="t('qms.reports.summary.noSignificantLoss')"
              />
            </div>
          </div>

          <!-- 7. 管理行动建议 -->
          <div
            class="relative overflow-hidden rounded-lg bg-blue-600 p-8 text-white"
          >
            <div class="absolute right-[-20px] top-[-20px] opacity-10">
              <span class="i-lucide-brain text-[150px]"></span>
            </div>
            <div class="relative z-10">
              <div class="mb-4 flex items-center gap-2 text-xl font-bold">
                <span class="i-lucide-lightbulb"></span>
                {{ t('qms.reports.summary.managementInsights') }}
              </div>
              <div class="grid grid-cols-2 gap-10">
                <div class="space-y-4">
                  <div
                    class="border-l-2 border-white pl-2 text-xs font-bold uppercase tracking-widest text-blue-100"
                  >
                    {{ t('qms.reports.summary.trends') }}
                  </div>
                  <ul class="list-disc space-y-3 pl-4 text-sm">
                    <li v-if="(reportData.metrics?.[0]?.trend ?? 0) < 0">
                      {{ t('qms.reports.summary.insight.passRateDown') }} ({{
                        t('common.unit.decrease') || '降幅'
                      }}
                      <b class="text-yellow-300"
                        >{{ Math.abs(reportData.metrics?.[0]?.trend ?? 0) }}%</b
                      >)，{{
                        t('qms.reports.summary.insight.passRateAction')
                      }}。
                    </li>
                    <li v-if="(reportData.metrics?.[1]?.trend ?? 0) > 0">
                      {{ t('qms.reports.summary.insight.lossUp') }}，{{
                        t('qms.reports.summary.insight.lossAction')
                      }}。
                    </li>
                    <li v-else>
                      {{ t('qms.reports.summary.insight.qualityStable') }}。
                    </li>
                  </ul>
                </div>
                <div class="space-y-4">
                  <div
                    class="border-l-2 border-white pl-2 text-xs font-bold uppercase tracking-widest text-blue-100"
                  >
                    {{ t('qms.reports.summary.actions') }}
                  </div>
                  <ul class="list-disc space-y-3 pl-4 text-sm">
                    <li v-if="reportData.suppliers.worst.length > 0">
                      {{
                        t('qms.reports.summary.insight.supplierWorst', {
                          name: reportData.suppliers.worst[0]?.name,
                        })
                      }}
                    </li>
                    <li v-if="reportData.defects.length > 0">
                      {{
                        t('qms.reports.summary.insight.defectHigh', {
                          name: reportData.defects[0]?.name,
                        })
                      }}
                    </li>
                    <li>
                      {{ t('qms.reports.summary.insight.majorEventAction') }}。
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- 8. 签字确认区 -->
          <div class="mt-16 flex justify-between border-t pt-10 text-sm">
            <div class="space-y-10">
              <div>
                {{ t('qms.reports.summary.preparedBy') }}:
                <span class="ml-2 inline-block w-32 border-b text-center">{{
                  dayjs().format('YYYY-MM-DD')
                }}</span>
              </div>
              <div>
                {{ t('qms.reports.summary.deptReview') }}:
                <span class="ml-2 inline-block w-32 border-b"></span>
              </div>
            </div>
            <div class="space-y-10 text-right">
              <div>
                {{ t('qms.reports.summary.approvalDate') }}:
                <span class="ml-2 inline-block w-32 border-b"></span>
              </div>
              <div>
                {{ t('qms.reports.summary.managementSignOff') }}:
                <span class="ml-2 inline-block w-48 border-b"></span>
              </div>
            </div>
          </div>
        </div>
        <Empty
          v-else-if="!loading"
          :description="t('qms.reports.summary.noData')"
        />
      </Spin>
    </div>
  </Page>
</template>

<style scoped>
@media print {
  body {
    background: white !important;
  }

  .no-print {
    display: none !important;
  }

  .print-area {
    padding: 0 !important;
    border-top: none !important;
    box-shadow: none !important;
  }

  .bg-gray-100 {
    background: white !important;
  }

  /* 确保打印时保留背景颜色 */
  .bg-blue-600 {
    background-color: #2563eb !important;
    -webkit-print-color-adjust: exact;
  }

  .bg-gray-50 {
    background-color: #f9fafb !important;
    -webkit-print-color-adjust: exact;
  }

  .text-white {
    color: white !important;
  }
}

.print-area {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.6;
}

/* 隐藏滚动条但保留功能 */
.print-area::-webkit-scrollbar {
  display: none;
}
</style>
