<script lang="ts" setup>
import type { VxeGridListeners, VxeGridProps } from '#/adapter/vxe-table';
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { VxeCheckboxChangeParams } from '#/types';

import { computed, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Badge, Button, Card, Space, Tag, Tooltip } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getSupplierExportList, getSupplierListPage } from '#/api/qms/supplier';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import {
  RATING_COLORS,
  SUPPLIER_STATUS_UI_MAP,
} from '../shared/constants/supplier-ui';
import ScoringRulesModal from '../supplier/components/ScoringRulesModal.vue';
import SupplierDetailDrawer from '../supplier/components/SupplierDetailDrawer.vue';
import SupplierEditModal from '../supplier/components/SupplierEditModal.vue';
import SupplierStats from '../supplier/components/SupplierStats.vue';
import { useSupplierActions } from '../supplier/composables/useSupplierActions';
import { getColumns, getSearchFormSchema } from '../supplier/data';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { hasAccessByCodes } = useAccess();

const canExport = computed(() => hasAccessByCodes(['QMS:Outsourcing:Export']));
const canImport = computed(() => hasAccessByCodes(['QMS:Outsourcing:Import']));
const canEdit = computed(() => hasAccessByCodes(['QMS:Outsourcing:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:Outsourcing:Delete']));

const checkedRows = ref<QmsSupplierApi.SupplierItem[]>([]);
const editModalRef = ref();
const detailDrawerRef = ref();
const rulesModalRef = ref();

const exportOutsourcingAsXlsx =
  createVxePhotoXlsxExportMethod<QmsSupplierApi.SupplierItem>({
    sheetName: t('qms.outsourcing.title'),
    filename: () => `${t('qms.outsourcing.title')}-${Date.now()}.xlsx`,
    photoField: '__none__',
    getPhotoUrl: () => '',
    getRows: async ({ mode, $table, $grid }) => {
      if (mode === 'selected') {
        return $table.getCheckboxRecords() || [];
      }
      if (mode === 'all') {
        const proxyInfo = $grid?.getProxyInfo?.();
        const formValues = (proxyInfo?.form || {}) as Record<string, unknown>;
        const response = await getSupplierExportList({
          category: 'Outsourcing',
          ...formValues,
        });
        return response.items || [];
      }
      const tableData = $table.getTableData?.();
      return tableData?.fullData || [];
    },
  });

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
    importMethod: ({ file }: { file: File }) => handleCustomImport({ file }),
  },
  exportConfig: {
    remote: true,
    exportMethod: exportOutsourcingAsXlsx,
    types: ['xlsx'],
    modes: ['current', 'selected', 'all'],
  },
  keepSource: true,
  checkboxConfig: {
    reserve: true,
    highlight: true,
    range: true,
  },
  columns: (getColumns('Outsourcing') ?? []).map((col) => {
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
              row: QmsSupplierApi.SupplierItem;
            }) => {
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
            category: 'Outsourcing',
            page: page?.currentPage,
            pageSize: page?.pageSize,
            sortBy: sorts?.[0]?.field,
            sortOrder: sorts?.[0]?.order as 'asc' | 'desc',
            ...formValues,
          };

          const response = await getSupplierListPage(params);
          if (response.stats) {
            stats.value = response.stats;
          }
          return { items: response.items || [], total: response.total || 0 };
        } catch (error) {
          handleApiError(error, 'Load Outsourcing List');
          return { items: [], total: 0 };
        }
      },
      queryAll: async (params) => {
        try {
          const formValues = (
            params as { formValues?: Record<string, unknown> }
          ).formValues;
          const queryParams: QmsSupplierApi.SupplierListParams = {
            category: 'Outsourcing',
            page: 1,
            pageSize: 100_000,
            ...formValues,
          };
          const response = await getSupplierListPage(queryParams);
          return { items: response.items || [] };
        } catch (error) {
          handleApiError(error, 'Load All Outsourcing List');
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
    schema: getSearchFormSchema('Outsourcing'),
    submitOnChange: true,
  },
});

// ================= 操作逻辑 =================
const {
  handleOpenModal,
  handleEdit,
  handleDelete,
  handleBatchDelete,
  showDetail,
  handleCustomImport,
  handleSuccess,
} = useSupplierActions({
  gridApi,
  editModalRef,
  detailDrawerRef,
  checkedRows,
  category: 'Outsourcing',
  createValues: { category: 'Outsourcing' },
  detailTitleKey: 'qms.outsourcing.title',
});

// Helper to get status config safely
function getStatusConfig(status?: string): {
  defaultText: string;
  status: 'default' | 'error' | 'processing' | 'success' | 'warning';
  textKey: string;
} {
  if (!status) {
    return {
      status: 'default',
      textKey: '',
      defaultText: '-',
    };
  }
  const statusMap = SUPPLIER_STATUS_UI_MAP as Record<
    string,
    {
      defaultText: string;
      status: 'default' | 'error' | 'processing' | 'success' | 'warning';
      textKey: string;
    }
  >;
  return (
    statusMap[status] || {
      status: 'default',
      textKey: '',
      defaultText: '-',
    }
  );
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 p-4">
      <!-- 统计卡片 (复用) -->
      <SupplierStats :stats="stats" type="Outsourcing" />

      <!-- 表格 -->
      <Card :bordered="false" class="shadow-sm">
        <Grid>
          <template #toolbar-actions>
            <Space>
              <Button
                v-access:code="'QMS:Outsourcing:Create'"
                shape="round"
                type="primary"
                @click="handleOpenModal"
              >
                <span class="vxe-icon-add mr-1"></span>
                {{ t('qms.outsourcing.addUnit') }}
              </Button>
              <Button @click="() => rulesModalRef?.openModal()">
                <template #icon>
                  <span class="i-lucide-book-open mr-1"></span>
                </template>
                {{ t('qms.supplier.scoringRules') }}
              </Button>
              <Button
                v-if="checkedRows.length > 0"
                v-access:code="'QMS:Outsourcing:Delete'"
                danger
                shape="round"
                type="primary"
                @click="handleBatchDelete"
              >
                <span class="vxe-icon-delete mr-1"></span>
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
                :title="row.warningReasons?.join('、') || '质量异常预警'"
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
                    ? (RATING_COLORS as Record<string, string>)[row.level]
                    : row.rating
                      ? (RATING_COLORS as Record<string, string>)[row.rating]
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
    <ScoringRulesModal ref="rulesModalRef" />
  </Page>
</template>

<style scoped>
:deep(.ant-card-head) {
  border-bottom: 1px solid #f0f0f0;
}
</style>
