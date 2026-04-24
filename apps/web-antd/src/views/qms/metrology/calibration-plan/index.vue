<script lang="ts" setup>
import type { UploadProps } from 'ant-design-vue';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Card,
  message,
  Modal,
  Segmented,
  Space,
  Tag,
  Upload,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  deleteMetrologyCalibrationPlanMutation,
  getMetrologyCalibrationAnnualGrid,
  getMetrologyCalibrationPlanListPage,
  getMetrologyCalibrationPlanOverview,
  getMetrologyExportList,
  importMetrologyCalibrationPlan,
} from '#/api/qms/metrology';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { readSheetMatrixFromFile } from '#/utils/import-sheet';
import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';

import CalibrationPlanAnnualGrid from './components/CalibrationPlanAnnualGrid.vue';
import CalibrationPlanEditModal from './components/CalibrationPlanEditModal.vue';
import CalibrationPlanMonthlyDistributionChart from './components/CalibrationPlanMonthlyDistributionChart.vue';
import CalibrationPlanOverviewCards from './components/CalibrationPlanOverviewCards.vue';
import CalibrationPlanUpcomingTable from './components/CalibrationPlanUpcomingTable.vue';
import { getColumns, getSearchFormSchema, getViewOptions } from './data';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canDelete, canEdit, canImport, canList } = useQmsPermissions(
  'QMS:Metrology:CalibrationPlan',
);
const canCreateAction = computed(() => canCreate.value || canList.value);
const canDeleteAction = computed(() => canDelete.value || canList.value);
const canEditAction = computed(() => canEdit.value || canList.value);
const canImportAction = computed(() => canImport.value || canList.value);

const viewMode = ref<'grid' | 'list'>('list');
const modalVisible = ref(false);
const currentRecord = ref<null | QmsMetrologyApi.MetrologyCalibrationPlanItem>(
  null,
);
const latestQueryFormValues = ref<Record<string, unknown>>({
  year: new Date().getFullYear(),
});
const annualGridLoading = ref(false);
const annualGridItems = ref<QmsMetrologyApi.MetrologyCalibrationAnnualRow[]>(
  [],
);
const overviewLoading = ref(false);
const overview = ref<QmsMetrologyApi.MetrologyCalibrationPlanOverview>({
  monthlyDistribution: [],
  summary: {
    completedCount: 0,
    currentMonthCount: 0,
    overdueCount: 0,
    totalCount: 0,
    upcomingCount: 0,
  },
  upcomingItems: [],
});
const instrumentOptions = ref<Array<{ label: string; value: string }>>([]);

function resolveStatusFilter() {
  const status = String(latestQueryFormValues.value.status || '').trim();
  if (!status) {
    return undefined;
  }

  const validStatuses: QmsMetrologyApi.MetrologyCalibrationPlanStatus[] = [
    'COMPLETED',
    'OVERDUE',
    'PLANNED',
  ];

  return validStatuses.includes(
    status as QmsMetrologyApi.MetrologyCalibrationPlanStatus,
  )
    ? (status as QmsMetrologyApi.MetrologyCalibrationPlanStatus)
    : undefined;
}

async function loadInstrumentOptions() {
  try {
    const response = await getMetrologyExportList();
    instrumentOptions.value = (response.items || []).map((item) => ({
      label: `${item.instrumentName} / ${item.instrumentCode}`,
      value: item.id,
    }));
  } catch (error) {
    handleApiError(error, 'Load Metrology Instrument Options');
  }
}

function resolveCurrentYear() {
  const year = Number(
    latestQueryFormValues.value.year || new Date().getFullYear(),
  );
  return Number.isInteger(year) && year >= 2000 && year <= 2100
    ? year
    : new Date().getFullYear();
}

async function loadAnnualGrid() {
  annualGridLoading.value = true;
  try {
    annualGridItems.value = await getMetrologyCalibrationAnnualGrid({
      keyword:
        String(latestQueryFormValues.value.keyword || '').trim() || undefined,
      usingUnit:
        String(latestQueryFormValues.value.usingUnit || '').trim() || undefined,
      year: resolveCurrentYear(),
    });
  } catch (error) {
    handleApiError(error, 'Load Metrology Calibration Annual Grid');
    annualGridItems.value = [];
  } finally {
    annualGridLoading.value = false;
  }
}

async function loadOverview() {
  overviewLoading.value = true;
  try {
    overview.value = await getMetrologyCalibrationPlanOverview({
      keyword:
        String(latestQueryFormValues.value.keyword || '').trim() || undefined,
      month: Number(latestQueryFormValues.value.month || 0) || undefined,
      status: resolveStatusFilter(),
      usingUnit:
        String(latestQueryFormValues.value.usingUnit || '').trim() || undefined,
      year: resolveCurrentYear(),
    });
  } catch (error) {
    handleApiError(error, 'Load Metrology Calibration Plan Overview');
  } finally {
    overviewLoading.value = false;
  }
}

const gridOptions = computed<VxeGridProps>(() => ({
  columns: getColumns(),
  height: 620,
  keepSource: true,
  pagerConfig: {
    pageSize: 20,
    pageSizes: [10, 20, 50, 100],
  },
  sortConfig: {
    remote: true,
    trigger: 'cell',
  },
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    custom: true,
    refresh: true,
    search: true,
    zoom: true,
  },
  proxyConfig: {
    autoLoad: true,
    sort: true,
    ajax: {
      query: async ({ page, sorts }, formValues) => {
        try {
          latestQueryFormValues.value = (formValues || {}) as Record<
            string,
            unknown
          >;
          await Promise.all([loadAnnualGrid(), loadOverview()]);
          return await getMetrologyCalibrationPlanListPage({
            ...(formValues as Record<string, unknown>),
            page: page?.currentPage,
            pageSize: page?.pageSize,
            sortBy: sorts?.[0]?.field,
            sortOrder: sorts?.[0]?.order as 'asc' | 'desc' | undefined,
          });
        } catch (error) {
          handleApiError(error, 'Load Metrology Calibration Plan List');
          return { items: [], total: 0 };
        }
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions.value as VxeGridProps,
  formOptions: {
    schema: getSearchFormSchema(),
    submitOnChange: true,
  },
});

function getStatusColor(
  status: QmsMetrologyApi.MetrologyCalibrationPlanStatus,
) {
  switch (status) {
    case 'COMPLETED': {
      return 'green';
    }
    case 'OVERDUE': {
      return 'red';
    }
    default: {
      return 'blue';
    }
  }
}

function handleAdd() {
  currentRecord.value = null;
  modalVisible.value = true;
}

function handleEdit(row: QmsMetrologyApi.MetrologyCalibrationPlanItem) {
  currentRecord.value = row;
  modalVisible.value = true;
}

async function handleSuccess() {
  await Promise.all([loadAnnualGrid(), loadOverview()]);
  gridApi.reload();
}

function handleDelete(row: QmsMetrologyApi.MetrologyCalibrationPlanItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    async onOk() {
      try {
        await deleteMetrologyCalibrationPlanMutation(row.id);
        message.success(t('common.deleteSuccess'));
        await Promise.all([loadAnnualGrid(), loadOverview()]);
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Delete Metrology Calibration Plan');
      }
    },
  });
}

function normalizeImportCell(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .trim();
}

function buildCalibrationImportRows(matrix: unknown[][]) {
  if (matrix.length === 0) {
    return [];
  }

  const headerRowIndex = matrix.findIndex((row) => {
    const values = new Set(row.map((cell) => normalizeImportCell(cell)));
    return values.has('序号') && values.has('设备名称') && values.has('编号');
  });

  if (headerRowIndex === -1 || headerRowIndex + 2 >= matrix.length) {
    return [];
  }

  const monthHeaderRow = matrix[headerRowIndex + 1] || [];
  const dataRows = matrix.slice(headerRowIndex + 2);

  return dataRows
    .map((row) => {
      const values = Array.isArray(row) ? row : [];
      const mapped: Record<string, unknown> = {
        使用单位: values[16] ?? '',
        备注: values[17] ?? '',
        型号: values[3] ?? '',
        '型号/规格': values[3] ?? '',
        序号: values[0] ?? '',
        编号: values[2] ?? '',
        设备名称: values[1] ?? '',
      };

      for (let index = 4; index <= 15; index += 1) {
        const monthValue = normalizeImportCell(monthHeaderRow[index]);
        if (!monthValue) {
          continue;
        }
        mapped[monthValue] = values[index] ?? '';
      }

      return mapped;
    })
    .filter((row) => {
      const instrumentCode = normalizeImportCell(row.编号);
      const instrumentName = normalizeImportCell(row.设备名称);
      return instrumentCode || instrumentName;
    });
}

const handleImportUpload: UploadProps['beforeUpload'] = async (file) => {
  try {
    const matrix = await readSheetMatrixFromFile(file as File, {
      defval: '',
      blankRows: false,
      raw: false,
    });
    const rows = buildCalibrationImportRows(matrix);
    if (rows.length === 0) {
      message.warning(t('qms.metrology.calibrationPlan.importEmpty'));
      return false;
    }

    const result = await importMetrologyCalibrationPlan({
      fileName: file.name,
      items: rows,
      year: resolveCurrentYear(),
    });
    const { errorCount } = resolveImportErrorCount(result, rows.length);

    message.success(
      t('qms.metrology.calibrationPlan.importSuccess', {
        count: result.successCount,
        total: rows.length,
      }),
    );
    if (errorCount > 0) {
      message.warning(buildImportWarningMessage(result, errorCount));
    }
    await Promise.all([loadAnnualGrid(), loadOverview()]);
    gridApi.reload();
    return false;
  } catch (error) {
    handleApiError(error, 'Import Metrology Calibration Plan');
    message.error(t('qms.metrology.calibrationPlan.importFailed'));
    return false;
  }
};

onMounted(async () => {
  await Promise.all([
    loadInstrumentOptions(),
    loadAnnualGrid(),
    loadOverview(),
  ]);
});

function handleOverviewOpen(payload: {
  month?: number;
  status?: QmsMetrologyApi.MetrologyCalibrationPlanStatus;
}) {
  const nextFormValues = {
    ...latestQueryFormValues.value,
    ...(payload.month ? { month: payload.month } : { month: undefined }),
    ...(payload.status ? { status: payload.status } : { status: undefined }),
  };
  latestQueryFormValues.value = nextFormValues;
  gridApi.formApi?.setValues(nextFormValues);
  gridApi.query();
}

function handleMonthClick(month: number) {
  handleOverviewOpen({ month });
}
</script>

<template>
  <Page :title="t('qms.metrology.calibrationPlan.title')">
    <div class="m-4 flex flex-col gap-5">
      <CalibrationPlanOverviewCards
        :loading="overviewLoading"
        :summary="overview.summary"
        @open="handleOverviewOpen"
      />

      <div class="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,2fr)_420px]">
        <div class="min-w-0">
          <CalibrationPlanMonthlyDistributionChart
            :data="overview.monthlyDistribution"
            @month-click="handleMonthClick"
          />
        </div>
        <div class="min-w-0">
          <CalibrationPlanUpcomingTable
            :items="overview.upcomingItems"
            :loading="overviewLoading"
          />
        </div>
      </div>

      <Card :bordered="false" class="shadow-sm">
        <div
          class="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div class="flex flex-wrap items-center gap-3">
            <Button v-if="canCreateAction" type="primary" @click="handleAdd">
              <template #icon>
                <IconifyIcon icon="lucide:plus" />
              </template>
              {{ t('common.create') }}
            </Button>
            <Upload
              v-if="canImportAction"
              :before-upload="handleImportUpload"
              :show-upload-list="false"
              accept=".xlsx,.xls"
            >
              <Button type="primary">
                {{ t('qms.metrology.importExcel') }}
              </Button>
            </Upload>
          </div>

          <Segmented v-model:value="viewMode" :options="getViewOptions()" />
        </div>

        <Grid v-show="viewMode === 'list'">
          <template #status="{ row }">
            <Tag :color="getStatusColor(row.status)">
              {{ row.statusLabel }}
            </Tag>
          </template>

          <template #action="{ row }">
            <Space>
              <Button v-if="canEditAction" type="link" @click="handleEdit(row)">
                {{ t('common.edit') }}
              </Button>
              <Button
                v-if="canDeleteAction"
                danger
                type="link"
                @click="handleDelete(row)"
              >
                {{ t('common.delete') }}
              </Button>
            </Space>
          </template>
        </Grid>

        <CalibrationPlanAnnualGrid
          v-show="viewMode === 'grid'"
          :items="annualGridItems"
          :loading="annualGridLoading"
        />
      </Card>
    </div>

    <CalibrationPlanEditModal
      v-model:open="modalVisible"
      :instrument-options="instrumentOptions"
      :record="currentRecord"
      :year="resolveCurrentYear()"
      @success="handleSuccess"
    />
  </Page>
</template>
