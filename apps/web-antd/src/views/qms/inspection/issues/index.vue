<script lang="ts" setup>
import type { InspectionIssue, PieDataItem, StatisticsData } from './types';
// Types

import type { VxeGridProps } from '#/adapter/vxe-table';
// Types
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Col,
  Image,
  message,
  Modal,
  Row,
  Select,
  Statistic,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteInspectionIssues,
  deleteInspectionIssue,
  getInspectionIssues,
  getInspectionIssueStats,
  importInspectionIssues,
} from '#/api/qms/inspection';
import {
  getMergedPreferenceApi,
  saveSystemSettingApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useKnowledgeSettlement } from '#/hooks/useKnowledgeSettlement';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';

import IssueChartDashboard from './components/IssueChartDashboard.vue';
import IssueEditModal from './components/IssueEditModal.vue';
import { useAiReport } from './composables/useAiReport';
// Composables
import { useIssueData } from './composables/useIssueData';
import { gridColumns, searchFormSchema } from './data';
import {
  getSeverityColor,
  getSeverityLabel,
  getStatusColor,
  getStatusLabel,
} from './utils/statusHelper';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

const { canEdit, canDelete, canImport } = useQmsPermissions(
  'QMS:Inspection:Issues',
);

const canSettle = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:Settle']),
);
const canAddChart = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:ChartAdd']),
);

const userStore = useUserStore();
const isAdmin = computed(() => {
  return (
    userStore.userRoles?.some((role: string) => {
      const lowerRole = role.toLowerCase();
      return lowerRole.includes('admin') || lowerRole.includes('super');
    }) || false
  );
});

const checkedRows = ref<InspectionIssue[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records as unknown as InspectionIssue[];
}

// ================= 权限与数据管理 =================
const { invalidateInspectionIssues } = useInvalidateQmsQueries();

// 使用数据加载 composable
const { deptTreeData, deptRawData, loadInitialData } = useIssueData();

// 加载初始数据
loadInitialData().then(() => {
  // 初始数据加载完成后，刷新表格以应用部门名称转换
  gridApi.reload();
});

// ================= 表格配置 =================
const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const filteredIssues = ref<InspectionIssue[]>([]);
const chartDashboardRef = ref();

// Import Logic
const { handleImport } = useGridImport({
  gridApi: computed(() => gridApi),
  importApi: importInspectionIssues,
});

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

const gridOptions = computed<VxeGridProps['gridOptions']>(() => ({
  checkboxConfig: {
    reserve: true,
    highlight: true,
  },
  toolbarConfig: {
    export: true,
    refresh: true,
    import: canImport.value,
    search: true,
    zoom: true,
    custom: true,
    slots: { buttons: 'toolbar-actions' },
  },
  importConfig: {
    remote: true,
    importMethod: ({ file }: any) => handleImport({ file }),
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
    { type: 'checkbox', width: 50 },
    ...(gridColumns || []).map((col) => {
      // 处理部门/事业部名称映射
      if (col.field === 'division' || col.field === 'responsibleDepartment') {
        return {
          ...col,
          formatter: ({ cellValue }: { cellValue: string | unknown }) => {
            if (!cellValue) return '';
            // 确保从响应式的 deptRawData 中查找
            const name = findNameById(deptRawData.value, cellValue as string);
            return name || (cellValue as string);
          },
        };
      }
      // 处理时间格式化和时区
      if (col.field === 'updatedAt' || col.field === 'reportDate') {
        return {
          ...col,
          formatter: ({ cellValue }: { cellValue: string | unknown }) => {
            if (!cellValue) return '';
            const format =
              col.field === 'reportDate' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss';
            // 使用 dayjs 转换 UTC 到本地时区
            const date = dayjs(cellValue as Date | number | string);
            return date.isValid() ? date.format(format) : (cellValue as string);
          },
        };
      }
      if (col.slots?.default === 'action') {
        return {
          ...col,
          slots: undefined,
          cellRender: {
            name: 'CellOperation',
            props: {
              options: [
                ...(canEdit.value ? ['edit'] : []),
                ...(canSettle.value
                  ? [
                      {
                        code: 'settle',
                        icon: 'lucide:book-check',
                        title: t('qms.inspection.issues.settleToKnowledge'),
                      },
                    ]
                  : []),
                ...(canDelete.value ? ['delete'] : []),
              ],
              onClick: ({
                code,
                row,
              }: {
                code: string;
                row: InspectionIssue;
              }) => {
                if (code === 'edit') handleEdit(row);
                if (code === 'delete') handleDelete(row);
                if (code === 'settle') handleSettleToKnowledge(row);
              },
            },
          },
        };
      }
      return col;
    }),
  ],
  pagerConfig: {
    enabled: true,
    pageSize: 20,
    pageSizes: [10, 20, 30, 50, 100],
  },
  sortConfig: {
    remote: true,
    trigger: 'cell',
  },
  proxyConfig: {
    autoLoad: true,
    sort: true,
    props: {
      result: 'items',
      total: 'total',
    },
    ajax: {
      query: async (
        {
          page,
          sorts,
        }: {
          page: { currentPage?: number; pageSize?: number };
          sorts: any[];
        },
        formValues: Record<string, unknown> = {},
      ) => {
        const sortParam = sorts?.[0];
        const { items, total } = await getInspectionIssues({
          page: page?.currentPage || 1,
          pageSize: page?.pageSize || 20,
          sortBy: sortParam?.field,
          sortOrder: sortParam?.order,
          year: currentYear.value,
          workOrderNumber: formValues?.workOrderNumber as string,
          projectName: formValues?.projectName as string,
          status: formValues?.status as string,
          processName: formValues?.processName as string,
        });

        filteredIssues.value = items;
        return { items, total };
      },
      queryAll: async ({ form }: { form: Record<string, unknown> }) => {
        const formValues = form || {};
        const { items } = await getInspectionIssues({
          year: currentYear.value,
          workOrderNumber: formValues?.workOrderNumber as string,
          projectName: formValues?.projectName as string,
          status: formValues?.status as string,
          processName: formValues?.processName as string,
        });
        return { items };
      },
    },
  },
}));

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions.value,
  gridEvents: gridEvents,
  formOptions: {
    schema: searchFormSchema,
    submitOnChange: true,
  },
});

// ================= 统计逻辑 =================
const showCharts = ref(false);
const isFirstLoad = ref(true);

// 加载偏好设置
async function loadPreferences() {
  try {
    const pref = await getMergedPreferenceApi(
      'inspection-issues-charts',
      'qms:inspection_issues:default_charts',
    );
    if (pref) {
      showCharts.value = !!pref.showCharts;
    }
  } catch (error) {
    console.error('Failed to load preferences', error);
  } finally {
    isFirstLoad.value = false;
  }
}

// 保存偏好设置
async function savePreferences() {
  if (isFirstLoad.value) return;
  try {
    await saveUserPreferenceApi('inspection-issues-charts', {
      showCharts: showCharts.value,
    });
  } catch (error) {
    console.error('Failed to save preferences', error);
  }
}

// 监听状态变化并自动保存
watch(showCharts, () => {
  if (isFirstLoad.value) return;
  savePreferences();
});

async function handleSaveSystemDefault() {
  try {
    await saveSystemSettingApi('qms:inspection_issues:default_charts', {
      showCharts: showCharts.value,
    });
    message.success('已存为系统默认配置');
  } catch (error) {
    console.error('Failed to save system default', error);
    message.error('保存失败');
  }
}

// 使用统计 composable
const statistics = ref<StatisticsData>({
  totalCount: 0,
  openCount: 0,
  closedCount: 0,
  totalLoss: 0,
  closedRate: 0,
  pieData: [],
  trendData: [],
  pareto: [],
});

async function fetchStatistics() {
  try {
    const res = await getInspectionIssueStats({ year: currentYear.value });
    // Calculate pareto on frontend based on pieData
    let cumulativeCount = 0;
    const totalCount = res.totalCount || 0;
    const pareto = (res.pieData || []).map((item: PieDataItem) => {
      cumulativeCount += item.value;
      return {
        label: item.name,
        value: item.value,
        percent:
          totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0,
        cumulativePercent:
          totalCount > 0 ? Math.round((cumulativeCount / totalCount) * 100) : 0,
      };
    });

    statistics.value = { ...res, pareto };
  } catch (error) {
    console.error('Failed to fetch statistics:', error);
  }
}

watch(currentYear, () => {
  fetchStatistics();
  gridApi.reload();
});

onMounted(() => {
  loadInitialData().then(() => {
    gridApi.reload();
  });
  loadPreferences();
  fetchStatistics();
});

// 使用 AI 报告 composable
const { isGeneratingInsight, generateReport } = useAiReport();

async function handleGenerateInsight() {
  await generateReport(statistics.value, currentYear.value);
}

// ================= 操作逻辑 =================
const modalVisible = ref(false);
const isEditMode = ref(false);
const currentRecord = ref<InspectionIssue | null>(null);

function handleOpenModal() {
  isEditMode.value = false;
  currentRecord.value = null;
  modalVisible.value = true;
}

function handleEdit(row: InspectionIssue) {
  isEditMode.value = true;
  currentRecord.value = { ...row };
  modalVisible.value = true;
}

async function handleDelete(row: InspectionIssue) {
  Modal.confirm({
    title: t('qms.inspection.issues.deleteConfirm'),
    content: t('qms.inspection.issues.deleteContent', {
      ncNumber: row.ncNumber,
    }),
    onOk: async () => {
      try {
        await deleteInspectionIssue(row.id);
        message.success(t('common.deleteSuccess'));
        invalidateInspectionIssues();
        gridApi.reload();
        fetchStatistics();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t('common.deleteFailed');
        message.error(errorMessage);
      }
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) {
    message.warning(t('common.pleaseSelectData'));
    return;
  }
  Modal.confirm({
    title: t('common.confirmBatchDelete'),
    content: t('common.confirmBatchDeleteContent', {
      count: checkedRows.value.length,
    }),
    onOk: async () => {
      try {
        const ids = checkedRows.value.map((r: InspectionIssue) => r.id);
        const res = await batchDeleteInspectionIssues(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        invalidateInspectionIssues();
        gridApi.reload();
        fetchStatistics();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

const { settle: settleToKnowledge } = useKnowledgeSettlement();

function handleSettleToKnowledge(row: InspectionIssue) {
  settleToKnowledge({
    title: `【${t('qms.dashboard.overview.processIssues')}】${
      row.workOrderNumber || ''
    } - ${row.partName}`,
    summary: row.description,
    categoryId: 'CAT-DEFAULT',
    photos: row.photos,
    attachmentNamePrefix: '现场图片',
    tags: [row.defectType, row.division, row.partName, row.projectName],
    sections: [
      {
        title: t('qms.inspection.issues.description'),
        fields: [
          {
            label: t('qms.workOrder.workOrderNumber'),
            value: row.workOrderNumber,
          },
          { label: t('qms.workOrder.projectName'), value: row.projectName },
          { label: t('qms.inspection.issues.partName'), value: row.partName },
        ],
      },
      {
        title: t('qms.inspection.issues.description'),
        content: row.description,
      },
      {
        title: t('qms.inspection.issues.rootCause'),
        content: row.rootCause || t('common.unknown'),
      },
      {
        title: t('qms.inspection.issues.solution'),
        content: row.solution || t('common.notSet'),
      },
    ],
  });
}
</script>

<template>
  <Page class="h-full">
    <div v-if="showCharts" class="mb-4">
      <IssueChartDashboard ref="chartDashboardRef" :year="currentYear" />
    </div>

    <!-- 核心统计概览 -->
    <Card size="small" class="mb-4 border-none bg-gray-50 shadow-sm">
      <Row :gutter="16" class="items-center text-center">
        <Col :span="5">
          <Statistic
            :title="t('qms.inspection.issues.totalCount')"
            :value="statistics.totalCount"
          />
        </Col>
        <Col :span="5">
          <Statistic
            :title="t('qms.inspection.issues.status.open')"
            :value="statistics.openCount"
            :value-style="{ color: '#cf1322' }"
          />
        </Col>
        <Col :span="5">
          <Statistic
            :title="t('qms.inspection.issues.status.closed')"
            :value="statistics.closedCount"
            :value-style="{ color: '#3f8600' }"
          />
        </Col>
        <Col :span="5">
          <Statistic
            :title="`${t('qms.inspection.issues.lossAmount')} (RMB)`"
            :value="statistics.totalLoss"
            prefix="¥"
            :precision="2"
          />
        </Col>
        <Col :span="4">
          <Button
            type="primary"
            shape="round"
            block
            :loading="isGeneratingInsight"
            @click="handleGenerateInsight"
          >
            <span class="i-lucide-scroll-text mr-1"></span>
            {{ t('qms.inspection.issues.aiInsightReport') }}
          </Button>
        </Col>
      </Row>
    </Card>

    <Grid class="h-full" :grid-api="gridApi" :grid-events="gridEvents">
      <template #status="{ row }">
        <Tag :color="getStatusColor(row.status)">
          {{ getStatusLabel(row.status) }}
        </Tag>
      </template>
      <template #claim="{ row }">
        <Tag
          :color="row.claim === 'Yes' || row.claim === true ? 'red' : 'green'"
        >
          {{
            row.claim === 'Yes' || row.claim === true
              ? t('common.yes')
              : t('common.no')
          }}
        </Tag>
      </template>
      <template #photos="{ row }">
        <div
          v-if="row.photos && row.photos.length > 0"
          class="flex items-center justify-center"
        >
          <Image
            :width="40"
            :height="40"
            :src="Array.isArray(row.photos) ? row.photos[0] : row.photos"
            class="rounded shadow-sm"
          />
        </div>
      </template>
      <template #severity="{ row }">
        <Tag :color="getSeverityColor(row.severity)">
          {{ getSeverityLabel(row.severity) }}
        </Tag>
      </template>
      <template #toolbar-actions>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            v-access:code="'QMS:Inspection:Issues:Create'"
            shape="round"
            type="primary"
            @click="handleOpenModal"
          >
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            {{ t('qms.inspection.issues.createIssue') }}
          </Button>
          <Button
            v-if="checkedRows.length > 0 && canDelete"
            danger
            shape="round"
            type="primary"
            @click="handleBatchDelete"
          >
            <template #icon>
              <IconifyIcon icon="lucide:trash-2" />
            </template>
            {{ t('common.batchDelete') }}
          </Button>
          <Button
            v-if="canAddChart"
            shape="round"
            @click="
              () => {
                showCharts = true;
                chartDashboardRef?.handleAddCustomChart();
              }
            "
          >
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增图表
          </Button>
          <Button shape="round" @click="showCharts = !showCharts">
            <template #icon>
              <IconifyIcon
                :icon="showCharts ? 'lucide:bar-chart-3' : 'lucide:bar-chart-3'"
              />
            </template>
            {{ showCharts ? t('common.hideChart') : t('common.showChart') }}
          </Button>
          <div class="flex items-center gap-2">
            <span class="text-gray-500"
              >{{ t('qms.inspection.records.statsYear') }}:</span
            >
            <Select
              v-model:value="currentYear"
              :options="yearOptions"
              class="w-[120px]"
              @change="() => gridApi.reload()"
            />
          </div>
          <Button
            v-if="isAdmin"
            shape="round"
            type="link"
            @click="handleSaveSystemDefault"
          >
            <template #icon>
              <IconifyIcon icon="lucide:save" />
            </template>
            存为系统默认
          </Button>
        </div>
      </template>
    </Grid>

    <IssueEditModal
      v-model:open="modalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="currentRecord || undefined"
      :dept-tree-data="deptTreeData"
      @success="
        () => {
          gridApi.reload();
          fetchStatistics();
        }
      "
    />
  </Page>
</template>

<style scoped>
/* 针对表格内图片的样式优化 */
:deep(.vxe-cell .ant-image) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px !important;
  height: 40px !important;
  overflow: hidden;
  border-radius: 4px;
}

:deep(.vxe-cell .ant-image-img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
