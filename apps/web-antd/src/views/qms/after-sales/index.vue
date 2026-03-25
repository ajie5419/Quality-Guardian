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
  Descriptions,
  Drawer,
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
import { findNameById } from '#/types';

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

const detailVisible = ref(false);
const detailRecord = ref<QmsAfterSalesApi.AfterSalesItem | undefined>(
  undefined,
);

function openDetail(row: QmsAfterSalesApi.AfterSalesItem) {
  detailRecord.value = row;
  detailVisible.value = true;
}

function parsePhotos(photos: unknown): string[] {
  if (Array.isArray(photos)) {
    return photos.filter((item): item is string => typeof item === 'string');
  }
  if (typeof photos === 'string') {
    try {
      const parsed = JSON.parse(photos) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      return [];
    }
  }
  return [];
}

const detailPhotos = computed(() => parsePhotos(detailRecord.value?.photos));

function formatDept(value: string | undefined) {
  if (!value) return '-';
  return findNameById(deptRawData.value, value) || value;
}

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsAfterSalesApi.AfterSalesItem>,
) {
  const records = params.$grid.getCheckboxRecords();
  checkedRows.value = records;
}

function onCellClick(params: {
  column?: { field?: string; type?: string };
  row: QmsAfterSalesApi.AfterSalesItem;
}) {
  if (!params?.row) return;
  if (params.column?.type === 'checkbox') return;
  if (!params.column?.field) return;
  openDetail(params.row);
}

const gridEvents = {
  cellClick: onCellClick,
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

      <Drawer
        v-model:open="detailVisible"
        :title="`售后问题详情 - ${detailRecord?.workOrderNumber || ''}`"
        :width="900"
        placement="right"
      >
        <Descriptions v-if="detailRecord" bordered :column="2" size="small">
          <Descriptions.Item :label="t('qms.afterSales.form.workOrderNumber')">
            {{ detailRecord.workOrderNumber || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.status')">
            <QmsStatusTag :status="detailRecord.status" type="after-sales" />
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.projectName')">
            {{ detailRecord.projectName || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.partName')">
            {{ detailRecord.partName || '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.division')">
            {{ formatDept(detailRecord.division) }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.responsibleDept')">
            {{ formatDept(detailRecord.responsibleDept) }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.customerName')">
            {{ detailRecord.customerName || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.location')">
            {{ detailRecord.location || '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.productType')">
            {{ detailRecord.productType || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.productSubtype')">
            {{ detailRecord.productSubtype || '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.defectType')">
            {{ detailRecord.defectType || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.defectSubtype')">
            {{ detailRecord.defectSubtype || '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.severity')">
            {{ detailRecord.severity || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.columns.isClaim')">
            <Tag :color="detailRecord.isClaim ? 'red' : 'green'">
              {{ detailRecord.isClaim ? t('common.yes') : t('common.no') }}
            </Tag>
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.quantity')">
            {{ detailRecord.quantity ?? '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.runningHours')">
            {{ detailRecord.runningHours ?? '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.warrantyStatus')">
            {{ detailRecord.warrantyStatus || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.supplierBrand')">
            {{ detailRecord.supplierBrand || '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.materialCost')">
            ¥{{ detailRecord.materialCost ?? 0 }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.laborTravelCost')">
            ¥{{ detailRecord.laborTravelCost ?? 0 }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.handler')">
            {{ detailRecord.handler || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.factoryDate')">
            {{ detailRecord.factoryDate || '-' }}
          </Descriptions.Item>

          <Descriptions.Item :label="t('qms.afterSales.form.issueDate')">
            {{ detailRecord.issueDate || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.closeDate')">
            {{ detailRecord.closeDate || '-' }}
          </Descriptions.Item>

          <Descriptions.Item label="发生日期">
            {{ detailRecord.occurDate || '-' }}
          </Descriptions.Item>
          <Descriptions.Item label="发货日期">
            {{ detailRecord.shipDate || '-' }}
          </Descriptions.Item>

          <Descriptions.Item
            :label="t('qms.afterSales.form.issueDescription')"
            :span="2"
          >
            {{ detailRecord.issueDescription || '-' }}
          </Descriptions.Item>
          <Descriptions.Item
            :label="t('qms.afterSales.form.resolutionPlan')"
            :span="2"
          >
            {{ detailRecord.resolutionPlan || '-' }}
          </Descriptions.Item>
          <Descriptions.Item :label="t('qms.afterSales.form.photos')" :span="2">
            <div v-if="detailPhotos.length > 0" class="flex flex-wrap gap-2">
              <Image
                v-for="(photo, index) in detailPhotos"
                :key="`${photo}-${index}`"
                :width="96"
                :height="96"
                :src="photo"
                class="rounded border border-gray-200"
              />
            </div>
            <span v-else>-</span>
          </Descriptions.Item>
        </Descriptions>
      </Drawer>
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
