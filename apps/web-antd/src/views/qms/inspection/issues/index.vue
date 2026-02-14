<script lang="ts" setup>
import type { InspectionIssue } from './types';
// Types

import type { VxeGridProps } from '#/adapter/vxe-table';
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
  Row,
  Select,
  Statistic,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getInspectionIssues,
  importInspectionIssues,
} from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import IssueChartDashboard from './components/IssueChartDashboard.vue';
import IssueEditModal from './components/IssueEditModal.vue';
import { useAiReport } from './composables/useAiReport';
// Composables
import { useIssueActions } from './composables/useIssueActions';
import { useIssueChartPreferences } from './composables/useIssueChartPreferences';
import { useIssueData } from './composables/useIssueData';
import { useIssueRemoteStatistics } from './composables/useIssueRemoteStatistics';
import { gridColumns, searchFormSchema } from './data';
import {
  getSeverityColor,
  getSeverityLabel,
  getStatusColor,
  getStatusLabel,
} from './utils/statusHelper';

interface GridFilterItem {
  field: string;
  values?: unknown[];
}

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

type InspectionGridRow = InspectionIssue & {
  photoExportUrl: string;
  photos: string[];
};

function extractPhotoUrl(photo: unknown): string | undefined {
  if (typeof photo === 'string') {
    return photo.trim() || undefined;
  }
  if (photo && typeof photo === 'object') {
    const url = (photo as { url?: unknown }).url;
    if (typeof url === 'string') {
      return url.trim() || undefined;
    }
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeInspectionRows(data: InspectionIssue[]): InspectionGridRow[] {
  return (data || []).map((item) => {
    const photoList = Array.isArray(item.photos)
      ? item.photos
          .map((photo) => extractPhotoUrl(photo))
          .filter((value): value is string => isNonEmptyString(value))
      : [];
    return {
      ...item,
      photos: photoList,
      photoExportUrl: photoList[0] || '',
    };
  });
}

const exportInspectionIssuesAsXlsx =
  createVxePhotoXlsxExportMethod<InspectionGridRow>({
    sheetName: t('qms.inspection.issues.title'),
    filename: () => `${t('qms.inspection.issues.title')}-${Date.now()}.xlsx`,
    getPhotoUrl: (row) => row.photoExportUrl || '',
    getRows: async ({ mode, $table, $grid }) => {
      if (mode === 'selected') {
        return normalizeInspectionRows($table.getCheckboxRecords() || []);
      }
      if (mode === 'all') {
        const proxyInfo = $grid?.getProxyInfo?.();
        const formValues = proxyInfo?.form || {};
        const filterParams: Record<string, unknown[]> = {};
        (proxyInfo?.filter || []).forEach((item: GridFilterItem) => {
          const values = item.values;
          if (values && values.length > 0) {
            filterParams[item.field] = values;
          }
        });
        const { items } = await getInspectionIssues({
          year: currentYear.value,
          workOrderNumber: formValues?.workOrderNumber as string,
          projectName: formValues?.projectName as string,
          status: (filterParams.status?.[0] || formValues?.status) as string,
          processName: formValues?.processName as string,
          ...(filterParams as Record<string, string | string[] | unknown>),
        });
        return normalizeInspectionRows(items || []);
      }
      const tableData = $table.getTableData?.();
      return normalizeInspectionRows(tableData?.fullData || []);
    },
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
    importMethod: ({ file }: { file: File }) => handleImport({ file }),
  },
  exportConfig: {
    remote: true,
    exportMethod: exportInspectionIssuesAsXlsx,
    types: ['xlsx'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
    { type: 'checkbox', width: 50 },
    ...(gridColumns || []).map((col) => {
      // Add filters to specific columns
      if (col.field === 'status') {
        return {
          ...col,
          filters: [
            { label: t('qms.inspection.issues.status.open'), value: 'OPEN' },
            {
              label: t('qms.inspection.issues.status.in_progress'),
              value: 'IN_PROGRESS',
            },
            {
              label: t('qms.inspection.issues.status.resolved'),
              value: 'RESOLVED',
            },
            {
              label: t('qms.inspection.issues.status.closed'),
              value: 'CLOSED',
            },
          ],
        };
      }
      if (col.field === 'severity') {
        return {
          ...col,
          filters: [
            { label: 'Critical', value: 'Critical' },
            { label: 'Major', value: 'Major' },
            { label: 'Minor', value: 'Minor' },
          ],
        };
      }
      if (col.field === 'defectType') {
        return {
          ...col,
          filters: [
            { label: '外观问题', value: '外观问题' },
            { label: '尺寸问题', value: '尺寸问题' },
            { label: '功能问题', value: '功能问题' },
            { label: '材料问题', value: '材料问题' },
            { label: '包装问题', value: '包装问题' },
            { label: '其他', value: '其他' },
          ],
        };
      }

      // 处理部门/事业部名称映射
      if (col.field === 'division' || col.field === 'responsibleDepartment') {
        return {
          ...col,
          formatter: ({ cellValue }: { cellValue: string | unknown }) => {
            if (!cellValue) return '';
            const name = findNameById(deptRawData.value, cellValue as string);
            return name || (cellValue as string);
          },
        };
      }
      // ... (rest of the column processing)
      if (col.field === 'updatedAt' || col.field === 'reportDate') {
        return {
          ...col,
          formatter: ({ cellValue }: { cellValue: string | unknown }) => {
            if (!cellValue) return '';
            const format =
              col.field === 'reportDate' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss';
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
  filterConfig: {
    remote: true, // Enable remote filtering
  },
  proxyConfig: {
    autoLoad: true,
    sort: true,
    filter: true, // Enable filter proxy
    props: {
      result: 'items',
      total: 'total',
    },
    ajax: {
      query: async (
        {
          page,
          sorts,
          filters,
        }: {
          filters: GridFilterItem[];
          page: { currentPage?: number; pageSize?: number };
          sorts: Array<{ field?: string; order?: 'asc' | 'desc' }>;
        },
        formValues: Record<string, unknown> = {},
      ) => {
        const sortParam = sorts?.[0];

        // Parse filters
        const filterParams: Record<string, unknown[]> = {};
        filters?.forEach((item) => {
          const values = item.values;
          if (values && values.length > 0) {
            filterParams[item.field] = values;
          }
        });

        const { items, total } = await getInspectionIssues({
          page: page?.currentPage || 1,
          pageSize: page?.pageSize || 20,
          sortBy: sortParam?.field,
          sortOrder: sortParam?.order,
          year: currentYear.value,
          workOrderNumber: formValues?.workOrderNumber as string,
          projectName: formValues?.projectName as string,
          status: (filterParams.status?.[0] || formValues?.status) as string, // Priority to column filter or merge? Let's use column filter if present
          // For now, mapping specific fields we enable filtering for
          // If status is filtered by column, use that.
          // Note: multiple select in column filter returns array. Backend might expect string or array.
          // Let's assume backend currently handles single status via params.status.
          // We might need to update backend to handle arrays or just take the first one for now if unsupported.
          // Update: getIssues params definition in frontend api might need update to accept arrays.
          // Let's pass the raw values to api and update api/service.
          ...filterParams, // Spread other filters like severity, defectType
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
  gridEvents,
  formOptions: {
    schema: searchFormSchema,
    submitOnChange: true,
  },
});

// ================= 统计逻辑 =================
const { showCharts, loadPreferences, handleSaveSystemDefault } =
  useIssueChartPreferences();
const { statistics, fetchStatistics } = useIssueRemoteStatistics();
const refreshStatistics = () => fetchStatistics(currentYear.value);

watch(currentYear, () => {
  refreshStatistics();
  gridApi.reload();
});

onMounted(() => {
  loadInitialData().then(() => {
    gridApi.reload();
  });
  loadPreferences();
  refreshStatistics();
});

// 使用 AI 报告 composable
const { isGeneratingInsight, generateReport } = useAiReport();

async function handleGenerateInsight() {
  await generateReport(statistics.value, currentYear.value);
}

// ================= 操作逻辑 =================
const {
  modalVisible,
  isEditMode,
  currentRecord,
  handleOpenModal,
  handleEdit,
  handleDelete,
  handleBatchDelete,
  handleSettleToKnowledge,
} = useIssueActions({
  checkedRows,
  t,
  invalidateInspectionIssues,
  gridApi,
  onAfterDeleteSuccess: refreshStatistics,
});
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
          refreshStatistics();
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
