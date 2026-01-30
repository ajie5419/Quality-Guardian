<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, message, Modal, Space } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteInspectionRecords,
  deleteInspectionRecord,
  getInspectionRecords,
} from '#/api/qms/inspection';

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

const gridOptions = computed(() => ({
  columns: getColumns(props.type, t).map((col) => {
    if (col.slots?.default === 'action') {
      return {
        ...col,
        slots: undefined,
        cellRender: {
          name: 'CellOperation',
          props: {
            options: ['edit', 'delete'],
            onClick: ({ code, row }: { code: string; row: any }) => {
              if (code === 'edit') handleEdit(row);
              if (code === 'delete') handleDelete(row);
            },
          },
        },
      };
    }
    return col;
  }),
  toolbarConfig: {
    refresh: true,
    zoom: true,
    custom: true,
    export: true,
    search: true,
    slots: {
      buttons: 'toolbar-actions',
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
        formValues: any,
      ) => {
        return await getInspectionRecords({
          type: props.type,
          year: props.year,
          page: page.currentPage,
          pageSize: page.pageSize,
          keyword: formValues?.keyword,
        });
      },
      queryAll: async ({ formValues }: { formValues: any }) => {
        const res = await getInspectionRecords({
          type: props.type,
          year: props.year,
          page: 1,
          pageSize: 100_000,
          keyword: formValues?.keyword,
        });
        return { items: res.items };
      },
    },
  },
}));

// ...

const checkedRows = ref<any[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
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

function handleEdit(row: any) {
  emit('edit', row);
}

function handleDelete(row: any) {
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
        const ids = checkedRows.value.map((r: any) => r.id);
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
      columns: getColumns(newType, t),
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
        <Button shape="round" type="primary" @click="emit('create')">
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          {{ t('common.add') }}
        </Button>
        <Button
          v-if="checkedRows.length > 0"
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
      <span :class="row.result === 'PASS' ? 'text-green-500' : 'text-red-500'">
        {{ t(`qms.inspection.resultValue.${row.result}`) }}
      </span>
    </template>
  </Grid>
</template>
