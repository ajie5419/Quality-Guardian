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
  importInspectionRecords,
} from '#/api/qms/inspection';
import { QmsStatusTag } from '#/components/Qms';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { readImportRowsFromFile } from '#/utils/import-sheet';
import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';

import { getColumns } from '../config';

// Define strict type for schema item
type GridFormSchema = NonNullable<
  NonNullable<VxeGridProps['formOptions']>['schema']
>[number];

const props = defineProps<{
  type: string;
  year: number;
}>();

const emit = defineEmits(['create', 'edit']);
const { t } = useI18n();
const { canCreate, canEdit, canDelete, canExport, canImport } =
  useQmsPermissions('QMS:Inspection:Records');

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
        console.error('Import Error:', error);
        message.error(t('common.importFailed'));
      }
    },
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
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
          keyword: formValues?.keyword as string | undefined,
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
          keyword: formValues?.keyword as string | undefined,
        });
        return { items: res.items };
      },
    },
  },
}));

const checkedRows = ref<QmsInspectionApi.InspectionRecord[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records =
    (params.$grid.getCheckboxRecords() as unknown as QmsInspectionApi.InspectionRecord[]) ||
    [];
  checkedRows.value = records;
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
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

    <template #hasDocuments="{ row }">
      <Tag :color="row.hasDocuments ? 'blue' : 'default'">
        {{ row.hasDocuments ? '是' : '否' }}
      </Tag>
    </template>
  </Grid>
</template>
