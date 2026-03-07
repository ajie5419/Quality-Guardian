<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { QualityReportSummary } from '#/api/qms/reports';

import { computed, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Card,
  DatePicker,
  Empty,
  message,
  RadioButton,
  RadioGroup,
  Space,
  Spin,
  Tag,
  TypographyTitle,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { getSummaryReport } from '#/api/qms/reports';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import MonthlyReportContent from '../MonthlyReportContent.vue';
import WeeklyReport from '../WeeklyReport.vue';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const loading = ref(false);

const canExport = computed(() => {
  // Restore button visibility for all viewers of this page
  return true;
});

const reportType = ref<'monthly' | 'weekly'>('weekly');
const targetDate = ref<Dayjs>(dayjs());
const reportData = ref<null | QualityReportSummary>(null);
const reportTypeText = computed(() =>
  reportType.value === 'weekly'
    ? t('qms.reports.summary.weekly')
    : t('qms.reports.summary.monthly'),
);

// Computed dates for weekly report
const weeklyRange = computed(() => {
  if (reportType.value !== 'weekly') return { start: '', end: '' };
  const start = targetDate.value.startOf('week').format('YYYY-MM-DD');
  const end = targetDate.value.endOf('week').format('YYYY-MM-DD');
  return { start, end };
});

async function loadReport() {
  // If weekly, let component handle it (or we could fetch here, but component is self-contained now)
  if (reportType.value === 'weekly') return;

  loading.value = true;
  try {
    const data = await getSummaryReport({
      type: reportType.value,
      date: targetDate.value.format('YYYY-MM-DD'),
    });
    reportData.value = data;
  } catch (error) {
    handleApiError(error, 'Load Summary Report');
  } finally {
    loading.value = false;
  }
}

async function handlePrint() {
  if (reportType.value === 'weekly') {
    // Basic export for now, or just print window
    // Weekly Report component doesn't expose export yet, but window.print works if CSS is right
    // or we can use html2canvas if we grab the element
    const { default: html2canvas } = await import('html2canvas');
    const element = document.querySelector<HTMLElement>(
      '#weekly-report-container',
    );
    if (element) {
      try {
        const canvas = await html2canvas(element, { useCORS: true, scale: 2 });
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `周报_${weeklyRange.value.start}.png`;
        link.click();
        message.success('导出成功');
      } catch {
        message.error('导出失败');
      }
    }
  } else {
    window.print();
  }
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
            {{
              reportType === 'weekly'
                ? '导出图片'
                : t('qms.reports.summary.generatePdf')
            }}
          </Button>
        </div>
      </Card>

      <Spin :spinning="loading">
        <div
          class="print-area rounded-sm border-t-8 border-blue-600 bg-white p-10 shadow-xl"
        >
          <!-- 2. 报告抬头 (Shared Header) -->
          <div class="mb-10 flex items-start justify-between">
            <div>
              <div
                class="mb-1 text-2xl font-black tracking-tighter text-blue-600"
              >
                {{ t('qms.reports.summary.title') }}
              </div>
              <TypographyTitle :level="1" class="m-0 text-gray-800">
                {{
                  reportType === 'weekly' ? '周质量分析报告' : reportData?.title
                }}
              </TypographyTitle>
              <div class="mt-2 flex items-center gap-4">
                <Tag color="blue" class="font-mono">
                  {{
                    reportType === 'weekly'
                      ? `${weeklyRange.start} ~ ${weeklyRange.end}`
                      : reportData?.period
                  }}
                </Tag>
                <span class="text-xs text-gray-400"
                  >{{ t('qms.reports.summary.reportNo') }}: QMS-RPT-{{
                    dayjs(targetDate).format('YYYYMMDD')
                  }}-{{ reportTypeText }}</span
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

          <!-- Weekly Report Content -->
          <div v-if="reportType === 'weekly'">
            <WeeklyReport
              v-if="weeklyRange.start && weeklyRange.end"
              :start-date="weeklyRange.start"
              :end-date="weeklyRange.end"
            />
            <div v-else class="py-10 text-center text-gray-400">
              {{ t('qms.reports.summary.invalidDateRange') }}
            </div>
          </div>

          <MonthlyReportContent
            v-else-if="reportData"
            :report-data="reportData"
            :render-sparkline="renderSparkline"
            :t="t"
          />

          <Empty v-else :description="t('qms.reports.summary.noData')" />

          <!-- 8. 签字确认区 (Shared Footer) -->
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
