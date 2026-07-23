<script lang="ts" setup>
import type { InspectionRecordFilterState } from './inspection-record-filters';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
} from '@qgs/shared';
import {
  Button,
  DatePicker,
  Input,
  message,
  Modal,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteInspectionRecords,
  deleteInspectionRecord,
  getInspectionRecords,
  getInspectionRecordsExport,
  importInspectionRecords,
} from '#/api/qms/inspection';
import { getInspectionManualCreateSettingApi } from '#/api/system/inspection-settings';
import { QmsStatusTag } from '#/components/Qms';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { readImportRowsFromFile } from '#/utils/import-sheet';
import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import { getColumns } from '../config';
import {
  buildInspectionRecordExportRequestParams,
  buildInspectionRecordFilterParams,
  buildInspectionRecordListRequestParams,
} from './inspection-record-filters';

const props = defineProps<{
  isMobile?: boolean;
  keyword?: string;
  sourceInspectionId?: string;
  type: string;
  year: number;
}>();

const emit = defineEmits(['create', 'edit', 'view']);
const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canEdit, canDelete, canExport, canImport } =
  useQmsPermissions('QMS:Inspection:Records');
const manualCreateEnabled = ref(true);
const canCreateRecord = computed(
  () => canCreate.value && manualCreateEnabled.value,
);
const filters = ref<InspectionRecordFilterState>({
  keyword: props.keyword,
});

onMounted(async () => {
  try {
    const setting = await getInspectionManualCreateSettingApi();
    manualCreateEnabled.value = setting.enabled;
  } catch {
    // Keep the default (enabled) if the setting cannot be fetched.
  }
});

const exportInspectionRecordsAsXlsx =
  createVxePhotoXlsxExportMethod<QmsInspectionApi.InspectionRecord>({
    sheetName: '检验记录列表',
    filename: () => `检验记录列表-${Date.now()}.xlsx`,
    photoField: '__none__',
    getPhotoUrl: () => '',
    getRows: async ({ mode, $table, $grid }) => {
      if (mode === 'selected') {
        return $table.getCheckboxRecords() || [];
      }
      if (mode === 'all') {
        const proxyInfo = $grid?.getProxyInfo?.();
        const formValues = (proxyInfo?.form || {}) as Record<string, unknown>;
        const response = await getInspectionRecordsExport(
          buildInspectionRecordExportRequestParams({
            filters: buildFilterParams(formValues),
            sourceInspectionId: props.sourceInspectionId,
            type: props.type,
            year: props.year,
          }),
        );
        return response.items || [];
      }
      const tableData = $table.getTableData?.();
      return tableData?.fullData || [];
    },
  });

const processedColumns = (type: string) => {
  return getColumns(type, t).map((col) => {
    if (col.slots?.default === 'action') {
      return {
        ...col,
        slots: undefined,
        cellRender: {
          name: 'CellOperation',
          props: {
            options: [
              ...(canEdit.value ? ['edit'] : []),
              ...(canDelete.value ? ['delete'] : []),
            ],
            onClick: ({
              code,
              row,
            }: {
              code: string;
              row: QmsInspectionApi.InspectionRecord;
            }) => {
              if (code === 'edit') handleEdit(row);
              if (code === 'delete') handleDelete(row);
            },
          },
        },
        field: '__action',
      };
    }
    return col;
  });
};

function buildFilterParams(formValues: Record<string, unknown> = {}) {
  return buildInspectionRecordFilterParams({
    fallbackKeyword: props.keyword,
    filters: filters.value,
    formValues,
  });
}

const gridOptions = computed(() => ({
  columns: processedColumns(props.type),
  toolbarConfig: {
    refresh: true,
    zoom: true,
    custom: true,
    export: canExport.value,
    import: canImport.value,
    search: false,
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  importConfig: {
    remote: true,
    importMethod: async ({ file }: { file: File }) => {
      try {
        const results = await readImportRowsFromFile(file);

        if (!results || results.length === 0) return;

        // Basic field mapping (In real scenarios, this would be more complex)
        const mappedItems: Partial<QmsInspectionApi.InspectionRecord>[] =
          results.map((row) => {
            return {
              ...row,
              inspectionDate:
                typeof row.inspectionDate === 'string'
                  ? row.inspectionDate
                  : new Date().toISOString(),
            } as Partial<QmsInspectionApi.InspectionRecord>;
          });

        const res = await importInspectionRecords({
          items: mappedItems,
          category: props.type,
        });

        const { errorCount } = resolveImportErrorCount(res, mappedItems.length);

        if (res.successCount > 0) {
          message.success(
            t('common.importSuccessCount', { count: res.successCount }),
          );
          reload();
        }

        if (errorCount > 0) {
          message.warning(buildImportWarningMessage(res, errorCount));
        }
      } catch (error) {
        handleApiError(error, 'Import Inspection Records');
        message.error(t('common.importFailed'));
      }
    },
  },
  exportConfig: {
    remote: true,
    exportMethod: exportInspectionRecordsAsXlsx,
    types: ['xlsx'],
    modes: ['current', 'selected', 'all'],
    filename: '检验记录列表',
  },
  pagerConfig: { enabled: true },
  checkboxConfig: {
    labelField: 'seq',
    highlight: true,
    range: true,
  },
  proxyConfig: {
    ajax: {
      query: async (
        { page }: { page: { currentPage: number; pageSize: number } },
        formValues: Record<string, unknown>,
      ) => {
        return getInspectionRecords(
          buildInspectionRecordListRequestParams({
            filters: buildFilterParams(formValues),
            page: page.currentPage,
            pageSize: page.pageSize,
            sourceInspectionId: props.sourceInspectionId,
            type: props.type,
            year: props.year,
          }),
        );
      },
      queryAll: async ({
        formValues,
      }: {
        formValues: Record<string, unknown>;
      }) => {
        const res = await getInspectionRecords(
          buildInspectionRecordListRequestParams({
            filters: buildFilterParams(formValues),
            page: 1,
            pageSize: 100_000,
            sourceInspectionId: props.sourceInspectionId,
            type: props.type,
            year: props.year,
          }),
        );
        return { items: res.items || [] };
      },
    },
  },
}));

const checkedRows = ref<QmsInspectionApi.InspectionRecord[]>([]);

function normalizeIssueStatus(status: unknown) {
  return normalizeIssueTrackingStatus(status, {
    allowed: [
      ISSUE_TRACKING_STATUS.NO_ISSUE,
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.NO_ISSUE,
  });
}

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records =
    (params.$grid.getCheckboxRecords() as unknown as QmsInspectionApi.InspectionRecord[]) ||
    [];
  checkedRows.value = records;
}

function onCellClick(params: any) {
  const row = params?.row as QmsInspectionApi.InspectionRecord | undefined;
  const column = params?.column as
    | undefined
    | { field?: string; type?: string };

  if (!row || !column) return;

  if (column.field === '__action') return;
  if (
    column.type === 'checkbox' ||
    column.type === 'radio' ||
    column.type === 'seq'
  ) {
    return;
  }

  emit('view', row);
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
  cellClick: onCellClick,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions as unknown as VxeGridProps,
  gridEvents,
});

function handleEdit(row: QmsInspectionApi.InspectionRecord) {
  emit('edit', row);
}

function handleDelete(row: QmsInspectionApi.InspectionRecord) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk: async () => {
      try {
        await deleteInspectionRecord(row.id);
        message.success(t('common.deleteSuccess'));
        reload();
      } catch {
        message.error(t('common.deleteFailed'));
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
        const res = await batchDeleteInspectionRecords(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        checkedRows.value = []; // clear
        reload();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

function reload() {
  gridApi.reload();
}

function applyFilters() {
  reload();
}

function resetFilters(shouldReload = true) {
  filters.value = {
    keyword: props.keyword,
  };
  if (shouldReload) {
    reload();
  }
}

watch(
  () => props.type,
  (newType) => {
    gridApi.setGridOptions({
      columns: processedColumns(newType),
    });
    resetFilters(false);
    reload();
  },
);

watch(
  () => props.year,
  () => reload(),
);

watch(
  () => [props.keyword, props.sourceInspectionId],
  () => {
    filters.value.keyword = props.keyword;
    reload();
  },
);

defineExpose({ reload });
</script>

<template>
  <div
    class="mb-3 grid grid-cols-1 gap-3 rounded border border-gray-200 bg-gray-50 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
  >
    <Input
      v-model:value="filters.workOrderNumber"
      allow-clear
      :placeholder="t('qms.workOrder.workOrderNumber')"
      @press-enter="applyFilters"
    />
    <template v-if="props.type === 'incoming'">
      <Input
        v-model:value="filters.projectName"
        allow-clear
        :placeholder="t('qms.workOrder.projectName')"
        @press-enter="applyFilters"
      />
      <Input
        v-model:value="filters.materialName"
        allow-clear
        :placeholder="t('qms.inspection.records.form.materialName')"
        @press-enter="applyFilters"
      />
      <Input
        v-model:value="filters.supplierName"
        allow-clear
        :placeholder="t('qms.supplier.name')"
        @press-enter="applyFilters"
      />
      <Select
        v-model:value="filters.hasDocuments"
        allow-clear
        :options="[
          { label: '是', value: 'true' },
          { label: '否', value: 'false' },
        ]"
        placeholder="是否有资料"
      />
    </template>
    <template v-if="props.type === 'process'">
      <Input
        v-model:value="filters.processName"
        allow-clear
        :placeholder="t('qms.inspection.records.form.process')"
        @press-enter="applyFilters"
      />
      <Input
        v-model:value="filters.level1Component"
        allow-clear
        :placeholder="t('qms.inspection.records.form.level1')"
        @press-enter="applyFilters"
      />
      <Input
        v-model:value="filters.componentName"
        allow-clear
        :placeholder="t('qms.inspection.records.form.componentName')"
        @press-enter="applyFilters"
      />
      <Input
        v-model:value="filters.team"
        allow-clear
        :placeholder="t('qms.inspection.records.form.team')"
        @press-enter="applyFilters"
      />
    </template>
    <template v-if="props.type === 'incoming' || props.type === 'process'">
      <Input
        v-model:value="filters.inspector"
        allow-clear
        :placeholder="t('qms.inspection.records.form.inspector')"
        @press-enter="applyFilters"
      />
      <DatePicker.RangePicker
        v-model:value="filters.inspectionDateRange"
        allow-clear
        class="w-full xl:col-span-2"
        :placeholder="[
          t('qms.inspection.records.filters.startDate'),
          t('qms.inspection.records.filters.endDate'),
        ]"
        value-format="YYYY-MM-DD"
      />
    </template>
    <Space>
      <Button type="primary" @click="applyFilters">
        <template #icon>
          <IconifyIcon icon="lucide:search" />
        </template>
        {{ t('common.search') }}
      </Button>
      <Button @click="resetFilters()">
        <template #icon>
          <IconifyIcon icon="lucide:rotate-ccw" />
        </template>
        {{ t('common.reset') }}
      </Button>
    </Space>
  </div>

  <Grid>
    <template #toolbar-actions>
      <Space :direction="props.isMobile ? 'vertical' : 'horizontal'">
        <Button
          v-if="canCreateRecord"
          shape="round"
          type="primary"
          @click="emit('create')"
        >
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          {{ t('common.add') }}
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
      </Space>
    </template>

    <template #result="{ row }">
      <QmsStatusTag :status="row.result" type="inspection" />
    </template>

    <template #issueStatus="{ row }">
      <Tag
        v-if="
          normalizeIssueStatus(row.issueStatus) ===
          ISSUE_TRACKING_STATUS.NO_ISSUE
        "
      >
        无问题
      </Tag>
      <QmsStatusTag
        v-else
        :status="normalizeIssueStatus(row.issueStatus)"
        type="after-sales"
      />
    </template>

    <template #hasDocuments="{ row }">
      <Tag :color="row.hasDocuments ? 'blue' : 'default'">
        {{ row.hasDocuments ? '是' : '否' }}
      </Tag>
    </template>
  </Grid>
</template>
