<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode, VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watchEffect } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Button,
  DatePicker,
  message,
  Segmented,
  Select,
  Space,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { WorkOrderStatusEnum } from '#/api/qms/enums';
import {
  getWorkOrderDashboardStats,
  getWorkOrderExportList,
  getWorkOrderListPage,
} from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import ErrorBoundary from '#/components/ErrorBoundary.vue';
import { QmsStatusTag } from '#/components/Qms';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { convertToTreeSelectData, findNameById } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import WorkOrderCharts from './components/WorkOrderCharts.vue';
import WorkOrderEditModal from './components/WorkOrderEditModal.vue';
import { useWorkOrderActions } from './composables/useWorkOrderActions';
import { useWorkOrderImport } from './composables/useWorkOrderImport';
import { getStatusInfo } from './composables/useWorkOrderStatus';
import { getGridColumns } from './data';

// 1. 基础状态 (权限与通用功能)
const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canEdit, canDelete, canExport, canImport } =
  useQmsPermissions('QMS:WorkOrder');

// 2. 部门树数据
const deptTreeData = ref<TreeSelectNode[]>([]);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const isDeptLoading = ref(false);

const loadDeptTree = async () => {
  try {
    isDeptLoading.value = true;
    const data = await getDeptList();
    deptRawData.value = data;
    deptTreeData.value = convertToTreeSelectData(data);
  } catch (error) {
    handleApiError(error, 'Load Work Order Departments');
  } finally {
    isDeptLoading.value = false;
  }
};
onMounted(loadDeptTree);

// 3. 工单数据与统计逻辑 (动态年份)
const workOrderStats = ref<
  import('#/api/qms/work-order').WorkOrderDashboardStats | null
>(null);
const isStatsLoading = ref(false);
const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const currentDateMode = ref<'month' | 'week' | 'year'>('year');
const currentDate = ref(dayjs());

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('qms.common.unit.year')}`,
    value: y,
  }));
});

const dateModeOptions = computed(() => [
  {
    label: t('common.unit.year'),
    value: 'year',
  },
  {
    label: t('common.unit.month'),
    value: 'month',
  },
  {
    label: t('common.unit.week'),
    value: 'week',
  },
]);

const dateRange = computed(() => {
  if (currentDateMode.value === 'year') {
    return {
      startDate: `${currentYear.value}-01-01`,
      endDate: `${currentYear.value}-12-31`,
    };
  }
  if (currentDateMode.value === 'month') {
    return {
      startDate: currentDate.value.startOf('month').format('YYYY-MM-DD'),
      endDate: currentDate.value.endOf('month').format('YYYY-MM-DD'),
    };
  }
  return {
    startDate: currentDate.value.startOf('week').format('YYYY-MM-DD'),
    endDate: currentDate.value.endOf('week').format('YYYY-MM-DD'),
  };
});

interface WorkOrderSearchFormValues {
  productName?: string;
  status?: string;
  workOrderNumber?: string;
}

function buildQueryParams(formValues: WorkOrderSearchFormValues = {}) {
  const { productName, ...rest } = formValues;
  return {
    ...rest,
    granularity: currentDateMode.value,
    productName: productName?.trim() || undefined,
    startDate: dateRange.value.startDate,
    endDate: dateRange.value.endDate,
    year: currentYear.value,
  };
}

function reloadGrid() {
  if (gridApi.value) {
    gridApi.value.reload();
  }
}

// 5. 导入功能（使用 gridApi 引用）
const { handleImport, gridApi } = useWorkOrderImport(() => {
  api.reload();
});

// 5.1 搜索表单配置
const statusOptions = computed(() =>
  Object.values(WorkOrderStatusEnum).map((value) => {
    const info = getStatusInfo(value);
    return { label: info.defaultText, value };
  }),
);

const formSchema = [
  {
    fieldName: 'workOrderNumber',
    label: t('qms.workOrder.workOrderNumber'),
    component: 'Input',
    componentProps: {
      placeholder: t('common.pleaseInput'),
      allowClear: true,
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'productName',
    label: t('qms.workOrder.productName'),
    component: 'Input',
    componentProps: {
      placeholder: t('common.pleaseInput'),
      allowClear: true,
    },
    colProps: { span: 6 },
  },
  {
    fieldName: 'status',
    label: t('qms.workOrder.statusLabel'),
    component: 'Select',
    componentProps: {
      options: statusOptions,
      placeholder: t('common.pleaseSelect'),
      allowClear: true,
    },
    colProps: { span: 6 },
  },
];

const exportWorkOrderAsXlsx =
  createVxePhotoXlsxExportMethod<QmsWorkOrderApi.WorkOrderItem>({
    sheetName: t('qms.workOrder.title'),
    filename: () => `${t('qms.workOrder.title')}-${Date.now()}.xlsx`,
    photoField: '__none__',
    getPhotoUrl: () => '',
    getRows: async ({ mode, $table, $grid }) => {
      if (mode === 'selected') {
        return $table.getCheckboxRecords() || [];
      }
      if (mode === 'all') {
        const proxyInfo = $grid?.getProxyInfo?.();
        const formValues = (proxyInfo?.form || {}) as WorkOrderSearchFormValues;
        const response = await getWorkOrderExportList(
          buildQueryParams(formValues),
        );
        return response.items || [];
      }
      const tableData = $table.getTableData?.();
      return tableData?.fullData || [];
    },
  });

// 6. Grid 表格配置
const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    { type: 'checkbox', width: 50 },
    ...(getGridColumns() || []).map((col) => {
      // 关键修复：通过 formatter 实现事业部名称的响应式转换
      if (col.field === 'division') {
        return {
          ...col,
          slots: {}, // 禁用 slot，改用更稳定的 formatter
          formatter: ({
            cellValue,
          }: {
            cellValue: null | string | undefined;
          }) => {
            return (
              findNameById(deptRawData.value, cellValue || '') ||
              cellValue ||
              '-'
            );
          },
        };
      }
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
                row: QmsWorkOrderApi.WorkOrderItem;
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
  ],
  checkboxConfig: {
    reserve: true,
    highlight: true,
  },
  toolbarConfig: {
    export: canExport.value,
    refresh: true,
    import: canImport.value,
    search: true,
    zoom: true,
    custom: true,
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  importConfig: {
    remote: true,
    importMethod: handleImport,
  },
  exportConfig: {
    remote: true,
    exportMethod: exportWorkOrderAsXlsx,
    types: ['xlsx'],
    modes: ['current', 'selected', 'all'],
  },
  proxyConfig: {
    ajax: {
      query: async (
        {
          page: pageParams,
        }: { page?: { currentPage?: number; pageSize?: number } },
        formValues: WorkOrderSearchFormValues,
      ) => {
        try {
          const { currentPage = 1, pageSize = 20 } = pageParams || {};
          isStatsLoading.value = true;
          const queryParams = buildQueryParams(formValues);

          const [response, stats] = await Promise.all([
            getWorkOrderListPage({
              page: currentPage,
              pageSize,
              ...queryParams,
            }),
            getWorkOrderDashboardStats(queryParams),
          ]);
          workOrderStats.value = stats;

          const { items, total } = response;

          return {
            items,
            total,
          };
        } catch (error: unknown) {
          handleApiError(error, 'Load Work Order List');
          message.error(
            t('qms.common.dataLoadFailed') +
              ((error as { message?: string }).message
                ? `: ${(error as { message?: string }).message}`
                : ''),
          );
          return { items: [], total: 0 };
        } finally {
          isStatsLoading.value = false;
        }
      },
      queryAll: async (params) => {
        const rawParams = params as {
          form?: Record<string, unknown>;
          formValues?: Record<string, unknown>;
        };
        const formValues =
          (rawParams.form as unknown as WorkOrderSearchFormValues) ||
          (rawParams.formValues as unknown as WorkOrderSearchFormValues);
        try {
          const response = await getWorkOrderListPage({
            page: 1,
            pageSize: 100_000,
            ...buildQueryParams(formValues),
          });
          return { items: response.items };
        } catch (error) {
          handleApiError(error, 'Query All Work Orders');
          message.error(t('qms.common.dataLoadFailed'));
          return { items: [] };
        }
      },
    },
  },
}));

// ...

const checkedRows = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsWorkOrderApi.WorkOrderItem>,
) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records;
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

// 使用 useVbenVxeGrid 并更新 gridApi 引用
const [Grid, api] = useVbenVxeGrid({
  gridOptions: gridOptions.value,
  gridEvents,
  formOptions: {
    schema: formSchema,
    showCollapseButton: true,
    submitOnChange: true,
    submitOnEnter: true,
  },
});

// 更新之前声明的 gridApi 引用
watchEffect(() => {
  gridApi.value = api;
});

// 6. 业务操作
const editModalRef = ref<InstanceType<typeof WorkOrderEditModal> | null>(null);
const showDashboard = ref(true);

const {
  handleAdd,
  handleEdit,
  handleDelete,
  handleBatchDelete,
  handleSuccess,
} = useWorkOrderActions({
  gridApi,
  deptTreeData,
  editModalRef,
  checkedRows,
});
</script>

<template>
  <Page>
    <ErrorBoundary>
      <div class="flex flex-col gap-4 p-4">
        <!-- 数字化仪表盘 -->
        <WorkOrderCharts
          v-if="showDashboard"
          :stats-data="workOrderStats"
          :dept-data="deptRawData"
          :loading="isStatsLoading || isDeptLoading"
        />

        <!-- 表格区域 -->
        <div class="rounded-lg bg-white shadow-sm">
          <Grid>
            <!-- 核心修复：Toolbar 内部也保留按钮作为备份 -->
            <template #toolbar-actions>
              <Space>
                <Button
                  v-if="canCreate"
                  shape="round"
                  type="primary"
                  @click="handleAdd"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:plus" />
                  </template>
                  {{ t('qms.workOrder.createWorkOrder') }}
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
                <Button @click="showDashboard = !showDashboard">
                  <template #icon>
                    <IconifyIcon
                      :icon="
                        showDashboard
                          ? 'lucide:layout-panel-top'
                          : 'lucide:layout-panel-off'
                      "
                    />
                  </template>
                  {{
                    showDashboard
                      ? t('qms.workOrder.hideChart')
                      : t('qms.workOrder.showChart')
                  }}
                </Button>
                <div class="ml-2 flex items-center gap-2">
                  <span class="text-xs text-gray-500"
                    >{{ t('qms.workOrder.dateMode') }}:</span
                  >
                  <div class="flex items-center gap-2">
                    <Segmented
                      v-model:value="currentDateMode"
                      :options="dateModeOptions"
                      size="small"
                      @change="reloadGrid"
                    />
                    <Select
                      v-if="currentDateMode === 'year'"
                      v-model:value="currentYear"
                      :options="yearOptions"
                      size="small"
                      class="w-[100px]"
                      @change="reloadGrid"
                    />
                    <DatePicker
                      v-else
                      v-model:value="currentDate"
                      :picker="currentDateMode"
                      size="small"
                      style="width: 140px"
                      @change="reloadGrid"
                    />
                  </div>
                </div>
              </Space>
            </template>

            <template #status="{ row }">
              <QmsStatusTag :status="row.status" type="work-order" />
            </template>
          </Grid>
        </div>
      </div>

      <WorkOrderEditModal ref="editModalRef" @success="handleSuccess" />
    </ErrorBoundary>
  </Page>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
</style>
