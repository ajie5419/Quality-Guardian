<script lang="ts" setup>
import type { WorkOrderSearchFormValues } from './composables/useWorkOrderQueryFilters';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode, VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useI18n } from '@vben/locales';

import { Button, message } from 'ant-design-vue';

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
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { convertToTreeSelectData, findNameById } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

import WorkOrderAggregateDrawer from '../workspace/components/WorkOrderAggregateDrawer.vue';
import WorkOrderCharts from './components/WorkOrderCharts.vue';
import WorkOrderEditModal from './components/WorkOrderEditModal.vue';
import WorkOrderRequirementBoardDrawer from './components/WorkOrderRequirementBoardDrawer.vue';
import WorkOrderRequirementSummaryCards from './components/WorkOrderRequirementSummaryCards.vue';
import WorkOrderToolbarActions from './components/WorkOrderToolbarActions.vue';
import { useWorkOrderActions } from './composables/useWorkOrderActions';
import { useWorkOrderAggregateDrawer } from './composables/useWorkOrderAggregateDrawer';
import { useWorkOrderImport } from './composables/useWorkOrderImport';
import { useWorkOrderQueryFilters } from './composables/useWorkOrderQueryFilters';
import { useWorkOrderRequirementBoard } from './composables/useWorkOrderRequirementBoard';
import { getStatusInfo } from './composables/useWorkOrderStatus';
import { getGridColumns } from './data';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const route = useRoute();
const router = useRouter();
const { canCreate, canEdit, canDelete, canExport, canImport } =
  useQmsPermissions('QMS:WorkOrder');
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
const workOrderStats = ref<
  import('#/api/qms/work-order').WorkOrderDashboardStats | null
>(null);
const {
  aggregateData,
  aggregateLoading,
  aggregateVisible,
  closeWorkOrderAggregate,
  divisionLabel,
  openWorkOrderAggregate,
  refreshAggregate,
  selectedWorkOrderNumber,
} = useWorkOrderAggregateDrawer(handleApiError);
const isStatsLoading = ref(false);
const {
  buildQueryParams,
  currentDate,
  currentDateMode,
  currentYear,
  dateModeOptions,
  yearOptions,
} = useWorkOrderQueryFilters();
const latestRequirementQueryParams =
  ref<ReturnType<typeof buildQueryParams>>(buildQueryParams());
const {
  boardFilter,
  boardItems,
  boardLoading,
  boardPagination,
  boardVisible,
  closeBoard,
  loadBoard,
  loadOverview,
  openBoard,
  overview,
} = useWorkOrderRequirementBoard(
  () => latestRequirementQueryParams.value,
  handleApiError,
);

function reloadGrid() {
  if (gridApi.value) {
    gridApi.value.reload();
  }
}

const { handleImport, gridApi } = useWorkOrderImport(() => {
  api.reload();
});

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
const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    { type: 'checkbox', width: 50 },
    ...(getGridColumns() || []).map((col) => {
      if (col.field === 'division') {
        return {
          ...col,
          slots: {},
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

          latestRequirementQueryParams.value = queryParams;
          const [response, stats] = await Promise.all([
            getWorkOrderListPage({
              page: currentPage,
              pageSize,
              ...queryParams,
            }),
            getWorkOrderDashboardStats(queryParams),
            loadOverview(queryParams),
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
gridApi.value = api;

watch(
  () => route.query.workOrderNumber,
  (value) => {
    const workOrderNumber = String(value || '').trim();
    if (!workOrderNumber) {
      if (!aggregateVisible.value) return;
      aggregateVisible.value = false;
      aggregateData.value = null;
      selectedWorkOrderNumber.value = '';
      return;
    }
    if (selectedWorkOrderNumber.value === workOrderNumber) return;
    openWorkOrderAggregate(workOrderNumber);
  },
  { immediate: true },
);

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
        <WorkOrderCharts
          v-if="showDashboard"
          :stats-data="workOrderStats"
          :dept-data="deptRawData"
          :loading="isStatsLoading || isDeptLoading"
        />
        <WorkOrderRequirementSummaryCards
          :overview="overview"
          :loading="boardLoading"
          @open="openBoard"
        />

        <div class="rounded-lg bg-white shadow-sm">
          <Grid>
            <template #toolbar-actions>
              <WorkOrderToolbarActions
                :can-create="canCreate"
                :can-delete="canDelete"
                :checked-rows-length="checkedRows.length"
                :current-date="currentDate"
                :current-date-mode="currentDateMode"
                :current-year="currentYear"
                :date-mode-options="dateModeOptions"
                :show-dashboard="showDashboard"
                :year-options="yearOptions"
                @add="handleAdd"
                @batch-delete="handleBatchDelete"
                @reload="reloadGrid"
                @toggle-dashboard="showDashboard = !showDashboard"
                @update:current-date="currentDate = $event"
                @update:current-date-mode="currentDateMode = $event"
                @update:current-year="currentYear = $event"
              />
            </template>

            <template #status="{ row }">
              <QmsStatusTag :status="row.status" type="work-order" />
            </template>

            <template #workOrderNumber="{ row }">
              <Button
                type="link"
                class="!px-0"
                @click="openWorkOrderAggregate(row.workOrderNumber)"
              >
                {{ row.workOrderNumber }}
              </Button>
            </template>
          </Grid>
        </div>
      </div>

      <WorkOrderEditModal ref="editModalRef" @success="handleSuccess" />
      <WorkOrderRequirementBoardDrawer
        :open="boardVisible"
        :loading="boardLoading"
        :filter="boardFilter"
        :items="boardItems"
        :pagination="boardPagination"
        @close="closeBoard"
        @page-change="
          (page, pageSize) => loadBoard(boardFilter, page, pageSize)
        "
        @open-work-order="
          async (workOrderNumber) => {
            closeBoard();
            await openWorkOrderAggregate(workOrderNumber);
          }
        "
      />
      <WorkOrderAggregateDrawer
        :open="aggregateVisible"
        :loading="aggregateLoading"
        :work-order-number="selectedWorkOrderNumber"
        :aggregate-data="aggregateData"
        :division-label="divisionLabel"
        @close="closeWorkOrderAggregate"
        @go-work-order="
          router.push({
            path: '/qms/work-order',
            query: { workOrderNumber: selectedWorkOrderNumber },
          })
        "
        @refresh="refreshAggregate"
      />
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
