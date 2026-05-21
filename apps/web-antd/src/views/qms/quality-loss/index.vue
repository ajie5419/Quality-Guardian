<script lang="ts" setup>
import type { SystemDeptApi } from '#/api/system/dept';
import type { TreeSelectNode, VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { PERMISSION_CODES, QMS_DICTIONARY_TYPE_KEYS } from '@qgs/shared';
import { Button, Card, message, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getQualityLossExportList,
  getQualityLossList,
} from '#/api/qms/quality-loss';
import { getDeptList } from '#/api/system/dept';
import {
  getMergedPreferenceApi,
  saveSystemSettingApi,
  saveUserPreferenceApi,
} from '#/api/system/preference';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData } from '#/types';
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';
import MobilePageShell from '#/views/qms/shared/components/MobilePageShell.vue';

import { useDictionaryOptions } from '../shared/composables/useDictionaryOptions';
import LossCharts from './components/LossCharts.vue';
import LossClaimModal from './components/LossClaimModal.vue';
import LossEditModal from './components/LossEditModal.vue';
// 子组件与逻辑抽离
import LossKpiCards from './components/LossKpiCards.vue';
import { useLossOverview } from './composables/useLossOverview';
import { useQualityLossActions } from './composables/useQualityLossActions';
import { useQualityLossGrid } from './composables/useQualityLossGrid';
import {
  mapDictionaryOptionsToLossType,
  mapDictionaryOptionsToQualityLossStatus,
  SOURCE_STYLE_MAP,
} from './constants';
import { LossSource } from './types';

import './index.css';

type QualityLossItem =
  import('#/api/qms/quality-loss').QmsQualityLossApi.QualityLossItem;
type QualityLossQueryParams =
  import('#/api/qms/quality-loss').QualityLossQueryParams;
type QualityLossGridSetupOptions = Parameters<
  typeof useVbenVxeGrid<QualityLossItem>
>[0];

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { hasAccessByCodes } = useAccess();
const { isMobile } = useMobileViewport();
const { invalidateQualityLoss } = useInvalidateQmsQueries();

const { LOSS_ANALYSIS } = PERMISSION_CODES.QMS;
const canExport = computed(() => hasAccessByCodes([LOSS_ANALYSIS.EXPORT]));
const canEdit = computed(() => hasAccessByCodes([LOSS_ANALYSIS.EDIT]));
const canDelete = computed(() => hasAccessByCodes([LOSS_ANALYSIS.DELETE]));

const exportQualityLossAsXlsx = createVxePhotoXlsxExportMethod<QualityLossItem>(
  {
    sheetName: t('qms.qualityLoss.title'),
    filename: () => `${t('qms.qualityLoss.title')}-${Date.now()}.xlsx`,
    photoField: '__none__',
    getPhotoUrl: () => '',
    getRows: async ({ mode, $table, $grid }) => {
      if (mode === 'selected') {
        return $table.getCheckboxRecords() || [];
      }
      if (mode === 'all') {
        const proxyInfo = $grid?.getProxyInfo?.();
        const formValues = (proxyInfo?.form ||
          {}) as Partial<QualityLossQueryParams>;
        const response = await getQualityLossExportList(formValues);
        return response.items || [];
      }
      const tableData = $table.getTableData?.();
      return tableData?.fullData || [];
    },
  },
);

// ================= 状态管理 =================
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);
const showCharts = ref(true);
const isFirstLoad = ref(true);
const {
  options: qualityLossStatusOptions,
  loadOptions: loadQualityLossStatusDictionaryOptions,
} = useDictionaryOptions({
  dictType: QMS_DICTIONARY_TYPE_KEYS.qualityLossStatus,
  fallbackOptions: mapDictionaryOptionsToQualityLossStatus(),
  mapOptions: mapDictionaryOptionsToQualityLossStatus,
});
const {
  options: qualityLossTypeOptions,
  loadOptions: loadQualityLossTypeDictionaryOptions,
} = useDictionaryOptions({
  dictType: QMS_DICTIONARY_TYPE_KEYS.qualityLossType,
  fallbackOptions: mapDictionaryOptionsToLossType(),
  mapOptions: mapDictionaryOptionsToLossType,
});

const userStore = useUserStore();
const isAdmin = computed(() => {
  return (
    userStore.userRoles?.some((role: string) => {
      const lowerRole = role.toLowerCase();
      return lowerRole.includes('admin') || lowerRole.includes('super');
    }) || false
  );
});

// 加载偏好设置
async function loadPreferences() {
  try {
    const pref = await getMergedPreferenceApi(
      'quality-loss-charts',
      'qms:quality_loss:default_charts',
    );
    if (pref) {
      showCharts.value =
        pref.showCharts === undefined ? true : !!pref.showCharts;
    }
  } catch (error) {
    handleApiError(error, 'Load Quality Loss Preferences');
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
    handleApiError(error, 'Save Quality Loss Preferences');
  }
}

// 监听状态变化并自动保存
watch(showCharts, () => {
  if (isFirstLoad.value) return;
  savePreferences();
});

async function handleSaveSystemDefault() {
  try {
    await saveSystemSettingApi('qms:quality_loss:default_charts', {
      showCharts: showCharts.value,
    });
    message.success('已存为系统默认配置');
  } catch (error) {
    handleApiError(error, 'Save Quality Loss System Default');
    message.error('保存失败');
  }
}

const {
  chartData,
  invalidateOverviewCache,
  refreshOverview,
  selectedGranularity,
  selectedYear,
  stats,
  yearOptions,
  handleGranularityChange,
  handleYearChange,
} = useLossOverview(handleApiError);

let actionsInstance: null | ReturnType<typeof useQualityLossActions> = null;
const triggerClaim = (row: QualityLossItem) =>
  actionsInstance?.handleClaim(row);
const triggerDelete = (row: QualityLossItem) =>
  actionsInstance?.handleDelete(row);
const triggerEdit = (row: QualityLossItem) => actionsInstance?.handleEdit(row);
const handleCheckChange = (params: VxeCheckboxChangeParams<QualityLossItem>) =>
  actionsInstance?.onCheckChange(params);

const { formSchema, gridOptions, getStatusConfig } = useQualityLossGrid({
  canDelete,
  canEdit,
  canExport,
  deptRawData,
  exportQualityLossAsXlsx,
  getQualityLossList,
  handleClaim: triggerClaim,
  handleDelete: triggerDelete,
  handleEdit: triggerEdit,
  qualityLossStatusOptions,
  refreshOverview,
  t,
});

const [Grid, gridApi] = useVbenVxeGrid<QualityLossItem>({
  gridOptions: gridOptions.value,
  gridEvents: {
    checkboxChange: handleCheckChange,
    checkboxAll: handleCheckChange,
  },
  formOptions: {
    schema: formSchema.value,
    submitOnChange: true,
  },
} as unknown as QualityLossGridSetupOptions);

const onLossDataChanged = () => {
  invalidateOverviewCache();
  invalidateQualityLoss();
};

const actions = useQualityLossActions(gridApi, onLossDataChanged);
actionsInstance = actions;
const {
  checkedRows,
  modalVisible,
  isEditMode,
  claimModalVisible,
  currentRecord,
  handleOpenModal,
  handleBatchDelete,
} = actions;

async function loadInitialData() {
  try {
    const deptData = await getDeptList();
    deptRawData.value = deptData;
    deptTreeData.value = convertToTreeSelectData(deptData);
  } catch (error) {
    handleApiError(error, 'Load Quality Loss Departments');
  }
}

async function loadQualityLossStatusOptions() {
  try {
    await loadQualityLossStatusDictionaryOptions();
    gridApi.setState({
      formOptions: {
        schema: formSchema.value,
        submitOnChange: true,
      },
    });
  } catch {
    // Keep local fallback options.
  }
}

async function loadQualityLossTypeOptions() {
  await loadQualityLossTypeDictionaryOptions();
}

// ================= 初始加载与联动 =================
onMounted(async () => {
  await loadInitialData();
  await loadPreferences();
  await Promise.all([
    loadQualityLossStatusOptions(),
    loadQualityLossTypeOptions(),
  ]);
});
</script>

<template>
  <Page content-class="p-0">
    <MobilePageShell>
      <div class="flex flex-col gap-3 bg-gray-50/50 sm:gap-4">
        <!-- 1. KPI 核心指标卡片 -->
        <LossKpiCards :stats="stats" />

        <!-- 2. 分析图表区 -->
        <LossCharts
          v-if="showCharts"
          :chart-data="chartData"
          :selected-granularity="selectedGranularity"
          :selected-year="selectedYear"
          :year-options="yearOptions"
          @update:selected-granularity="handleGranularityChange"
          @update:selected-year="handleYearChange"
        />

        <!-- 3. 明细列表区 -->
        <Card :bordered="false" class="shadow-sm">
          <Grid>
            <!-- 状态列 -->
            <template #status="{ row }">
              <Tag :color="getStatusConfig(row.status).color">
                {{ getStatusConfig(row.status).label }}
              </Tag>
            </template>

            <!-- 来源列 -->
            <template #lossSource="{ row }">
              <Tag
                :color="SOURCE_STYLE_MAP[row.lossSource as LossSource]?.color"
              >
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
              <Space
                :direction="isMobile ? 'vertical' : 'horizontal'"
                :wrap="!isMobile"
              >
                <Button
                  v-access:code="'QMS:LossAnalysis:Create'"
                  type="primary"
                  :block="isMobile"
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
                  :block="isMobile"
                  @click="handleBatchDelete"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:trash-2" />
                  </template>
                  {{ t('common.batchDelete') }}
                </Button>
                <Button
                  shape="round"
                  :block="isMobile"
                  @click="showCharts = !showCharts"
                >
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
                <Button
                  v-if="isAdmin"
                  shape="round"
                  type="link"
                  :block="isMobile"
                  @click="handleSaveSystemDefault"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:save" />
                  </template>
                  存为系统默认
                </Button>
              </Space>
            </template>
          </Grid>
        </Card>
      </div>
    </MobilePageShell>

    <!-- 录入/编辑弹窗组件 -->
    <LossEditModal
      v-model:open="modalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="currentRecord"
      :dept-tree-data="deptTreeData"
      :status-options="qualityLossStatusOptions"
      :type-options="qualityLossTypeOptions"
      @success="
        () => {
          onLossDataChanged();
          gridApi.reload();
        }
      "
    />

    <!-- 索赔库单打印组件 -->
    <LossClaimModal
      v-model:open="claimModalVisible"
      :initial-data="currentRecord"
    />
  </Page>
</template>
