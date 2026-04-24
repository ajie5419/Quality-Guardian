<script lang="ts" setup>
import type { UploadProps } from 'ant-design-vue';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsMetrologyApi } from '#/api/qms/metrology';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { downloadFileFromBlob } from '@vben/utils';

import {
  Button,
  Card,
  message,
  Modal,
  Space,
  Tag,
  Upload,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteMetrologyMutation,
  deleteMetrologyMutation,
  downloadMetrologyTemplate,
  getMetrologyExportList,
  getMetrologyListPage,
  getMetrologyOverview,
  importMetrology,
} from '#/api/qms/metrology';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { readImportRowsFromFile } from '#/utils/import-sheet';
import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import MetrologyEditModal from './components/MetrologyEditModal.vue';
import MetrologyOverviewCards from './components/MetrologyOverviewCards.vue';
import { getColumns, getSearchFormSchema } from './data';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canDelete, canEdit, canExport, canImport, canList } =
  useQmsPermissions('QMS:Metrology');
const canCreateAction = computed(() => canCreate.value || canList.value);
const canDeleteAction = computed(() => canDelete.value || canList.value);
const canEditAction = computed(() => canEdit.value || canList.value);
const canImportAction = computed(() => canImport.value || canList.value);
const canExportAction = computed(() => canExport.value || canList.value);
const modalVisible = ref(false);
const currentRecord = ref<null | QmsMetrologyApi.MetrologyItem>(null);
const checkedRows = ref<QmsMetrologyApi.MetrologyItem[]>([]);
const overviewLoading = ref(false);
const latestQueryFormValues = ref<Record<string, unknown>>({});
const overview = ref<QmsMetrologyApi.MetrologyOverview>({
  disabledCount: 0,
  expiringSoonCount: 0,
  expiredCount: 0,
  totalCount: 0,
  validCount: 0,
});
const editModalOpen = computed({
  get: () => modalVisible.value,
  set: (value: boolean) => {
    modalVisible.value = value;
  },
});

const exportMetrologyAsXlsx =
  createVxePhotoXlsxExportMethod<QmsMetrologyApi.MetrologyItem>({
    sheetName: t('qms.metrology.title'),
    filename: () => `${t('qms.metrology.title')}-${Date.now()}.xlsx`,
    photoField: '__none__',
    getPhotoUrl: () => '',
    getRows: async ({ mode, $table, $grid }) => {
      if (mode === 'selected') {
        return $table.getCheckboxRecords() || [];
      }
      if (mode === 'all') {
        const proxyInfo = $grid?.getProxyInfo?.();
        const formValues = (proxyInfo?.form || {}) as Record<string, unknown>;
        const response = await getMetrologyExportList(formValues);
        return response.items || [];
      }
      const tableData = $table.getTableData?.();
      return tableData?.fullData || [];
    },
  });

const gridOptions = computed<VxeGridProps>(() => ({
  columns: getColumns(),
  height: 620,
  keepSource: true,
  checkboxConfig: {
    highlight: true,
    reserve: true,
  },
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
    export: canExportAction.value,
    refresh: true,
    search: true,
    zoom: true,
  },
  exportConfig: {
    remote: true,
    exportMethod: exportMetrologyAsXlsx,
    modes: ['current', 'all'],
    types: ['xlsx'],
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
          await loadOverview();
          return await getMetrologyListPage({
            ...(formValues as Record<string, unknown>),
            page: page?.currentPage,
            pageSize: page?.pageSize,
            sortBy: sorts?.[0]?.field,
            sortOrder: sorts?.[0]?.order as 'asc' | 'desc' | undefined,
          });
        } catch (error) {
          handleApiError(error, 'Load Metrology List');
          return { items: [], total: 0 };
        }
      },
      queryAll: async (params) => {
        try {
          const formValues =
            (params as { form?: Record<string, unknown> }).form || {};
          const response = await getMetrologyExportList(formValues);
          return { items: response.items || [] };
        } catch (error) {
          handleApiError(error, 'Load All Metrology Data');
          return { items: [] };
        }
      },
    },
  },
}));

async function loadOverview() {
  overviewLoading.value = true;
  try {
    overview.value = await getMetrologyOverview(
      latestQueryFormValues.value as QmsMetrologyApi.MetrologyListParams,
    );
  } catch (error) {
    handleApiError(error, 'Load Metrology Overview');
  } finally {
    overviewLoading.value = false;
  }
}

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsMetrologyApi.MetrologyItem>,
) {
  checkedRows.value = params.$grid.getCheckboxRecords() || [];
}

const gridEvents = {
  checkboxAll: onCheckChange,
  checkboxChange: onCheckChange,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions.value as VxeGridProps<QmsMetrologyApi.MetrologyItem>,
  gridEvents,
  formOptions: {
    schema: getSearchFormSchema(),
    submitOnChange: true,
  },
});

function getStatusColor(status: QmsMetrologyApi.MetrologyInspectionStatus) {
  switch (status) {
    case 'DISABLED': {
      return 'default';
    }
    case 'EXPIRED': {
      return 'red';
    }
    case 'VALID': {
      return 'green';
    }
    default: {
      return 'orange';
    }
  }
}

function getBorrowStatusColor(status: QmsMetrologyApi.MetrologyBorrowStatus) {
  return status === 'BORROWED' ? 'blue' : 'default';
}

function getRemainingDaysText(value: null | number | undefined) {
  if (value === null || value === undefined) return '-';
  if (value < 0)
    return t('qms.metrology.expiredDays', { days: Math.abs(value) });
  if (value === 0) return t('qms.metrology.expireToday');
  return t('qms.metrology.remainingDaysValue', { days: value });
}

function handleAdd() {
  currentRecord.value = null;
  modalVisible.value = true;
}

function handleEdit(row: QmsMetrologyApi.MetrologyItem) {
  currentRecord.value = row;
  modalVisible.value = true;
}

function handleSuccess() {
  gridApi.reload();
}

function handleDelete(row: QmsMetrologyApi.MetrologyItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    async onOk() {
      try {
        await deleteMetrologyMutation(row.id);
        message.success(t('common.deleteSuccess'));
        await loadOverview();
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Delete Metrology');
      }
    },
  });
}

function handleBatchDelete() {
  const ids = checkedRows.value.map((item) => item.id).filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    async onOk() {
      try {
        await batchDeleteMetrologyMutation(ids);
        checkedRows.value = [];
        message.success(t('common.deleteSuccess'));
        await loadOverview();
        gridApi.reload();
      } catch (error) {
        handleApiError(error, 'Batch Delete Metrology');
      }
    },
  });
}

async function handleTemplateDownload() {
  try {
    const blob = await downloadMetrologyTemplate();
    downloadFileFromBlob({
      fileName: 'measuring-instruments-template.xlsx',
      source: blob,
    });
  } catch (error) {
    handleApiError(error, 'Download Metrology Template');
  }
}

const handleImportUpload: UploadProps['beforeUpload'] = async (file) => {
  try {
    const rows = await readImportRowsFromFile(file as File, {
      defval: '',
      raw: false,
    });
    if (rows.length === 0) {
      message.warning(t('qms.metrology.importEmpty'));
      return false;
    }

    const result = await importMetrology({
      fileName: file.name,
      items: rows,
    });
    const { errorCount } = resolveImportErrorCount(result, rows.length);

    message.success(
      t('qms.metrology.importSuccess', {
        count: result.successCount,
        total: rows.length,
      }),
    );
    if (errorCount > 0) {
      message.warning(buildImportWarningMessage(result, errorCount));
    }
    await loadOverview();
    gridApi.reload();
    return false;
  } catch (error) {
    handleApiError(error, 'Import Metrology');
    message.error(t('qms.metrology.importFailed'));
    return false;
  }
};
</script>

<template>
  <Page>
    <div class="m-4 flex flex-col gap-4">
      <MetrologyOverviewCards :overview="overview" :loading="overviewLoading" />
      <Card :bordered="false" class="shadow-sm">
        <Grid>
          <template #toolbar-actions>
            <Space>
              <Button v-if="canCreateAction" type="primary" @click="handleAdd">
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                {{ t('common.create') }}
              </Button>
              <Button
                v-if="canDeleteAction && checkedRows.length > 0"
                danger
                type="primary"
                @click="handleBatchDelete"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:trash-2" />
                </template>
                {{ t('common.batchDelete') }}
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
              <Button @click="handleTemplateDownload">
                {{ t('qms.metrology.downloadTemplate') }}
              </Button>
            </Space>
          </template>

          <template #inspection_status="{ row }">
            <Tag :color="getStatusColor(row.inspectionStatus)">
              {{ row.inspectionStatusLabel }}
            </Tag>
          </template>

          <template #borrow_status="{ row }">
            <Tag :color="getBorrowStatusColor(row.borrowStatus)">
              {{ row.borrowStatusLabel }}
            </Tag>
          </template>

          <template #remaining_days="{ row }">
            <span>{{ getRemainingDaysText(row.remainingDays) }}</span>
          </template>

          <template #action="{ row }">
            <Space>
              <Button
                v-if="canEditAction"
                type="link"
                size="small"
                @click="handleEdit(row)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                v-if="canDeleteAction"
                danger
                type="link"
                size="small"
                @click="handleDelete(row)"
              >
                {{ t('common.delete') }}
              </Button>
            </Space>
          </template>
        </Grid>
      </Card>
    </div>
    <MetrologyEditModal
      v-model:open="editModalOpen"
      :record="currentRecord"
      @success="handleSuccess"
    />
  </Page>
</template>
