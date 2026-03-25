<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, message, Modal, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteInspectionRecords,
  deleteInspectionRecord,
  getInspectionRecords,
  getInspectionRecordsExport,
  importInspectionRecords,
  updateInspectionArchiveTaskStatus,
} from '#/api/qms/inspection';
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

// Define strict type for schema item
type GridFormSchema = NonNullable<
  NonNullable<VxeGridProps['formOptions']>['schema']
>[number];

const props = defineProps<{
  keyword?: string;
  sourceInspectionId?: string;
  type: string;
  year: number;
}>();

const emit = defineEmits(['create', 'edit', 'createIssue', 'view']);
const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canEdit, canDelete, canExport, canImport } =
  useQmsPermissions('QMS:Inspection:Records');
const { canCreate: canCreateIssue } = useQmsPermissions(
  'QMS:Inspection:Issues',
);

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
        const response = await getInspectionRecordsExport({
          type: props.type,
          year: props.year,
          keyword: (formValues?.keyword as string | undefined) || props.keyword,
        });
        return filterBySourceInspectionId(response.items || []);
      }
      const tableData = $table.getTableData?.();
      return filterBySourceInspectionId(tableData?.fullData || []);
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
              ...(canCreateIssue.value
                ? [
                    {
                      code: 'create-issue',
                      icon: 'carbon:warning-alt',
                      title: '生成不合格项',
                    },
                  ]
                : []),
              ...(canEdit.value ? ['edit'] : []),
              ...(canEdit.value
                ? [
                    {
                      code: 'mark-archived',
                      icon: 'carbon:task-complete',
                      title: '标记归档',
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
              row: QmsInspectionApi.InspectionRecord;
            }) => {
              if (code === 'create-issue') emit('createIssue', row);
              if (code === 'edit') handleEdit(row);
              if (code === 'mark-archived') handleMarkArchived(row);
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
const gridOptions = computed(() => ({
  columns: processedColumns(props.type),
  toolbarConfig: {
    refresh: true,
    zoom: true,
    custom: true,
    export: canExport.value,
    import: canImport.value,
    search: true,
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
        return await getInspectionRecords({
          type: props.type,
          year: props.year,
          page: page.currentPage,
          pageSize: page.pageSize,
          keyword: (formValues?.keyword as string | undefined) || props.keyword,
        });
      },
      queryAll: async ({
        formValues,
      }: {
        formValues: Record<string, unknown>;
      }) => {
        const res = await getInspectionRecords({
          type: props.type,
          year: props.year,
          page: 1,
          pageSize: 100_000,
          keyword: (formValues?.keyword as string | undefined) || props.keyword,
        });
        return { items: filterBySourceInspectionId(res.items || []) };
      },
    },
  },
}));

const checkedRows = ref<QmsInspectionApi.InspectionRecord[]>([]);

function normalizeIssueStatus(status: unknown) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  return normalized || 'NO_ISSUE';
}

function normalizeArchiveStatus(status: unknown) {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  if (!normalized) return 'NONE';
  if (normalized === 'ARCHIVED') return 'ARCHIVED';
  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (normalized === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function filterBySourceInspectionId(
  items: QmsInspectionApi.InspectionRecord[] = [],
) {
  return props.sourceInspectionId
    ? items.filter((item) => item.id === props.sourceInspectionId)
    : items;
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
  formOptions: {
    schema: [
      {
        fieldName: 'keyword',
        label: t('common.search'),
        component: 'Input',
        componentProps: {
          placeholder: t('common.pleaseInput'),
        },
        defaultValue: props.keyword,
        colProps: {
          span: 8,
        },
      } as unknown as GridFormSchema,
    ],
    showCollapseButton: false,
    submitOnChange: true,
    submitOnEnter: true,
  },
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

async function handleMarkArchived(row: QmsInspectionApi.InspectionRecord) {
  const archiveTaskId = String((row as any).archiveTaskId || '').trim();
  if (!archiveTaskId) {
    message.warning('当前记录无需归档（未生成归档任务）');
    return;
  }

  if (normalizeArchiveStatus((row as any).archiveTaskStatus) === 'ARCHIVED') {
    message.info('该记录已归档');
    return;
  }

  Modal.confirm({
    title: '确认标记归档',
    content: '系统将校验工作内容和附件，校验通过后标记为已归档。',
    onOk: async () => {
      try {
        await updateInspectionArchiveTaskStatus(archiveTaskId, {
          status: 'ARCHIVED',
        });
        message.success('已标记归档');
        reload();
      } catch (error) {
        handleApiError(error, 'Update Inspection Archive Status');
        message.error('归档失败，请先补全工作内容和附件');
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

watch(
  () => props.type,
  (newType) => {
    gridApi.setGridOptions({
      columns: processedColumns(newType),
    });
    reload();
  },
);

watch(
  () => props.year,
  () => reload(),
);

watch(
  () => [props.keyword, props.sourceInspectionId],
  () => reload(),
);

defineExpose({ reload });
</script>

<template>
  <Grid>
    <template #toolbar-actions>
      <Space>
        <Button
          v-if="canCreate"
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
      <Tag v-if="normalizeIssueStatus(row.issueStatus) === 'NO_ISSUE'">
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

    <template #archiveTaskStatus="{ row }">
      <Tag
        :color="
          normalizeArchiveStatus(row.archiveTaskStatus) === 'NONE'
            ? 'default'
            : normalizeArchiveStatus(row.archiveTaskStatus) === 'ARCHIVED'
              ? 'success'
              : normalizeArchiveStatus(row.archiveTaskStatus) === 'IN_PROGRESS'
                ? 'processing'
                : normalizeArchiveStatus(row.archiveTaskStatus) === 'REJECTED'
                  ? 'error'
                  : 'warning'
        "
      >
        {{
          normalizeArchiveStatus(row.archiveTaskStatus) === 'NONE'
            ? '无需归档'
            : normalizeArchiveStatus(row.archiveTaskStatus) === 'ARCHIVED'
              ? '已归档'
              : normalizeArchiveStatus(row.archiveTaskStatus) === 'IN_PROGRESS'
                ? '整理中'
                : normalizeArchiveStatus(row.archiveTaskStatus) === 'REJECTED'
                  ? '已退回'
                  : '待整理'
        }}
      </Tag>
    </template>
  </Grid>
</template>
