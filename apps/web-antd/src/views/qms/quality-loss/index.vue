<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode, VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, Card, message, Modal, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { QualityLossStatusEnum } from '#/api/qms/enums';
import {
  batchDeleteQualityLoss,
  deleteQualityLoss,
  getQualityLossList,
  getQualityLossSummary,
} from '#/api/qms/quality-loss';
import { getDeptList } from '#/api/system/dept';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData, findNameById } from '#/types';

import LossCharts from './components/LossCharts.vue';
import LossEditModal from './components/LossEditModal.vue';
// 子组件与逻辑抽离
import LossKpiCards from './components/LossKpiCards.vue';
import { useLossStatistics } from './composables/useLossStatistics';
import { SOURCE_STYLE_MAP, STATUS_OPTIONS } from './constants';
import { LossSource } from './types';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const { invalidateQualityLoss } = useInvalidateQmsQueries();

const canExport = computed(() => hasAccessByCodes(['QMS:LossAnalysis:Export']));
const canEdit = computed(() => hasAccessByCodes(['QMS:LossAnalysis:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:LossAnalysis:Delete']));

// ================= 状态管理 =================
const allLossData = ref<QmsQualityLossApi.QualityLossItem[]>([]);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);

// 统计逻辑
const { stats } = useLossStatistics(allLossData);

const checkedRows = ref<any[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records;
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

// ================= 表格配置 =================
const gridOptions = computed<VxeGridProps>(() => ({
  checkboxConfig: {
    reserve: true,
    highlight: true,
    range: true,
  },
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    export: canExport.value,
    search: true,
    zoom: true,
    refresh: true,
    custom: true,
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
    { type: 'checkbox', width: 50, fixed: 'left' },
    { type: 'seq', title: t('common.seq'), width: 60, fixed: 'left' },
    {
      field: 'lossSource',
      title: t('qms.qualityLoss.source.label'),
      width: 100,
      slots: { default: 'lossSource' },
    },
    {
      field: 'workOrderNumber',
      title: t('qms.workOrder.workOrderNumber'),
      width: 120,
    },
    {
      field: 'projectName',
      title: t('qms.workOrder.projectName'),
      minWidth: 150,
    },
    {
      field: 'partName',
      title: t('qms.inspection.issues.partName'),
      minWidth: 150,
    },
    { field: 'date', title: t('qms.inspection.issues.reportDate'), width: 120 },
    {
      field: 'amount',
      title: t('qms.inspection.issues.lossAmount'),
      width: 130,
      formatter: ({ cellValue }) => `¥${Number(cellValue).toLocaleString()}`,
    },
    {
      field: 'actualClaim',
      title: t('qms.qualityLoss.actualClaim'),
      width: 130,
      formatter: ({ cellValue }) =>
        `¥${Number(cellValue || 0).toLocaleString()}`,
    },
    {
      field: 'responsibleDepartment',
      title: t('qms.inspection.issues.responsibleDepartment'),
      width: 140,
      formatter: ({ cellValue }) => {
        if (!cellValue) return '';
        return findNameById(deptRawData.value, cellValue) || cellValue;
      },
    },
    {
      field: 'status',
      title: t('common.status'),
      width: 100,
      slots: { default: 'status' },
    },
    {
      title: t('common.action'),
      width: 130,
      fixed: 'right',
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
    },
  ],
  proxyConfig: {
    ajax: {
      query: async ({ page, form }) => {
        // 服务端分页：将分页参数和搜索表单同步传给后端
        const params = {
          page: page?.currentPage,
          pageSize: page?.pageSize,
          ...form,
        };
        const result = await getQualityLossList(params);

        // 注意：这里不再设置 allLossData，因为分页后的数据不适合做全量统计
        return result;
      },
    },
  },
}));

/**
 * 获取统计和图表所需的汇总数据（解耦分页）
 */
async function fetchSummaryData(filters: any = {}) {
  try {
    const data = await getQualityLossSummary(filters);
    allLossData.value = data;
  } catch (error) {
    console.error('Failed to fetch summary data', error);
  }
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions as any,
  gridEvents,
  formOptions: {
    schema: [
      {
        fieldName: 'workOrderNumber',
        label: t('qms.workOrder.workOrderNumber'),
        component: 'Input',
        colProps: { span: 6 },
      },
      {
        fieldName: 'lossSource',
        label: t('qms.qualityLoss.source.label'),
        component: 'Select',
        componentProps: {
          options: [
            { label: t('common.all'), value: '' },
            {
              label: t('qms.qualityLoss.source.manual'),
              value: LossSource.MANUAL,
            },
            {
              label: t('qms.qualityLoss.source.internal'),
              value: LossSource.INTERNAL,
            },
            {
              label: t('qms.qualityLoss.source.external'),
              value: LossSource.EXTERNAL,
            },
          ],
        },
        colProps: { span: 6 },
      },
      {
        fieldName: 'status',
        label: t('common.status'),
        component: 'Select',
        componentProps: {
          options: STATUS_OPTIONS,
        },
        colProps: { span: 6 },
      },
    ],
    submitOnChange: true,
    submitButtonOptions: {
      onClick: ({ formModel }: any) => {
        // 点击搜索时，重新拉取统计数据
        fetchSummaryData(formModel);
      },
    },
    resetButtonOptions: {
      onClick: () => {
        fetchSummaryData();
      },
    },
  },
} as any);

// ================= 初始加载与联动 =================
onMounted(async () => {
  await loadInitialData();
  fetchSummaryData(); // 初始拉取统计数据
});

// ================= 弹窗表单逻辑 =================
const modalVisible = ref(false);
const isEditMode = ref(false);
const currentRecord = ref<Partial<QmsQualityLossApi.QualityLossItem>>({});

async function loadInitialData() {
  try {
    const deptData = await getDeptList();
    deptRawData.value = deptData;
    deptTreeData.value = convertToTreeSelectData(deptData);
  } catch (error) {
    console.error('Failed to load departments', error);
  }
}

onMounted(() => loadInitialData());

function handleOpenModal() {
  isEditMode.value = false;
  currentRecord.value = {
    actualClaim: 0,
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: '',
    responsibleDepartment: undefined,
    status: QualityLossStatusEnum.PENDING,
    type: 'Scrap',
    lossSource: LossSource.MANUAL,
  };
  modalVisible.value = true;
}

function handleEdit(row: QmsQualityLossApi.QualityLossItem) {
  isEditMode.value = true;
  currentRecord.value = { ...row };
  modalVisible.value = true;
}

async function handleDelete(row: QmsQualityLossApi.QualityLossItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk: async () => {
      await deleteQualityLoss(row.id);
      message.success(t('common.deleteSuccess'));
      invalidateQualityLoss();
      gridApi.reload();
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) {
    return;
  }
  // Optional: check if selection contains non-manual records
  const hasAutoRecords = checkedRows.value.some(
    (r) => r.lossSource !== LossSource.MANUAL,
  );
  if (hasAutoRecords) {
    message.warning('只能批量删除手动录入的损失记录');
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
        const res = await batchDeleteQualityLoss(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        checkedRows.value = [];
        invalidateQualityLoss();
        gridApi.reload();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

// 辅助函数
function getStatusConfig(s: string) {
  return (
    STATUS_OPTIONS.find((o) => o.value === s) || { label: s, color: 'default' }
  );
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4 bg-gray-50/50 p-4">
      <!-- 1. KPI 核心指标卡片 -->
      <LossKpiCards :stats="stats" />

      <!-- 2. 分析图表区 -->
      <LossCharts :data="allLossData" :departments="deptRawData" />

      <!-- 3. 明细列表区 -->
      <Card :bordered="false" class="shadow-sm">
        <Grid>
          <!-- 状态列 -->
          <template #status="{ row }">
            <Tag :color="getStatusConfig(row.status).color">
              {{ t(getStatusConfig(row.status).label) }}
            </Tag>
          </template>

          <!-- 来源列 -->
          <template #lossSource="{ row }">
            <Tag :color="SOURCE_STYLE_MAP[row.lossSource as LossSource]?.color">
              {{
                t(
                  SOURCE_STYLE_MAP[row.lossSource as LossSource]?.labelKey ||
                    row.lossSource,
                )
              }}
            </Tag>
          </template>

          <!-- 工具栏 -->
          <template #toolbar-actions>
            <Space>
              <Button
                v-access:code="'QMS:LossAnalysis:Create'"
                type="primary"
                @click="handleOpenModal"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                新增损失录入
              </Button>
              <Button
                v-if="checkedRows.length > 0 && canDelete"
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
        </Grid>
      </Card>
    </div>

    <!-- 录入/编辑弹窗组件 -->
    <LossEditModal
      v-model:open="modalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="currentRecord"
      :dept-tree-data="deptTreeData"
      @success="gridApi.reload()"
    />
  </Page>
</template>

<style scoped>
:deep(.ant-card-head) {
  border-bottom: 1px solid #f0f0f0;
}
</style>
