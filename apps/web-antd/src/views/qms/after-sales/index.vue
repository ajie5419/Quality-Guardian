<script lang="ts" setup>
import type { Ref } from 'vue';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Button,
  DatePicker,
  Image,
  message,
  Modal,
  Select,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteAfterSales,
  deleteAfterSales,
  getAfterSalesListPage,
  importAfterSalesExcel,
} from '#/api/qms/after-sales';
import ErrorBoundary from '#/components/ErrorBoundary.vue';
import { QmsStatusTag } from '#/components/Qms';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useGridImport } from '#/hooks/useGridImport';
import { useKnowledgeSettlement } from '#/hooks/useKnowledgeSettlement';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';

import AfterSalesCharts from './components/AfterSalesCharts.vue';
import AfterSalesModal from './components/AfterSalesModal.vue';
import { useAfterSalesChartPreferences } from './composables/useAfterSalesChartPreferences';
import { useAfterSalesDeptData } from './composables/useAfterSalesDeptData';
import { useAfterSalesGrid } from './composables/useAfterSalesGrid';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();

const chartRefreshKey = ref(0);
const chartsRef = ref<null | { handleAddCustomChart: () => void }>(null);
const {
  showCharts,
  customChartsData,
  loadPreferences,
  handleSaveSystemDefault,
} = useAfterSalesChartPreferences();
const { deptTreeData, deptRawData, loadDeptData } = useAfterSalesDeptData();

const { invalidateAfterSales } = useInvalidateQmsQueries();

const {
  canCreate,
  canEdit,
  canDelete,
  canExport,
  canImport,
  hasAccessByCodes,
} = useQmsPermissions('QMS:AfterSales');

const canSettle = computed(() => hasAccessByCodes(['QMS:AfterSales:Settle']));
const canAddChart = computed(() =>
  hasAccessByCodes(['QMS:AfterSales:ChartAdd']),
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

const canToolbarExport = computed(() => canExport.value || isAdmin.value);

async function loadData() {
  try {
    await loadDeptData();
    await loadPreferences();
  } catch (error) {
    handleApiError(error, 'Load After Sales Base Data');
    message.error(t('common.dataLoadFailed'));
  }
}

onMounted(() => loadData());

const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const currentDateMode = ref<'month' | 'week' | 'year'>('year');
const currentDate = ref(dayjs());
const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});
const currentFilterYear = computed(() =>
  currentDateMode.value === 'year'
    ? currentYear.value
    : currentDate.value.year(),
);
const currentDateValue = computed(() => {
  if (currentDateMode.value === 'month') {
    return currentDate.value.format('YYYY-MM');
  }
  if (currentDateMode.value === 'week') {
    return currentDate.value.format('YYYY-MM-DD');
  }
  return String(currentYear.value);
});
const dateModeOptions = computed(() => [
  {
    label: t('qms.afterSales.dateMode.year'),
    value: 'year',
  },
  {
    label: t('qms.afterSales.dateMode.month'),
    value: 'month',
  },
  {
    label: t('qms.afterSales.dateMode.week'),
    value: 'week',
  },
]);

const gridApiProxy =
  ref<ReturnType<typeof useVbenVxeGrid<QmsAfterSalesApi.AfterSalesItem>>[1]>();
const { handleImport } = useGridImport({
  gridApi: gridApiProxy as unknown as Ref<
    ReturnType<typeof useVbenVxeGrid>[1] | undefined
  >,
  importApi: importAfterSalesExcel,
  statusMap: {
    待处理: 'OPEN',
    处理中: 'IN_PROGRESS',
    已解决: 'RESOLVED',
    已结束: 'CLOSED',
    已完结: 'CLOSED',
    已完成: 'COMPLETED',
    已取消: 'CANCELLED',
  },
  onSuccess: () => {
    invalidateAfterSales();
    chartRefreshKey.value++;
  },
});

const checkedRows = ref<QmsAfterSalesApi.AfterSalesItem[]>([]);

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsAfterSalesApi.AfterSalesItem>,
) {
  const records = params.$grid.getCheckboxRecords();
  checkedRows.value = records;
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentRecord = ref<QmsAfterSalesApi.AfterSalesItem | undefined>(
  undefined,
);

function handleOpenModal() {
  isEditMode.value = false;
  currentRecord.value = undefined;
  isModalVisible.value = true;
}

function handleEdit(row: QmsAfterSalesApi.AfterSalesItem) {
  isEditMode.value = true;
  currentRecord.value = { ...row };
  isModalVisible.value = true;
}

function handleDelete(row: QmsAfterSalesApi.AfterSalesItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk: async () => {
      try {
        await deleteAfterSales(row.id);
        message.success(t('common.deleteSuccess'));
        invalidateAfterSales();
        chartRefreshKey.value++;
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Delete After Sales');
      }
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) {
    return;
  }
  Modal.confirm({
    title: t('common.confirmBatchDelete'),
    content: t('common.confirmBatchDeleteContent', {
      count: checkedRows.value.length,
    }),
    onOk: async () => {
      try {
        const ids = checkedRows.value.map((r) => r.id);
        const res = await batchDeleteAfterSales(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        checkedRows.value = [];
        invalidateAfterSales();
        chartRefreshKey.value++;
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Batch Delete After Sales');
      }
    },
  });
}

const { settle: settleToKnowledge } = useKnowledgeSettlement();

function handleSettleToKnowledge(row: QmsAfterSalesApi.AfterSalesItem) {
  settleToKnowledge({
    title: `【${t('qms.afterSales.title')}】${row.workOrderNumber} - ${row.partName || row.projectName}`,
    summary: row.issueDescription,
    categoryId: 'CAT-DEFAULT',
    photos: row.photos,
    attachmentNamePrefix: t('qms.afterSales.title'),
    tags: [row.defectType, row.productType, row.partName, row.projectName],
    sections: [
      {
        title: t('qms.afterSales.form.baseInfo'),
        fields: [
          {
            label: t('qms.afterSales.form.workOrderNumber'),
            value: row.workOrderNumber,
          },
          {
            label: t('qms.afterSales.form.projectName'),
            value: row.projectName,
          },
          {
            label: t('qms.afterSales.form.partName'),
            value: row.partName || '-',
          },
          {
            label: t('qms.afterSales.form.customerName'),
            value: row.customerName,
          },
        ],
      },
      {
        title: t('qms.afterSales.form.issueDetails'),
        content: row.issueDescription,
      },
      {
        title: t('qms.afterSales.form.resolutionPlan'),
        content: row.resolutionPlan || t('common.notSet'),
      },
      {
        title: t('qms.afterSales.form.responsibility'),
        fields: [
          {
            label: t('qms.afterSales.form.materialCost'),
            value: `¥${row.materialCost}`,
          },
          {
            label: t('qms.afterSales.form.laborTravelCost'),
            value: `¥${row.laborTravelCost}`,
          },
        ],
      },
    ],
  });
}

const { gridOptions, formSchema } = useAfterSalesGrid({
  canDelete,
  canEdit,
  canImport,
  canSettle,
  canToolbarExport,
  currentDateMode,
  currentDateValue,
  currentYear: currentFilterYear,
  deptRawData,
  getAfterSalesListPage,
  handleDelete,
  handleEdit,
  handleImport,
  handleSettleToKnowledge,
  t,
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions:
    gridOptions.value as VxeGridProps<QmsAfterSalesApi.AfterSalesItem>,
  gridEvents,
  formOptions: {
    schema: formSchema,
    showCollapseButton: true,
    submitOnChange: true,
    submitOnEnter: true,
  },
});

gridApiProxy.value = gridApi;

watch(deptRawData, () => {
  gridApi.reload();
});

watch([currentYear, currentDateMode, currentDate], () => {
  gridApi.reload();
  chartRefreshKey.value++;
});

watch(currentDateMode, (mode) => {
  if (mode === 'year') {
    currentYear.value = currentDate.value.year();
    return;
  }
  currentDate.value = currentDate.value.year(currentYear.value);
});

function handleModalSuccess() {
  invalidateAfterSales();
  chartRefreshKey.value++;
  gridApi.reload();
}
</script>

<template>
  <Page>
    <ErrorBoundary>
      <div class="p-4">
        <div v-if="showCharts" class="mb-4">
          <AfterSalesCharts
            ref="chartsRef"
            v-model:charts="customChartsData"
            :date-mode="currentDateMode"
            :date-value="currentDateValue"
            :year="currentFilterYear"
            :refresh-key="chartRefreshKey"
          />
        </div>

        <div class="rounded-lg bg-white">
          <Grid>
            <template #status="{ row }">
              <QmsStatusTag :status="row.status" type="after-sales" />
            </template>
            <template #isClaim="{ row }">
              <Tag :color="row.isClaim ? 'red' : 'green'">
                {{ row.isClaim ? t('common.yes') : t('common.no') }}
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
                  :src="
                    row.photoThumbUrl ||
                    (Array.isArray(row.photos) ? row.photos[0] : row.photos)
                  "
                  :fallback="
                    Array.isArray(row.photos) ? row.photos[0] : row.photos
                  "
                  class="rounded shadow-sm"
                />
              </div>
            </template>
            <template #toolbar-actions>
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  v-if="canCreate"
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
                    async () => {
                      showCharts = true;
                      await nextTick();
                      chartsRef?.handleAddCustomChart();
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
                      :icon="
                        showCharts ? 'lucide:bar-chart-3' : 'lucide:bar-chart-3'
                      "
                    />
                  </template>
                  {{
                    showCharts ? t('common.hideChart') : t('common.showChart')
                  }}
                </Button>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500">
                    {{ t('qms.afterSales.dateMode.label') }}:
                  </span>
                  <Select
                    v-model:value="currentDateMode"
                    :options="dateModeOptions"
                    size="small"
                    class="w-[100px]"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500"
                    >{{ t('qms.inspection.records.statsYear') }}:</span
                  >
                  <Select
                    v-if="currentDateMode === 'year'"
                    v-model:value="currentYear"
                    :options="yearOptions"
                    size="small"
                    class="w-[100px]"
                    @change="() => gridApi.reload()"
                  />
                  <DatePicker
                    v-else
                    v-model:value="currentDate"
                    :picker="currentDateMode"
                    :allow-clear="false"
                    size="small"
                    class="w-[140px]"
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
        </div>
      </div>

      <AfterSalesModal
        v-model:open="isModalVisible"
        :is-edit-mode="isEditMode"
        :initial-data="currentRecord"
        :dept-tree-data="deptTreeData"
        @success="handleModalSuccess"
      />
    </ErrorBoundary>
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
