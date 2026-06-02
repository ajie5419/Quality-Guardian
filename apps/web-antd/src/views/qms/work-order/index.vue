<script lang="ts" setup>
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode, VxeCheckboxChangeParams } from '#/types';

import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useI18n } from '@vben/locales';

import { Button } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getDeptList } from '#/api/system/dept';
import ErrorBoundary from '#/components/ErrorBoundary.vue';
import { QmsStatusTag } from '#/components/Qms';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { convertToTreeSelectData } from '#/types';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import WorkOrderAggregateDrawer from '../workspace/components/WorkOrderAggregateDrawer.vue';
import WorkOrderCharts from './components/WorkOrderCharts.vue';
import WorkOrderEditModal from './components/WorkOrderEditModal.vue';
import WorkOrderMobileSection from './components/WorkOrderMobileSection.vue';
import WorkOrderRequirementBoardDrawer from './components/WorkOrderRequirementBoardDrawer.vue';
import WorkOrderRequirementSummaryCards from './components/WorkOrderRequirementSummaryCards.vue';
import WorkOrderToolbarActions from './components/WorkOrderToolbarActions.vue';
import { useWorkOrderActions } from './composables/useWorkOrderActions';
import { useWorkOrderAggregateDrawer } from './composables/useWorkOrderAggregateDrawer';
import { useWorkOrderGridOptions } from './composables/useWorkOrderGridOptions';
import { useWorkOrderImport } from './composables/useWorkOrderImport';
import { useWorkOrderMobileList } from './composables/useWorkOrderMobileList';
import { useWorkOrderQueryFilters } from './composables/useWorkOrderQueryFilters';
import { useWorkOrderRequirementBoard } from './composables/useWorkOrderRequirementBoard';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const route = useRoute();
const router = useRouter();
const { isMobile } = useMobileViewport();
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

const checkedRows = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
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

const {
  handleMobilePageChange,
  mobilePage,
  mobilePageSize,
  mobileRecords,
  mobileTotal,
  resetMobilePage,
  syncMobileRows,
} = useWorkOrderMobileList({
  deptRawData,
  gridApi: () => gridApi.value,
});

const { formSchema, gridOptions } = useWorkOrderGridOptions({
  buildQueryParams,
  canDelete,
  canEdit,
  canExport,
  canImport,
  deptRawData,
  handleApiError,
  handleDelete,
  handleEdit,
  handleImport,
  isStatsLoading,
  latestRequirementQueryParams,
  loadOverview,
  syncMobileRows,
  t,
  workOrderStats,
});

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

watch([currentYear, currentDateMode, currentDate], resetMobilePage);
</script>

<template>
  <Page content-class="p-0">
    <ErrorBoundary>
      <QmsPageShell>
        <div class="flex flex-col gap-3 sm:gap-4">
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

          <WorkOrderMobileSection
            v-if="isMobile"
            :can-create="canCreate"
            :can-delete="canDelete"
            :can-edit="canEdit"
            :checked-rows-length="checkedRows.length"
            :current-date="currentDate"
            :current-date-mode="currentDateMode"
            :current-year="currentYear"
            :date-mode-options="dateModeOptions"
            :page="mobilePage"
            :page-size="mobilePageSize"
            :records="mobileRecords"
            :show-dashboard="showDashboard"
            :total="mobileTotal"
            :year-options="yearOptions"
            @add="handleAdd"
            @batch-delete="handleBatchDelete"
            @delete="handleDelete"
            @detail="
              (row) =>
                openWorkOrderAggregate(row.workOrderNumber, {
                  syncRoute: false,
                })
            "
            @edit="handleEdit"
            @page-change="handleMobilePageChange"
            @reload="reloadGrid"
            @toggle-dashboard="showDashboard = !showDashboard"
            @update:current-date="currentDate = $event"
            @update:current-date-mode="currentDateMode = $event"
            @update:current-year="currentYear = $event"
          />

          <div v-show="!isMobile" class="rounded-lg bg-white shadow-sm">
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
                  :is-mobile="isMobile"
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
                  @click="
                    openWorkOrderAggregate(row.workOrderNumber, {
                      syncRoute: false,
                    })
                  "
                >
                  {{ row.workOrderNumber }}
                </Button>
              </template>
            </Grid>
          </div>
        </div>
      </QmsPageShell>

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
            await openWorkOrderAggregate(workOrderNumber, {
              syncRoute: false,
            });
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
