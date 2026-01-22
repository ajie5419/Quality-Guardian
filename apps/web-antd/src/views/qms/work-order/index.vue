<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { TreeSelectNode } from '#/types';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import {
  Button,
  Card,
  Col,
  Empty,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Statistic,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { WorkOrderStatusEnum } from '#/api/qms/enums';
import {
  batchDeleteWorkOrders,
  deleteWorkOrder,
  getWorkOrderList,
} from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData, findNameById } from '#/types';

import WorkOrderEditModal from './components/WorkOrderEditModal.vue';
import { WORK_ORDER_STATUS_UI_MAP } from './constants';
import { getGridColumns } from './data';

// 1. 基础状态
const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const { invalidateWorkOrders } = useInvalidateQmsQueries();

const canCreate = computed(() => hasAccessByCodes(['QMS:WorkOrder:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:WorkOrder:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:WorkOrder:Delete']));
const canExport = computed(() => hasAccessByCodes(['QMS:WorkOrder:Export']));

const getStatusInfo = (s: string) => {
  const status = s || WorkOrderStatusEnum.PENDING;
  return (
    WORK_ORDER_STATUS_UI_MAP[status] || {
      color: 'default',
      textKey: '',
      defaultText: s,
    }
  );
};

// 2. 部门树数据
const deptTreeData = ref<TreeSelectNode[]>([]);
const deptRawData = ref<any[]>([]);
const loadDeptTree = async () => {
  try {
    const data = await getDeptList();
    deptRawData.value = data;
    deptTreeData.value = convertToTreeSelectData(data);
  } catch (error) {
    console.error('Dept load error', error);
  }
};
onMounted(loadDeptTree);

// 3. 工单数据与统计逻辑 (动态年份)
const allWorkOrders = ref<any[]>([]); // 存储全量统计概要
const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

const dashboardStats = computed(() => {
  const data = allWorkOrders.value || [];

  const stats = {
    total: 0,
    inProgress: 0,
    completed: 0,
    divisionProjectMap: {} as Record<string, number>,
    divisionQuantityMap: {} as Record<string, number>,
  };

  for (const item of data) {
    stats.total++;
    const s = String(item.status).toUpperCase();
    if (s === 'IN_PROGRESS' || s === '进行中') stats.inProgress++;
    if (s === 'COMPLETED' || s === '已完成') stats.completed++;

    const rawDiv = String(item.division || '其他').trim();
    const divName = findNameById(deptRawData.value, rawDiv) || rawDiv;

    stats.divisionProjectMap[divName] =
      (stats.divisionProjectMap[divName] || 0) + 1;
    stats.divisionQuantityMap[divName] =
      (stats.divisionQuantityMap[divName] || 0) + (Number(item.quantity) || 0);
  }

  const progressPercent =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const pieData = Object.entries(stats.divisionProjectMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const rankings = Object.entries(stats.divisionQuantityMap)
    .map(([division, totalQuantity]) => ({ division, totalQuantity }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  return {
    ...stats,
    progressPercent,
    pieData,
    rankings,
  };
});

// 4. ECharts 饼图逻辑
const pieChartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(pieChartRef);

const pieChartOptions = computed(() => ({
  tooltip: {
    trigger: 'item' as const,
    formatter: `{b}: {c}${t('common.unit.project')} ({d}%)`,
    confine: true,
  },
  legend: {
    orient: 'horizontal' as const,
    bottom: '0',
    left: 'center',
    itemWidth: 10,
    itemHeight: 10,
    textStyle: { fontSize: 11, color: '#666' },
    type: 'scroll' as const,
  },
  series: [
    {
      name: t('qms.workOrder.divisionRatio'),
      type: 'pie' as const,
      radius: ['55%', '75%'],
      center: ['50%', '40%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold',
          formatter: '{b}\n{d}%',
        },
      },
      data: dashboardStats.value.pieData,
    },
  ],
}));

watch(
  () => dashboardStats.value.pieData,
  (newData) => {
    if (newData.length > 0) {
      nextTick(() => {
        renderEcharts(pieChartOptions.value as any);
      });
    }
  },
  { deep: true },
);

// 5. Grid 表格配置
const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    { type: 'checkbox', width: 50 },
    ...(getGridColumns() as any[]).map((col) => {
      // 关键修复：通过 formatter 实现事业部名称的响应式转换
      if (col.field === 'division') {
        return {
          ...col,
          slots: {}, // 禁用 slot，改用更稳定的 formatter
          formatter: ({ cellValue }: { cellValue: any }) => {
            return (
              findNameById(deptRawData.value, cellValue) || cellValue || '-'
            );
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
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  importConfig: {
    remote: true,
    importMethod: async ({ file }: { file: File }) => {
      const { requestClient } = await import('#/api/request');
      const XLSX = await import('xlsx');

      try {
        const arrayBuffer = await file.arrayBuffer();
        // 1. 开启 cellDates 确保日期被解析为 Date 对象，避免序列号问题
        const workbook = XLSX.read(arrayBuffer, {
          type: 'array',
          cellDates: true,
        });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          message.warning(t('common.noData'));
          return;
        }
        const worksheet = workbook.Sheets[sheetName]!;
        const results = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (!results || results.length === 0) {
          message.warning(t('common.noData'));
          return;
        }

        // 2. 定义增强的映射逻辑（同义词 + 类型转换）
        const fieldMap: Record<string, string[]> = {
          customerName: ['客户名称', '客户', 'Customer'],
          deliveryDate: ['交货日期', '计划交期', '交货时间', 'Delivery Date'],
          division: ['事业部', '部门', 'Division'],
          effectiveTime: [
            '生效日期',
            '合同生效日期',
            '生效时间',
            'Effective Date',
          ],
          projectName: ['项目名称', '项目', 'Project Name'],
          quantity: ['数量', '工单数量', 'Quantity'],
          status: ['状态', '工单状态', 'Status'],
          workOrderNumber: ['工单号', '工单编号', 'Work Order Number'],
        };

        const statusValueMap: Record<string, string> = {
          已取消: 'CANCELLED',
          已完成: 'COMPLETED',
          进行中: 'IN_PROGRESS',
          处理中: 'IN_PROGRESS',
          未开始: 'OPEN',
          待处理: 'OPEN',
        };

        const mappedItems = results.map((row: any) => {
          const item: Record<string, any> = {};

          Object.keys(fieldMap).forEach((field) => {
            const possibleHeaders = fieldMap[field]!;
            const excelKey = Object.keys(row).find((k) =>
              possibleHeaders.some(
                (h) =>
                  String(k).replaceAll(/\s+/g, '') ===
                  String(h).replaceAll(/\s+/g, ''),
              ),
            );

            if (excelKey !== undefined) {
              let val = row[excelKey];

              // 日期对象转 YYYY-MM-DD
              if (val instanceof Date) {
                const y = val.getFullYear();
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const d = String(val.getDate()).padStart(2, '0');
                val = `${y}-${m}-${d}`;
              }

              // 状态值转换
              if (field === 'status' && typeof val === 'string') {
                const mappedStatus = statusValueMap[val.trim()];
                if (mappedStatus) val = mappedStatus;
              }

              item[field] = val;
            }
          });
          return item;
        });

        // 3. 发送 JSON 数据
        const res = await requestClient.post(
          '/qms/work-order/import',
          {
            items: mappedItems,
          },
          { timeout: 120_000 },
        );

        if (res.successCount > 0) {
          message.success(
            t('common.importSuccessCount', { count: res.successCount }),
          );
          gridApi.reload();
        } else {
          message.error(t('common.importFailed'));
        }
      } catch (error: any) {
        console.error('Import Error:', error);
        message.error(t('common.importFailed'));
      }
    },
  },
  exportConfig: {
    remote: true,
    types: ['xlsx', 'csv'],
  },
  proxyConfig: {
    ajax: {
      query: async (
        {
          page: pageParams,
        }: { page?: { currentPage?: number; pageSize?: number } },
        formValues: Record<string, any>,
      ) => {
        const { currentPage = 1, pageSize = 20 } = pageParams || {};

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
      },
      queryAll: async ({ formValues }: any) => {
        const response = await getWorkOrderList({
          year: currentYear.value,
          ...formValues,
        });
        return { items: response.items };
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions as any,
  formOptions: {
    schema: [
      {
        fieldName: 'workOrderNumber',
        label: t('qms.workOrder.workOrderNumber'),
        component: 'Input',
        colProps: { span: 6 },
      },
      {
        fieldName: 'projectName',
        label: t('qms.workOrder.projectName'),
        component: 'Input',
        colProps: { span: 6 },
      },
      {
        fieldName: 'status',
        label: t('common.status'),
        component: 'Select',
        colProps: { span: 4 },
        componentProps: {
          options: [
            { label: t('common.all'), value: '' },
            {
              label: t('qms.workOrder.status.pending'),
              value: WorkOrderStatusEnum.PENDING,
            },
            {
              label: t('qms.workOrder.status.inProgress'),
              value: WorkOrderStatusEnum.IN_PROGRESS,
            },
            {
              label: t('qms.workOrder.status.completed'),
              value: WorkOrderStatusEnum.COMPLETED,
            },
          ],
        },
      },
    ],
    submitOnChange: true,
  },
} as any);

// 6. 业务操作
const editModalRef = ref<any>(null);
const showDashboard = ref(true);

function handleAdd() {
  if (editModalRef.value) {
    editModalRef.value.open(null, deptTreeData.value);
  } else {
    message.warning(t('common.loading'));
  }
}

function handleEdit(row: QmsWorkOrderApi.WorkOrderItem) {
  if (editModalRef.value) {
    editModalRef.value.open(row, deptTreeData.value);
  }
}

function handleSuccess() {
  invalidateWorkOrders();
  gridApi.reload();
}

function handleDelete(row: QmsWorkOrderApi.WorkOrderItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: `${t('common.confirmDeleteContent')} ${row.workOrderNumber}?`,
    onOk: async () => {
      try {
        await deleteWorkOrder(row.id);
        message.success(t('common.deleteSuccess'));
        handleSuccess();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

function handleBatchDelete() {
  const records = gridApi.grid.getCheckboxRecords();
  if (records.length === 0) {
    message.warning(t('common.pleaseSelectData'));
    return;
  }
  Modal.confirm({
    title: t('common.confirmBatchDelete'),
    content: t('common.confirmBatchDeleteContent', { count: records.length }),
    onOk: async () => {
      try {
        const ids = records.map((r: any) => r.id);
        const res = await batchDeleteWorkOrders(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        handleSuccess();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 p-4">
      <!-- 数字化仪表盘 -->
      <Row v-show="showDashboard" :gutter="16">
        <Col :span="8">
          <Card
            :title="t('qms.workOrder.divisionRatio')"
            size="small"
            class="h-full shadow-sm"
          >
            <div class="relative flex h-[300px] items-center justify-center">
              <EchartsUI
                v-show="dashboardStats.pieData.length > 0"
                ref="pieChartRef"
                class="h-full w-full"
              />
              <Empty
                v-if="dashboardStats.pieData.length === 0"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
                :description="t('common.noData')"
              />
            </div>
          </Card>
        </Col>

        <Col :span="10">
          <Card
            :title="t('qms.workOrder.outputRanking')"
            size="small"
            class="h-full shadow-sm"
          >
            <div class="custom-scrollbar h-[300px] overflow-y-auto pr-2">
              <div class="space-y-1.5 py-1">
                <div
                  v-for="(rank, idx) in dashboardStats.rankings"
                  :key="rank.division"
                  class="group flex items-center justify-between rounded-lg border-b border-gray-50 p-2.5 transition-all hover:bg-blue-50/30"
                >
                  <div class="flex items-center gap-4">
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold shadow-sm"
                      :class="[
                        idx === 0 ? 'bg-yellow-400 text-white' : '',
                        idx === 1 ? 'bg-slate-300 text-white' : '',
                        idx === 2 ? 'bg-orange-300 text-white' : '',
                        idx > 2 ? 'bg-gray-100 text-gray-400' : '',
                      ]"
                    >
                      {{ idx + 1 }}
                    </div>
                    <span class="text-sm font-bold text-gray-700">{{
                      rank.division
                    }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] text-gray-400">{{
                      t('qms.workOrder.totalOutput')
                    }}</span>
                    <span class="font-mono text-base font-bold text-blue-600">{{
                      rank.totalQuantity
                    }}</span>
                    <span class="text-[11px] text-gray-400">{{
                      t('common.unit.piece')
                    }}</span>
                  </div>
                </div>
              </div>
              <Empty
                v-if="dashboardStats.rankings.length === 0"
                :image="Empty.PRESENTED_IMAGE_SIMPLE"
              />
            </div>
          </Card>
        </Col>

        <Col :span="6">
          <Card
            :title="t('qms.workOrder.executionOverview')"
            size="small"
            class="h-full shadow-sm"
          >
            <div class="flex h-[300px] flex-col justify-between py-2">
              <Row :gutter="8">
                <Col :span="8">
                  <Statistic
                    :title="t('qms.workOrder.totalProjects')"
                    :value="dashboardStats.total"
                  />
                </Col>
                <Col :span="8">
                  <Statistic
                    :title="t('qms.workOrder.manufacturing')"
                    :value="dashboardStats.inProgress"
                    :value-style="{ color: '#1890ff' }"
                  />
                </Col>
                <Col :span="8">
                  <Statistic
                    :title="t('qms.workOrder.completedOnly')"
                    :value="dashboardStats.completed"
                    :value-style="{ color: '#52c41a' }"
                  />
                </Col>
              </Row>
              <div class="mt-4">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="font-medium text-gray-400">{{
                    t('qms.workOrder.completionRate')
                  }}</span>
                  <span class="font-bold text-green-600">
                    {{ dashboardStats.completed }} / {{ dashboardStats.total }}
                  </span>
                </div>
                <Progress
                  :percent="dashboardStats.progressPercent"
                  stroke-color="#52c41a"
                  :stroke-width="12"
                  status="active"
                />
              </div>
              <div
                class="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 p-3"
              >
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600"
                >
                  <span class="i-lucide-activity text-xl"></span>
                </div>
                <div>
                  <div class="text-[10px] uppercase text-gray-400">
                    {{ t('qms.workspace.taskStats.closureRate') }}
                  </div>
                  <div class="text-xs font-bold text-blue-800">
                    {{ t('qms.workOrder.excellent') }}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

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
            <Button v-if="canCreate" type="primary" @click="handleAdd">
              <span class="i-lucide-plus mr-1"></span>
              {{ t('qms.workOrder.createWorkOrder') }}
            </Button>
            <Button
              v-if="canDelete"
              class="ml-2"
              danger
              @click="handleBatchDelete"
            >
              <span class="i-lucide-trash-2 mr-1"></span>
              {{ t('common.batchDelete') }}
            </Button>
            <Button class="ml-2" @click="showDashboard = !showDashboard">
              <span
                :class="
                  showDashboard
                    ? 'i-lucide-layout-panel-top'
                    : 'i-lucide-layout-panel-off'
                "
                class="mr-1"
              ></span>
              {{ showDashboard ? '隐藏图表' : '显示图表' }}
            </Button>
            <div class="ml-4 flex items-center gap-2">
              <span class="text-xs text-gray-500"
                >{{ t('qms.inspection.records.statsYear') }}:</span
              >
              <Select
                v-model:value="currentYear"
                :options="yearOptions"
                size="small"
                class="w-[100px]"
                @change="() => gridApi.reload()"
              />
            </div>
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

          <template #action="{ row }">
            <Button
              v-if="canEdit"
              type="link"
              size="small"
              @click="handleEdit(row)"
            >
              {{ t('common.edit') }}
            </Button>
            <Button
              v-if="canDelete"
              type="link"
              size="small"
              danger
              @click="handleDelete(row)"
            >
              {{ t('common.delete') }}
            </Button>
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
