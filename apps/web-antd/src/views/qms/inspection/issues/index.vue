<script lang="ts" setup>
import type { InspectionIssue } from './types';
// Types

import type { VxeGridProps } from '#/adapter/vxe-table';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

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
} from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';

import IssueChartDashboard from './components/IssueChartDashboard.vue';
import IssueEditModal from './components/IssueEditModal.vue';
import { useAiReport } from './composables/useAiReport';
// Composables
import { useIssueData } from './composables/useIssueData';
import { useIssueStatistics } from './composables/useIssueStatistics';
import { gridColumns, searchFormSchema } from './data';
import { getStatusColor, getStatusLabel } from './utils/statusHelper';

const router = useRouter();
const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

// ================= 权限与数据管理 =================
const { invalidateInspectionIssues } = useInvalidateQmsQueries();

const canExport = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:Export']),
);
const canEdit = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:Edit']),
);
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:Delete']),
);
const canSettle = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:Settle']),
);

// 使用数据加载 composable
const {
  deptTreeData,
  deptRawData,
  workOrderList,
  supplierList,
  loadInitialData,
} = useIssueData();

// 加载初始数据
loadInitialData().then(() => {
  // 初始数据加载完成后，刷新表格以应用部门名称转换
  gridApi.reload();
});

// ================= 表格配置 =================
const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const filteredIssues = ref<InspectionIssue[]>([]);

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

const gridOptions = computed<VxeGridProps>(() => ({
  checkboxConfig: {
    reserve: true,
    highlight: true,
  },
  toolbarConfig: {
    export: canExport.value,
    import: true,
    search: true,
    slots: { buttons: 'toolbar-actions' },
  },
  importConfig: {
    remote: true,
    importMethod: async ({ file }: { file: File }) => {
      const { requestClient } = await import('#/api/request');
      const XLSX = await import('xlsx');

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
          type: 'array',
          cellDates: true,
        });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return;
        const worksheet = workbook.Sheets[sheetName]!;
        const results = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (!results || results.length === 0) return;

        const columns = gridApi.grid.getColumns();
        const mappedItems = results.map((row: any) => {
          const item: Record<string, any> = {};
          columns.forEach((col: any) => {
            const field = col.field;
            const title = col.title;
            if (field && title) {
              const excelKey = Object.keys(row).find(
                (k) =>
                  String(k).replaceAll(/\s+/g, '') ===
                  String(title).replaceAll(/\s+/g, ''),
              );
              if (excelKey) {
                let val = row[excelKey];
                if (val instanceof Date) {
                  val = val.toISOString().split('T')[0];
                }
                item[field] = val;
              }
            }
          });
          return item;
        });

        const res = await requestClient.post(
          '/qms/inspection/issues/import',
          {
            items: mappedItems,
          },
          { timeout: 120_000 },
        );

        if (res.successCount > 0) {
          message.success(
            t('common.importSuccessCount', { count: res.successCount }),
          );
          gridApi.reload();
        } else {
          message.error(t('common.importFailed'));
        }
      } catch (error) {
        console.error('Import Error:', error);
        message.error(t('common.importFailed'));
      }
    },
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
          formatter: ({ cellValue }: { cellValue: any }) => {
            if (!cellValue) return '';
            // 确保从响应式的 deptRawData 中查找
            const name = findNameById(deptRawData.value, cellValue);
            return name || cellValue;
          },
        };
      }
      // 处理时间格式化和时区
      if (col.field === 'updatedAt' || col.field === 'reportDate') {
        return {
          ...col,
          formatter: ({ cellValue }: { cellValue: any }) => {
            if (!cellValue) return '';
            const format =
              col.field === 'reportDate' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss';
            // 使用 dayjs 转换 UTC 到本地时区
            const date = dayjs(cellValue);
            return date.isValid() ? date.format(format) : cellValue;
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
            onClick: ({ code, row }: { code: string; row: any }) => {
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
        { page, sorts }: { page: any; sorts: any },
        formValues: any,
      ) => {
        const sortParam = sorts?.[0];
        const sortBy = sortParam?.field;
        const sortOrder = sortParam?.order;

        let allData = (await getInspectionIssues({
          year: currentYear.value,
        })) as InspectionIssue[];

        // 前端过滤
        if (formValues?.workOrderNumber) {
          allData = allData.filter((item) =>
            item.workOrderNumber?.includes(formValues.workOrderNumber),
          );
        }
        if (formValues?.projectName) {
          allData = allData.filter((item) =>
            item.projectName?.includes(formValues.projectName),
          );
        }
        if (formValues?.status) {
          allData = allData.filter((item) => item.status === formValues.status);
        }

        // 手动排序
        if (sortBy && sortOrder) {
          allData.sort((a, b) => {
            const aVal = (a as Record<string, any>)[sortBy] || '';
            const bVal = (b as Record<string, any>)[sortBy] || '';
            if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
            return aVal < bVal ? 1 : -1;
          });
        }

        filteredIssues.value = allData;

        const { currentPage = 1, pageSize = 20 } = page || {};
        const start = (currentPage - 1) * pageSize;
        const items = allData.slice(start, start + pageSize);
        return { items, total: allData.length };
      },
      queryAll: async ({ formValues }: any) => {
        let allData = (await getInspectionIssues({
          year: currentYear.value,
        })) as InspectionIssue[];

        if (formValues?.workOrderNumber) {
          allData = allData.filter((item) =>
            item.workOrderNumber?.includes(formValues.workOrderNumber),
          );
        }
        if (formValues?.projectName) {
          allData = allData.filter((item) =>
            item.projectName?.includes(formValues.projectName),
          );
        }
        if (formValues?.status) {
          allData = allData.filter((item) => item.status === formValues.status);
        }
        return { items: allData };
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions as any,
  formOptions: {
    schema: searchFormSchema as any,
    submitOnChange: true,
  },
});

// ================= 统计逻辑 =================
const showCharts = ref(true);

// 使用统计 composable
const { statistics } = useIssueStatistics(filteredIssues, currentYear);

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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t('common.deleteFailed');
        message.error(errorMessage);
      }
    },
  });
}

function handleBatchDelete() {
  const records = gridApi.grid.getCheckboxRecords();
  if (records.length === 0) {
    message.warning(t('common.pleaseSelectData'));
    return;
  }
  Modal.confirm({
    title: t('common.confirmBatchDelete'),
    content: t('common.confirmBatchDeleteContent', { count: records.length }),
    onOk: async () => {
      try {
        const ids = records.map((r: any) => r.id);
        const res = await batchDeleteInspectionIssues(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        invalidateInspectionIssues();
        gridApi.reload();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

function handleSettleToKnowledge(row: InspectionIssue) {
  // 转换照片为知识库附件格式
  let attachments: any[] = [];
  if (Array.isArray(row.photos)) {
    attachments = row.photos.map((url, idx) => ({
      name: `现场图片_${idx + 1}`,
      url,
      type: 'image',
    }));
  } else if (row.photos) {
    attachments = [{ name: '现场图片', url: row.photos, type: 'image' }];
  }

  router.push({
    path: '/qms/knowledge',
    state: {
      prefill: {
        categoryId: 'CAT-DEFAULT', // 默认分类
        content: `<h3>${t('qms.inspection.issues.description')}</h3><p>${t('qms.workOrder.workOrderNumber')}：${row.workOrderNumber}</p><p>${t('qms.workOrder.projectName')}：${row.projectName}</p><p>${t('qms.inspection.issues.partName')}：${row.partName}</p><h3>${t('qms.inspection.issues.description')}</h3><p>${row.description}</p><h3>${t('qms.inspection.issues.rootCause')}</h3><p>${row.rootCause || t('common.unknown')}</p><h3>${t('qms.inspection.issues.solution')}</h3><p>${row.solution || t('common.notSet')}</p>`,
        summary: row.description,
        tags: [row.defectType, row.division].filter(Boolean),
        title: `【${t('qms.inspection.issues.settleToKnowledge')}】${row.ncNumber} - ${row.partName}`,
        version: 'V1.0',
        attachments,
      },
    },
  });
}
</script>

<template>
  <Page>
    <div v-if="showCharts" class="mb-4">
      <IssueChartDashboard :year="currentYear" />
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

    <Grid>
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
      <template #toolbar-actions>
        <div class="flex items-center gap-4">
          <div class="flex gap-2">
            <Button
              v-access:code="'QMS:Inspection:Issues:Create'"
              type="primary"
              @click="handleOpenModal"
            >
              {{ t('qms.inspection.issues.createIssue') }}
            </Button>
            <Button v-if="canDelete" danger @click="handleBatchDelete">
              <span class="i-lucide-trash-2 mr-1"></span>
              {{ t('common.batchDelete') }}
            </Button>
            <Button type="link" @click="showCharts = !showCharts">
              {{ showCharts ? t('common.hideChart') : t('common.showChart') }}
            </Button>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-gray-500">{{ t('common.statsYear') }}:</span>
            <Select
              v-model:value="currentYear"
              :options="yearOptions"
              class="w-[120px]"
              @change="() => gridApi.reload()"
            />
          </div>
        </div>
      </template>
    </Grid>

    <IssueEditModal
      v-model:open="modalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="currentRecord || undefined"
      :dept-tree-data="deptTreeData"
      :work-order-list="workOrderList"
      :supplier-list="supplierList"
      @success="() => gridApi.reload()"
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
