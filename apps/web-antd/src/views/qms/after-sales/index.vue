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
  AFTER_SALES_IMPORT_STATUS_MAP,
  QMS_DICTIONARY_TYPE_KEYS,
} from '@qgs/shared';
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
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import { useDictionaryOptions } from '../shared/composables/useDictionaryOptions';
import AfterSalesCharts from './components/AfterSalesCharts.vue';
import AfterSalesDetailDrawer from './components/AfterSalesDetailDrawer.vue';
import AfterSalesModal from './components/AfterSalesModal.vue';
import { buildAfterSalesKnowledgePayload } from './composables/knowledge-settlement';
import { useAfterSalesChartPreferences } from './composables/useAfterSalesChartPreferences';
import { useAfterSalesDeptData } from './composables/useAfterSalesDeptData';
import { useAfterSalesGrid } from './composables/useAfterSalesGrid';
import {
  mapDictionaryOptionsToAfterSalesStatus,
  useStatusOptions,
} from './constants';

import './index.css';

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
const { statusOptions: fallbackStatusOptions } = useStatusOptions();
const {
  options: afterSalesStatusOptions,
  loadOptions: loadAfterSalesStatusDictionaryOptions,
} = useDictionaryOptions({
  dictType: QMS_DICTIONARY_TYPE_KEYS.afterSalesStatus,
  fallbackOptions: fallbackStatusOptions.value,
  mapOptions: (options, fallbackOptions) =>
    mapDictionaryOptionsToAfterSalesStatus(options, fallbackOptions),
});

async function loadData() {
  try {
    await loadDeptData();
    await loadPreferences();
  } catch (error) {
    handleApiError(error, 'Load After Sales Base Data');
    message.error(t('common.dataLoadFailed'));
  }
}

async function loadAfterSalesStatusOptions() {
  try {
    await loadAfterSalesStatusDictionaryOptions();
    gridApi.setState({
      formOptions: {
        schema: formSchema,
        showCollapseButton: true,
        submitOnChange: true,
        submitOnEnter: true,
      },
    });
  } catch {
    // Keep local fallback options.
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
  statusMap: AFTER_SALES_IMPORT_STATUS_MAP,
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
  settleToKnowledge(buildAfterSalesKnowledgePayload(row, t));
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
  statusOptions: afterSalesStatusOptions,
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
loadAfterSalesStatusOptions();

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
  <Page content-class="p-0">
    <ErrorBoundary>
      <QmsPageShell>
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

        <div class="after-sales-grid-card rounded-lg bg-white">
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
      </QmsPageShell>

      <AfterSalesModal
        v-model:open="isModalVisible"
        :is-edit-mode="isEditMode"
        :initial-data="currentRecord"
        :dept-tree-data="deptTreeData"
        :status-options="afterSalesStatusOptions"
        @success="handleModalSuccess"
      />

      <AfterSalesDetailDrawer
        v-model:open="detailVisible"
        :dept-data="deptRawData"
        :record="detailRecord"
      />
    </ErrorBoundary>
  </Page>
</template>
