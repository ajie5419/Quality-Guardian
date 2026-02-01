<script lang="ts" setup>
import type { VxeGridListeners, VxeGridProps } from '#/adapter/vxe-table';
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Badge,
  Button,
  Card,
  message,
  Modal,
  Space,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteSuppliers,
  deleteSupplier,
  getSupplierList,
} from '#/api/qms/supplier';

import { RATING_COLORS, SUPPLIER_STATUS_UI_MAP } from '../common-constants';
import SupplierDetailDrawer from './components/SupplierDetailDrawer.vue';
import SupplierEditModal from './components/SupplierEditModal.vue';
import SupplierStats from './components/SupplierStats.vue';
import { getColumns, getSearchFormSchema } from './data';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

const canExport = computed(() => hasAccessByCodes(['QMS:Supplier:Export']));
const canImport = computed(() => hasAccessByCodes(['QMS:Supplier:Import']));
const canEdit = computed(() => hasAccessByCodes(['QMS:Supplier:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:Supplier:Delete']));

const checkedRows = ref<QmsSupplierApi.SupplierItem[]>([]);
const editModalRef = ref();
const detailDrawerRef = ref();

// 统计数据
const stats = ref<QmsSupplierApi.SupplierStats>({
  avgScore: '0.0',
  qualified: 0,
  total: 0,
  warning: 0,
});

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsSupplierApi.SupplierItem>,
) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records;
}

// ================= 表格 Grid 配置 =================
const gridOptions = reactive<VxeGridProps<QmsSupplierApi.SupplierItem>>({
  rowConfig: {
    keyField: 'id',
    isHover: true,
  },
  height: 600,
  sortConfig: {
    remote: true,
    trigger: 'cell',
  },
  pagerConfig: {
    pageSize: 20,
    pageSizes: [10, 20, 30, 50, 100],
  },
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    custom: true,
    export: canExport.value,
    import: canImport.value,
    search: true,
    zoom: true,
    refresh: true,
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

        const columns = gridApi.grid.getColumns();
        const mappedItems = results.map((row: any) => {
          const item: any = {};
          columns.forEach((c: any) => {
            if (!c.field || !c.title) return;
            const excelKey = Object.keys(row).find(
              (k) =>
                String(k).replaceAll(/\s+/g, '') ===
                String(c.title).replaceAll(/\s+/g, ''),
            );
            if (excelKey) {
              let val = row[excelKey];
              if (val instanceof Date) {
                val = val.toISOString().split('T')[0];
              }
              item[c.field] = val;
            }
          });
          return item;
        });
        const res = await requestClient.post(
          '/qms/supplier/import',
          {
            items: mappedItems,
            category: 'Supplier',
          },
          { timeout: 120_000 },
        );
        if (res.successCount > 0) {
          message.success(
            t('common.importSuccessCount', { count: res.successCount }),
          );
          gridApi.reload();
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
  keepSource: true,
  checkboxConfig: {
    reserve: true,
    highlight: true,
    range: true,
  },
  columns: (getColumns('Supplier') ?? []).map((col) => {
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
  proxyConfig: {
    autoLoad: true,
    sort: true,
    ajax: {
      query: async ({ page, sorts }, formValues) => {
        try {
          const params: QmsSupplierApi.SupplierListParams = {
            category: 'Supplier',
            page: page?.currentPage,
            pageSize: page?.pageSize,
            sortBy: sorts?.[0]?.field,
            sortOrder: sorts?.[0]?.order as 'asc' | 'desc',
            ...formValues,
          };

          const response = await getSupplierList(params);
          if (response.stats) {
            stats.value = response.stats;
          }
          return { items: response.items || [], total: response.total || 0 };
        } catch (error) {
          console.error('Failed to load suppliers:', error);
          return { items: [], total: 0 };
        }
      },
      queryAll: async ({ formValues }: any) => {
        try {
          const params: QmsSupplierApi.SupplierListParams = {
            category: 'Supplier',
            page: 1,
            pageSize: 100_000,
            ...formValues,
          };
          const response = await getSupplierList(params);
          return { items: response.items || [] };
        } catch (error) {
          console.error('Failed to load all suppliers:', error);
          return { items: [] };
        }
      },
    },
  },
});

const gridEvents: VxeGridListeners<QmsSupplierApi.SupplierItem> = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions,
  gridEvents,
  formOptions: {
    schema: getSearchFormSchema('Supplier'),
    submitOnChange: true,
  },
});

// ================= 操作逻辑 =================

function handleOpenModal() {
  editModalRef.value?.open({ isUpdate: false, category: 'Supplier' });
}

function handleEdit(row: QmsSupplierApi.SupplierItem) {
  editModalRef.value?.open({
    isUpdate: true,
    record: row,
    category: 'Supplier',
  });
}

function handleDelete(row: QmsSupplierApi.SupplierItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: `${t('common.confirmDeleteContent')} [${row.name}] ?`,
    onOk: async () => {
      try {
        await deleteSupplier(row.id);
        message.success(t('common.deleteSuccess'));
        gridApi.reload();
      } catch (error) {
        console.error('Delete failed:', error);
      }
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) return;
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmBatchDelete', {
      count: checkedRows.value.length,
    }),
    onOk: async () => {
      try {
        const ids = checkedRows.value.map((row) => row.id);
        await batchDeleteSuppliers(ids);
        message.success(t('common.deleteSuccess'));
        checkedRows.value = [];
        gridApi.reload();
      } catch (error) {
        console.error('Batch delete failed:', error);
      }
    },
  });
}

function showDetail(row: QmsSupplierApi.SupplierItem) {
  detailDrawerRef.value?.open(row, t('qms.supplier.title'));
}

// Helper to get status config safely
function getStatusConfig(status?: string) {
  if (!status) {
    return {
      status: 'default',
      textKey: '',
      defaultText: '-',
    };
  }
  return (
    (SUPPLIER_STATUS_UI_MAP as any)[status] || {
      status: 'default',
      textKey: '',
      defaultText: '-',
    }
  );
}

function handleSuccess() {
  gridApi.reload();
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 p-4">
      <!-- 统计卡片 -->
      <SupplierStats :stats="stats" type="Supplier" />

      <!-- 表格 -->
      <Card :bordered="false" class="shadow-sm">
        <Grid>
          <template #toolbar-actions>
            <Space>
              <Button
                v-access:code="'QMS:Supplier:Create'"
                type="primary"
                @click="handleOpenModal"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                {{ t('qms.supplier.addSupplier') }}
              </Button>
              <Button
                v-if="checkedRows.length > 0"
                v-access:code="'QMS:Supplier:Delete'"
                danger
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

          <template #name_link="{ row }">
            <div class="flex items-center gap-2">
              <a class="font-bold text-blue-600" @click="showDetail(row)">{{
                row.name
              }}</a>
              <Tooltip
                v-if="row.isWarning"
                :title="
                  row.warningReasons?.join('、') ||
                  t('qms.supplier.warningPrompt')
                "
              >
                <span
                  class="i-lucide-alert-triangle animate-pulse cursor-help text-red-500"
                ></span>
              </Tooltip>
            </div>
          </template>

          <template #status_badge="{ row }">
            <div class="flex items-center">
              <Badge
                :status="getStatusConfig(row.status).status"
                :text="
                  getStatusConfig(row.status).textKey
                    ? t(getStatusConfig(row.status).textKey)
                    : '-'
                "
              />
            </div>
          </template>

          <template #level_tag="{ row }">
            <div class="flex items-center">
              <Tag
                :color="
                  row.level
                    ? (RATING_COLORS as any)[row.level]
                    : row.rating
                      ? (RATING_COLORS as any)[row.rating]
                      : 'default'
                "
              >
                {{ row.level || row.rating || '-' }} {{ t('common.level') }}
              </Tag>
            </div>
          </template>

          <template #score_tag="{ row }">
            <div
              :class="{
                'text-green-600': (row.qualityScore ?? 0) >= 90,
                'text-blue-600':
                  (row.qualityScore ?? 0) >= 80 && (row.qualityScore ?? 0) < 90,
                'text-red-600': (row.qualityScore ?? 0) < 80,
              }"
              class="flex items-center font-mono font-bold"
            >
              {{ row.qualityScore ?? '-' }}
            </div>
          </template>

          <template #eng_issue="{ row }">
            <div
              class="flex items-center"
              :class="{
                'font-bold text-orange-500':
                  (row.engineeringIssueCount ?? 0) > 0,
                'text-gray-400': (row.engineeringIssueCount ?? 0) <= 0,
              }"
            >
              {{ row.engineeringIssueCount ?? 0 }} {{ t('common.unit.item') }}
            </div>
          </template>

          <template #issue_count="{ row }">
            <div
              class="flex items-center"
              :class="{
                'font-bold text-red-500': (row.afterSalesIssueCount ?? 0) > 0,
                'text-gray-400': (row.afterSalesIssueCount ?? 0) <= 0,
              }"
            >
              {{ row.afterSalesIssueCount ?? 0 }} {{ t('common.unit.item') }}
            </div>
          </template>
        </Grid>
      </Card>
    </div>

    <SupplierEditModal ref="editModalRef" @success="handleSuccess" />
    <SupplierDetailDrawer ref="detailDrawerRef" />
  </Page>
</template>

<style scoped>
:deep(.ant-card-head) {
  border-bottom: 1px solid #f0f0f0;
}
</style>
