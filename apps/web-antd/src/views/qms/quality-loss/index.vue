<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode } from '#/types';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, Card, message, Modal, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { QualityLossStatusEnum } from '#/api/qms/enums';
import { deleteQualityLoss, getQualityLossList } from '#/api/qms/quality-loss';
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
const { invalidateQualityLoss } = useInvalidateQmsQueries();

// ================= 状态管理 =================
const allLossData = ref<QmsQualityLossApi.QualityLossItem[]>([]);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);

// 统计逻辑
const { stats } = useLossStatistics(allLossData);

// ================= 表格配置 =================
const gridOptions: VxeGridProps = {
  toolbarConfig: {
    slots: { buttons: 'toolbar-actions' },
    export: true,
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
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
      slots: { default: 'action' },
    },
  ],
  proxyConfig: {
    ajax: {
      query: async ({ page }) => {
        const data = await getQualityLossList();
        allLossData.value = data;
        const { currentPage = 1, pageSize = 20 } = page || {};
        const start = (currentPage - 1) * pageSize;
        return {
          items: data.slice(start, start + pageSize),
          total: data.length,
        };
      },
    },
  },
};

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions });

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
      <Card title="质量损失明细清单" :bordered="false" class="shadow-sm">
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
            <Button
              v-access:code="'QMS:LossAnalysis:Create'"
              type="primary"
              @click="handleOpenModal"
            >
              新增损失录入
            </Button>
          </template>

          <!-- 操作列 -->
          <template #action="{ row }">
            <Button
              v-access:code="'QMS:LossAnalysis:Edit'"
              type="link"
              size="small"
              @click="handleEdit(row)"
            >
              {{ t('common.edit') }}
            </Button>
            <Button
              v-access:code="'QMS:LossAnalysis:Delete'"
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
