<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { TreeSelectNode } from '#/types';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

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
  Space,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { deleteWorkOrder, getWorkOrderList } from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import { WorkOrderStatusEnum } from '#/api/qms/enums';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData, findNameById } from '#/types';

import WorkOrderEditModal from './components/WorkOrderEditModal.vue';
import { WORK_ORDER_STATUS_UI_MAP } from './constants';
import { getGridColumns } from './data';

// 1. 基础状态
const { t } = useI18n();
const { invalidateWorkOrders } = useInvalidateQmsQueries();

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
  return dynamicYears.value.map(y => ({ label: `${y}${t('common.unit.year')}`, value: y }));
});

const dashboardStats = computed(() => {
  const data = allWorkOrders.value || [];
  
  const stats = data.reduce(
    (acc, item) => {
      acc.total++;
      const s = String(item.status).toUpperCase();
      if (s === 'IN_PROGRESS' || s === '进行中') acc.inProgress++;
      if (s === 'COMPLETED' || s === '已完成') acc.completed++;

      const rawDiv = String(item.division || '其他').trim();
      const divName = findNameById(deptRawData.value, rawDiv) || rawDiv;
      
      acc.divisionProjectMap[divName] = (acc.divisionProjectMap[divName] || 0) + 1;
      acc.divisionQuantityMap[divName] = (acc.divisionQuantityMap[divName] || 0) + (Number(item.quantity) || 0);
      
      return acc;
    },
    { 
      total: 0, 
      inProgress: 0, 
      completed: 0, 
      divisionProjectMap: {} as Record<string, number>,
      divisionQuantityMap: {} as Record<string, number>
    }
  );

  const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

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
  columns: getGridColumns().map((col) => {
    // 关键修复：通过 formatter 实现事业部名称的响应式转换
    if (col.field === 'division') {
      return {
        ...col,
        slots: {}, // 禁用 slot，改用更稳定的 formatter
        formatter: ({ cellValue }) => {
          return findNameById(deptRawData.value, cellValue) || cellValue || '-';
        },
      };
    }
    return col;
  }),
  toolbarConfig: {
    export: true,
    refresh: true,
    slots: {
      buttons: 'toolbar-actions',
    },
  },
  exportConfig: {
    remote: true,
    types: ['xlsx', 'csv'],
  },
  proxyConfig: {
    ajax: {
      query: async (
        { page: pageParams }: { page?: { currentPage?: number; pageSize?: number } },
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
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions,
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
            { label: t('qms.workOrder.status.pending'), value: WorkOrderStatusEnum.PENDING },
            { label: t('qms.workOrder.status.inProgress'), value: WorkOrderStatusEnum.IN_PROGRESS },
            { label: t('qms.workOrder.status.completed'), value: WorkOrderStatusEnum.COMPLETED },
          ],
        },
      },
    ],
    submitOnChange: true,
  },
});

// 6. 业务操作
const editModalRef = ref<any>(null);

function handleAdd() {
  console.log('WorkOrder: handleAdd clicked');
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
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 p-4">
      <!-- 数字化仪表盘 -->
      <Row :gutter="16">
        <Col :span="8">
          <Card :title="t('qms.workOrder.divisionRatio')" size="small" class="h-full shadow-sm">
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
          <Card :title="t('qms.workOrder.outputRanking')" size="small" class="h-full shadow-sm">
            <div class="h-[300px] overflow-y-auto pr-2 custom-scrollbar">
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
                        idx > 2 ? 'bg-gray-100 text-gray-400' : ''
                      ]"
                    >
                      {{ idx + 1 }}
                    </div>
                    <span class="text-sm font-bold text-gray-700">{{ rank.division }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] text-gray-400">{{ t('qms.workOrder.totalOutput') }}</span>
                    <span class="font-mono text-base font-bold text-blue-600">{{ rank.totalQuantity }}</span>
                    <span class="text-[11px] text-gray-400">{{ t('common.unit.piece') }}</span>
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
          <Card :title="t('qms.workOrder.executionOverview')" size="small" class="h-full shadow-sm">
            <div class="flex h-[300px] flex-col justify-between py-2">
              <Row :gutter="8">
                <Col :span="8">
                  <Statistic :title="t('qms.workOrder.totalProjects')" :value="dashboardStats.total" />
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
                  <span class="font-medium text-gray-400">{{ t('qms.workOrder.completionRate') }}</span>
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
              <div class="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 p-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
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
      <Card size="small" :bordered="false" class="shadow-sm" :title="t('qms.workOrder.title')">
        <template #extra>
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                  <span class="text-gray-500 text-xs">{{ t('qms.inspection.records.statsYear') }}:</span>
                  <Select
                    v-model:value="currentYear"
                    :options="yearOptions"
                    size="small"
                    class="w-[100px]"
                    @change="() => gridApi.reload()"
                  />
                </div>
                <Button type="primary" size="small" @click="handleAdd">
                    <span class="i-lucide-plus mr-1"></span> {{ t('qms.workOrder.createWorkOrder') }}
                </Button>
            </div>
        </template>

        <Grid>
          <!-- 核心修复：Toolbar 内部也保留按钮作为备份 -->
          <template #toolbar-actions>
             <Button type="primary" @click="handleAdd">
                <span class="i-lucide-plus mr-1"></span> {{ t('qms.workOrder.createWorkOrder') }}
             </Button>
          </template>
          
          <template #status="{ row }">
            <Tag :color="getStatusInfo(row.status).color">
              {{ getStatusInfo(row.status).textKey ? t(getStatusInfo(row.status).textKey) : row.status }}
            </Tag>
          </template>
          
          <template #action="{ row }">
            <Button type="link" size="small" @click="handleEdit(row)">
              {{ t('common.edit') }}
            </Button>
            <Button type="link" size="small" danger @click="handleDelete(row)">
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
