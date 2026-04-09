<script lang="ts" setup>
import type { DailySummaryData } from '#/api/qms/reports';
import type { Dept } from '#/api/system/dept';

import { computed, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { Button, DatePicker, Input, message, Tag } from 'ant-design-vue';

import { getDailySummary, saveDailySummary } from '#/api/qms/reports';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import ReportTable from './components/ReportTable.vue';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const userStore = useUserStore();

// Constants for status
const STATUS_CLOSED = new Set(['Closed', 'CLOSED']);

function getIssueStatusColor(status: string) {
  if (STATUS_CLOSED.has(status)) return 'success';
  if (['IN_PROGRESS', '处理中'].includes(status)) return 'processing';
  if (['RESOLVED', '待验证'].includes(status)) return 'warning';
  return 'error';
}

function getIssueStatusLabel(status: string) {
  if (STATUS_CLOSED.has(status)) {
    return t('qms.inspection.issues.status.closed');
  }
  if (['IN_PROGRESS', '处理中'].includes(status)) return '处理中';
  if (['RESOLVED', '待验证'].includes(status)) return '待验证';
  return t('qms.inspection.issues.status.open');
}

const canExport = computed(() => {
  // If user has direct permission OR if we want to allow it for anyone who can see the page
  // To restore the button immediately for the user, we return true.
  return true;
});

const currentDate = ref<string>(new Date().toISOString().split('T')[0] ?? '');
const loading = ref(false);
const saving = ref(false);
const summary = ref('');
const reportRef = ref<HTMLElement | null>(null);
const deptRawData = ref<Dept[]>([]);

/**
 * Optimized department lookup mapping
 */
const deptMap = computed(() => {
  const map: Record<string, string> = {};
  const traverse = (list: Dept[]) => {
    for (const item of list) {
      map[item.id] = item.name;
      if (item.children?.length) {
        traverse(item.children);
      }
    }
  };
  traverse(deptRawData.value);
  return map;
});

const reportData = ref<DailySummaryData>({
  archiveStats: {
    archivedCount: 0,
    missingTemplateCount: 0,
    overdueCount: 0,
    requiredCount: 0,
    timelinessRate: 0,
  },
  documentItems: [],
  engineeringTodos: [],
  reporter: '',
  date: '',
  inspections: [],
  issues: [],
  summary: '',
});
type TableRecord = Record<string, unknown>;

function normalizeDocumentItems() {
  reportData.value.documentItems = reportData.value.documentItems.map(
    (item, index) => ({
      projectName: String(item.projectName || ''),
      seq: index + 1,
      status: String(item.status || 'OPEN'),
      workContent: String(item.workContent || ''),
      workOrder: String(item.workOrder || ''),
    }),
  );
}

async function loadDeptData() {
  try {
    deptRawData.value = await getDeptList();
  } catch (error) {
    handleApiError(error, 'Load Report Department Data');
  }
}

async function loadData() {
  loading.value = true;
  try {
    const data = await getDailySummary({
      date: currentDate.value,
      user: userStore.userInfo?.username,
    });
    reportData.value = data;
    normalizeDocumentItems();
    summary.value = data.summary || '';
  } catch (error) {
    handleApiError(error, 'Load Daily Summary');
    message.error(t('qms.common.dataLoadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleSaveDailySummary() {
  try {
    saving.value = true;
    normalizeDocumentItems();
    await saveDailySummary({
      date: currentDate.value,
      documentItems: reportData.value.documentItems,
      summary: summary.value,
      user: userStore.userInfo?.username,
    });
    message.success('日报已保存');
  } catch (error) {
    handleApiError(error, 'Save Daily Summary');
    message.error('保存日报失败');
  } finally {
    saving.value = false;
  }
}

async function handleExportImage() {
  if (!reportRef.value) return;
  try {
    loading.value = true;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(reportRef.value, {
      useCORS: true,
      scale: 3,
      ignoreElements: (element) => element.tagName === 'SCRIPT',
    });
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${t('qms.reports.dailyTitle')}_${currentDate.value}_${userStore.userInfo?.realName || 'User'}.png`;
    link.click();
    message.success(t('qms.reports.exportSuccess') || '图片导出成功');
  } catch (error) {
    handleApiError(error, 'Export Report Image');
    message.error(t('qms.reports.exportFailed') || '图片导出失败');
  } finally {
    loading.value = false;
  }
}

// Table Column Definitions
const inspectionColumns = [
  {
    title: t('qms.afterSales.columns.seq'),
    key: 'seq',
    width: '64px',
    align: 'center' as const,
    class: 'font-bold',
  },
  {
    title: t('qms.workOrder.workOrderNumber'),
    key: 'workOrder',
    class: 'font-bold whitespace-nowrap',
  },
  { title: t('qms.workOrder.projectName'), key: 'projectName' },
  { title: `${t('qms.inspection.issues.partName')}`, key: 'partName' },
  { title: t('qms.inspection.records.form.process'), key: 'process' },
  {
    title: t('qms.workOrder.quantity'),
    key: 'quantity',
    width: '96px',
    align: 'center' as const,
  },
  {
    title: t('qms.inspection.records.form.result'),
    key: 'result',
    width: '96px',
    align: 'center' as const,
    class: (record: TableRecord) =>
      String(record.result) === t('qms.inspection.records.result.pass')
        ? 'text-green-500 font-bold'
        : 'text-red-500 font-bold',
  },
];

const issueColumns = [
  {
    title: t('qms.afterSales.columns.seq'),
    key: 'seq',
    width: '64px',
    align: 'center' as const,
    class: 'font-bold',
  },
  {
    title: t('qms.workOrder.workOrderNumber'),
    key: 'workOrder',
    class: 'whitespace-nowrap',
  },
  {
    title: t('qms.inspection.issues.partName'),
    key: 'partName',
    class: 'text-red-500',
  },
  {
    title: t('qms.inspection.issues.description'),
    key: 'description',
    class: 'text-red-500',
  },
  { title: t('qms.inspection.issues.solution'), key: 'solution' },
  {
    title: t('qms.inspection.issues.statusLabel'),
    key: 'status',
    align: 'center' as const,
  },
  {
    title: t('qms.inspection.issues.responsibleDepartment'),
    key: 'dept',
    width: '128px',
    align: 'center' as const,
  },
];

watch(currentDate, () => {
  loadData();
});

onMounted(() => {
  loadData();
  loadDeptData();
});
</script>

<template>
  <Page>
    <div ref="reportRef" class="space-y-6 rounded-lg bg-white p-8 text-lg">
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-4">
        <div>
          <h1 class="mb-2 text-4xl font-bold">
            {{ t('qms.reports.dailyTitle') }}
          </h1>
          <div class="text-xl uppercase text-gray-500">
            {{ t('qms.reports.title') }}
          </div>
        </div>
        <div class="space-y-2 text-right">
          <div>
            <span class="mr-2 text-xl font-bold"
              >{{ t('qms.reports.reporter') }}:</span
            >
            <span class="text-xl">{{
              reportData.reporter || userStore.userInfo?.realName
            }}</span>
          </div>
          <div>
            <span class="mr-2 text-xl font-bold"
              >{{ t('qms.reports.daily.date') }}:</span
            >
            <DatePicker
              v-model:value="currentDate"
              value-format="YYYY-MM-DD"
              :allow-clear="false"
              size="large"
            />
          </div>
        </div>
      </div>

      <!-- Section 1: Inspection Work -->
      <ReportTable
        :title="t('qms.reports.daily.inspections')"
        :columns="inspectionColumns"
        :data-source="reportData.inspections"
        :empty-text="t('qms.reports.daily.noInspections')"
      />

      <!-- Section 2: Exceptions & Issues -->
      <ReportTable
        :title="t('qms.reports.daily.issues')"
        :columns="issueColumns"
        :data-source="reportData.issues"
        :empty-text="t('qms.reports.daily.noIssues')"
      >
        <template #status="{ record }">
          <Tag :color="getIssueStatusColor(String(record.status || ''))">
            {{ getIssueStatusLabel(String(record.status || '')) }}
          </Tag>
        </template>
        <template #dept="{ record }">
          {{ deptMap[String(record.dept)] || String(record.dept || '') }}
        </template>
      </ReportTable>

      <!-- Section 3: Summary -->
      <div class="relative border border-gray-300 p-4">
        <div class="mb-2 text-xl font-bold text-gray-500">
          {{ t('qms.reports.daily.summaryTitle') }}
        </div>
        <Input.TextArea
          v-model:value="summary"
          :rows="3"
          :placeholder="t('qms.reports.daily.summaryPlaceholder')"
          class="w-full resize-none !border-0 p-0 text-lg focus:!shadow-none"
        />
      </div>
    </div>

    <!-- Footer Actions -->
    <div v-if="canExport" class="space-x-4 pt-4 text-center">
      <Button
        class="mr-4"
        type="primary"
        @click="handleSaveDailySummary"
        :loading="saving"
      >
        保存日报
      </Button>
      <Button class="mr-4" @click="handleExportImage" :loading="loading">
        {{ t('qms.reports.daily.export') }}
      </Button>
    </div>
  </Page>
</template>
