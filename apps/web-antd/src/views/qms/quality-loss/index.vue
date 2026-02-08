<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsQualityLossApi } from '#/api/qms/quality-loss';
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { PERMISSION_CODES } from '@qgs/shared';
import { Button, Card, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getQualityLossList,
  getQualityLossSummary,
} from '#/api/qms/quality-loss';
import { getDeptList } from '#/api/system/dept';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData, findNameById } from '#/types';
import {
  getMergedPreferenceApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';

import LossCharts from './components/LossCharts.vue';
import LossClaimModal from './components/LossClaimModal.vue';
import LossEditModal from './components/LossEditModal.vue';
// 子组件与逻辑抽离
import LossKpiCards from './components/LossKpiCards.vue';
import { useLossStatistics } from './composables/useLossStatistics';
import { useQualityLossActions } from './composables/useQualityLossActions';
import { SOURCE_STYLE_MAP, STATUS_OPTIONS } from './constants';
import { LossSource } from './types';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const { invalidateQualityLoss } = useInvalidateQmsQueries();

const { LOSS_ANALYSIS } = PERMISSION_CODES.QMS;
const canExport = computed(() => hasAccessByCodes([LOSS_ANALYSIS.EXPORT]));
const canEdit = computed(() => hasAccessByCodes([LOSS_ANALYSIS.EDIT]));
const canDelete = computed(() => hasAccessByCodes([LOSS_ANALYSIS.DELETE]));

// ================= 状态管理 =================
const allLossData = ref<QmsQualityLossApi.QualityLossItem[]>([]);
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);
const showCharts = ref(true);
const isFirstLoad = ref(true);

// 加载偏好设置
async function loadPreferences() {
  try {
    const pref = await getMergedPreferenceApi(
      'quality-loss-charts',
      'qms:quality_loss:default_charts',
    );
    if (pref) {
      showCharts.value = pref.showCharts !== undefined ? !!pref.showCharts : true;
    }
  } catch (error) {
    console.error('Failed to load preferences', error);
  } finally {
    isFirstLoad.value = false;
  }
}

// 保存偏好设置
async function savePreferences() {
  if (isFirstLoad.value) return;
  try {
    await saveUserPreferenceApi('quality-loss-charts', {
      showCharts: showCharts.value,
    });
  } catch (error) {
    console.error('Failed to save preferences', error);
  }
}

// 监听状态变化并自动保存
watch(showCharts, () => {
  savePreferences();
});

// 统计逻辑
const { stats } = useLossStatistics(allLossData);

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
            {
              code: 'claim',
              icon: 'ant-design:solution-outlined',
              label: '索赔',
              type: 'primary',
              ghost: true,
            },
            ...(canEdit.value ? ['edit'] : []),
            ...(canDelete.value ? ['delete'] : []),
          ],
          onClick: ({ code, row }: { code: string; row: any }) => {
            if (code === 'claim') handleClaim(row);
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
        const params = {
          page: page?.currentPage,
          pageSize: page?.pageSize,
          ...form,
        };
        const result = await getQualityLossList(params);
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
  gridEvents: {
    checkboxChange: (p: any) => actions.onCheckChange(p),
    checkboxAll: (p: any) => actions.onCheckChange(p),
  },
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

const actions = useQualityLossActions(gridApi, invalidateQualityLoss);
const {
  checkedRows,
  modalVisible,
  isEditMode,
  claimModalVisible,
  currentRecord,
  handleOpenModal,
  handleEdit,
  handleClaim,
  handleDelete,
  handleBatchDelete,
} = actions;

async function loadInitialData() {
  try {
    const deptData = await getDeptList();
    deptRawData.value = deptData;
    deptTreeData.value = convertToTreeSelectData(deptData);
  } catch (error) {
    console.error('Failed to load departments', error);
  }
}

// ================= 初始加载与联动 =================
onMounted(async () => {
  await loadInitialData();
  await loadPreferences();
  fetchSummaryData();
});

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
      <LossCharts v-if="showCharts" :data="allLossData" :departments="deptRawData" />

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
              <Button shape="round" @click="showCharts = !showCharts">
                <template #icon>
                  <IconifyIcon
                    :icon="
                      showCharts ? 'lucide:bar-chart-3' : 'lucide:bar-chart-3'
                    "
                  />
                </template>
                {{
                  showCharts ? t('common.hideChart') : t('common.showChart')
                }}
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

    <!-- 索赔库单打印组件 -->
    <LossClaimModal
      v-model:open="claimModalVisible"
      :initial-data="currentRecord"
    />
  </Page>
</template>

<style scoped>
:deep(.ant-card-head) {
  border-bottom: 1px solid #f0f0f0;
}
</style>
