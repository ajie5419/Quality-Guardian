<script lang="ts" setup>
import type { WorkOrderFormValues } from './data';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode, VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watchEffect } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  Button,
  Card,
  message,
  Modal,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteWorkOrders,
  deleteWorkOrder,
  getWorkOrderList,
} from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData, findNameById } from '#/types';

import WorkOrderCharts from './components/WorkOrderCharts.vue';
import WorkOrderEditModal from './components/WorkOrderEditModal.vue';
import { useWorkOrderImport } from './composables/useWorkOrderImport';
import { getStatusInfo } from './composables/useWorkOrderStatus';
import { getGridColumns } from './data';

// 1. 基础状态
const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const { invalidateWorkOrders } = useInvalidateQmsQueries();

const canCreate = computed(() => hasAccessByCodes(['QMS:WorkOrder:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:WorkOrder:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:WorkOrder:Delete']));
const canExport = computed(() => hasAccessByCodes(['QMS:WorkOrder:Export']));

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
    console.error('Dept load error', error);
  } finally {
    isDeptLoading.value = false;
  }
};
onMounted(loadDeptTree);

// 3. 工单数据与统计逻辑 (动态年份)
const allWorkOrders = ref<
  Array<{ division: string; quantity: number; status: string }>
>([]); // 存储全量统计概要
const isStatsLoading = ref(false);
const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('qms.common.unit.year')}`,
    value: y,
  }));
});

// 4. Grid API 引用（提前声明，用于 handleImport 回调）
const gridApi = ref<ReturnType<typeof useVbenVxeGrid>[1]>();

// 5. 导入功能（使用 gridApi 引用）
const { handleImport } = useWorkOrderImport(() => {
  gridApi.value?.reload();
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
    import: true,
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
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  proxyConfig: {
    ajax: {
      query: async (
        {
          page: pageParams,
        }: { page?: { currentPage?: number; pageSize?: number } },
        formValues: WorkOrderFormValues,
      ) => {
        try {
          const { currentPage = 1, pageSize = 20 } = pageParams || {};
          isStatsLoading.value = true;

          // 向后端发送分页与过滤参数
          const response = await getWorkOrderList({
            year: currentYear.value,
            page: currentPage,
            pageSize,
            ...formValues,
          });

          const { items, total, summary } = response;

          // 关键修复：将全量概要数据交给 dashboard 计算
          allWorkOrders.value = summary || [];

          return {
            items,
            total,
          };
        } catch (error: unknown) {
          console.error('Get work order list error:', error);
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
        const formValues = params.form as WorkOrderFormValues;
        try {
          const response = await getWorkOrderList({
            year: currentYear.value,
            ...formValues,
          });
          return { items: response.items };
        } catch (error) {
          console.error('Query all work orders error:', error);
          message.error(t('qms.common.dataLoadFailed'));
          return { items: [] };
        }
      },
    },
  },
}));

// ...

const checkedRows = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records as unknown as QmsWorkOrderApi.WorkOrderItem[];
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

// 使用 useVbenVxeGrid 并更新 gridApi 引用
const [Grid, api] = useVbenVxeGrid({
  gridOptions: gridOptions.value,
  gridEvents,
});

// 更新之前声明的 gridApi 引用
watchEffect(() => {
  gridApi.value = api;
});

// 6. 业务操作
const editModalRef = ref<InstanceType<typeof WorkOrderEditModal> | null>(null);
const showDashboard = ref(true);

function handleAdd() {
  if (editModalRef.value) {
    editModalRef.value.open({ record: null, deptData: deptTreeData.value });
  } else {
    message.warning(t('qms.common.loading'));
  }
}

function handleEdit(row: QmsWorkOrderApi.WorkOrderItem) {
  if (editModalRef.value) {
    editModalRef.value.open({ record: row, deptData: deptTreeData.value });
  }
}

function handleSuccess() {
  invalidateWorkOrders();
  gridApi.value?.reload();
}

function handleDelete(row: QmsWorkOrderApi.WorkOrderItem) {
  Modal.confirm({
    title: t('qms.common.confirmDelete'),
    content: `${t('qms.common.confirmDeleteContent')} ${row.workOrderNumber}?`,
    onOk: async () => {
      try {
        // 类型安全：后端使用 workOrderNumber 作为主键
        await deleteWorkOrder(row.workOrderNumber);
        message.success(t('qms.common.deleteSuccess'));
        handleSuccess();
      } catch {
        message.error(t('qms.common.deleteFailed'));
      }
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) {
    return;
  }
  Modal.confirm({
    title: t('qms.common.confirmBatchDelete'),
    content: t('qms.common.confirmBatchDeleteContent', {
      count: checkedRows.value.length,
    }),
    onOk: async () => {
      try {
        // 类型安全：后端使用 workOrderNumber 作为主键
        const ids = checkedRows.value.map(
          (r: QmsWorkOrderApi.WorkOrderItem) => r.workOrderNumber,
        );
        const res = await batchDeleteWorkOrders(ids);
        message.success(
          t('qms.common.deleteSuccessCount', { count: res.successCount }),
        );
        checkedRows.value = [];
        handleSuccess();
      } catch {
        message.error(t('qms.common.deleteFailed'));
      }
    },
  });
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 p-4">
      <!-- 数字化仪表盘 -->
      <WorkOrderCharts
        v-if="showDashboard"
        :summary-data="allWorkOrders"
        :dept-data="deptRawData"
        :loading="isStatsLoading || isDeptLoading"
      />

      <!-- 表格区域 -->
      <Card
        size="small"
        :bordered="false"
        class="shadow-sm"
        :title="t('qms.workOrder.title')"
      >
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
                  >{{ t('qms.inspection.records.statsYear') }}:</span
                >
                <Select
                  v-model:value="currentYear"
                  :options="yearOptions"
                  size="small"
                  class="w-[100px]"
                  @change="() => gridApi && gridApi.reload()"
                />
              </div>
            </Space>
          </template>

          <template #status="{ row }">
            <Tag :color="getStatusInfo(row.status).color">
              {{
                getStatusInfo(row.status).textKey
                  ? t(getStatusInfo(row.status).textKey)
                  : row.status
              }}
            </Tag>
          </template>
        </Grid>
      </Card>
    </div>

    <WorkOrderEditModal ref="editModalRef" @success="handleSuccess" />
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
