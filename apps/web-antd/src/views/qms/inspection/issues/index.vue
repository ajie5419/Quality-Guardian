<script lang="ts" setup>
import type { InspectionIssue } from './types';

import type { VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Col,
  Image,
  Row,
  Select,
  Statistic,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { importInspectionIssues } from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';

import IssueChartDashboard from './components/IssueChartDashboard.vue';
import IssueEditModal from './components/IssueEditModal.vue';
import { useAiReport } from './composables/useAiReport';
import { useIssueActions } from './composables/useIssueActions';
import { useIssueChartPreferences } from './composables/useIssueChartPreferences';
import { useIssueData } from './composables/useIssueData';
import { useIssueGridOptions } from './composables/useIssueGridOptions';
import { useIssueRemoteStatistics } from './composables/useIssueRemoteStatistics';
import { searchFormSchema } from './data';
import {
  getSeverityColor,
  getSeverityLabel,
  getStatusColor,
  getStatusLabel,
} from './utils/statusHelper';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

const { canEdit, canDelete, canImport } = useQmsPermissions(
  'QMS:Inspection:Issues',
);

const canSettle = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:Settle']),
);
const canAddChart = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Issues:ChartAdd']),
);

const userStore = useUserStore();
const isAdmin = computed(() => {
  return (
    userStore.userRoles?.some((role: string) => {
      const lowerRole = role.toLowerCase();
      return lowerRole.includes('admin') || lowerRole.includes('super');
    }) || false
  );
});

const checkedRows = ref<InspectionIssue[]>([]);

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records as unknown as InspectionIssue[];
}

const { invalidateInspectionIssues } = useInvalidateQmsQueries();
const { deptTreeData, deptRawData, loadInitialData } = useIssueData();

const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const chartDashboardRef = ref();

const gridApiProxyRef = ref<null | { reload: () => void }>(null);

const {
  modalVisible,
  isEditMode,
  currentRecord,
  handleOpenModal,
  handleEdit,
  handleDelete,
  handleBatchDelete,
  handleSettleToKnowledge,
} = useIssueActions({
  checkedRows,
  t,
  invalidateInspectionIssues,
  gridApi: {
    reload: () => gridApiProxyRef.value?.reload(),
  },
  onAfterDeleteSuccess: refreshStatistics,
});

const { handleImport } = useGridImport({
  gridApi: computed(() => gridApi),
  importApi: importInspectionIssues,
});

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

const { gridOptions } = useIssueGridOptions({
  canDelete,
  canEdit,
  canImport,
  canSettle,
  currentYear,
  deptRawData,
  handleDelete,
  handleEdit,
  handleImport,
  handleSettleToKnowledge,
  t,
});

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: gridOptions.value,
  gridEvents,
  formOptions: {
    schema: searchFormSchema,
    submitOnChange: true,
  },
});

gridApiProxyRef.value = gridApi;

const { showCharts, loadPreferences, handleSaveSystemDefault } =
  useIssueChartPreferences();
const { statistics, fetchStatistics } = useIssueRemoteStatistics();
function refreshStatistics() {
  return fetchStatistics(currentYear.value);
}

watch(currentYear, () => {
  refreshStatistics();
  gridApi.reload();
});

onMounted(() => {
  loadInitialData().then(() => {
    gridApi.reload();
  });
  loadPreferences();
  refreshStatistics();
});

const { isGeneratingInsight, generateReport } = useAiReport();

async function handleGenerateInsight() {
  await generateReport(statistics.value, currentYear.value);
}
</script>

<template>
  <Page class="h-full">
    <div v-if="showCharts" class="mb-4">
      <IssueChartDashboard ref="chartDashboardRef" :year="currentYear" />
    </div>

    <!-- 核心统计概览 -->
    <Card size="small" class="mb-4 border-none bg-gray-50 shadow-sm">
      <Row :gutter="16" class="items-center text-center">
        <Col :span="5">
          <Statistic
            :title="t('qms.inspection.issues.totalCount')"
            :value="statistics.totalCount"
          />
        </Col>
        <Col :span="5">
          <Statistic
            :title="t('qms.inspection.issues.status.open')"
            :value="statistics.openCount"
            :value-style="{ color: '#cf1322' }"
          />
        </Col>
        <Col :span="5">
          <Statistic
            :title="t('qms.inspection.issues.status.closed')"
            :value="statistics.closedCount"
            :value-style="{ color: '#3f8600' }"
          />
        </Col>
        <Col :span="5">
          <Statistic
            :title="`${t('qms.inspection.issues.lossAmount')} (RMB)`"
            :value="statistics.totalLoss"
            prefix="¥"
            :precision="2"
          />
        </Col>
        <Col :span="4">
          <Button
            type="primary"
            shape="round"
            block
            :loading="isGeneratingInsight"
            @click="handleGenerateInsight"
          >
            <span class="i-lucide-scroll-text mr-1"></span>
            {{ t('qms.inspection.issues.aiInsightReport') }}
          </Button>
        </Col>
      </Row>
    </Card>

    <Grid class="h-full" :grid-api="gridApi" :grid-events="gridEvents">
      <template #status="{ row }">
        <Tag :color="getStatusColor(row.status)">
          {{ getStatusLabel(row.status) }}
        </Tag>
      </template>
      <template #claim="{ row }">
        <Tag
          :color="row.claim === 'Yes' || row.claim === true ? 'red' : 'green'"
        >
          {{
            row.claim === 'Yes' || row.claim === true
              ? t('common.yes')
              : t('common.no')
          }}
        </Tag>
      </template>
      <template #photos="{ row }">
        <div
          v-if="row.photos && row.photos.length > 0"
          class="flex items-center justify-center"
        >
          <Image
            :width="40"
            :height="40"
            :src="
              row.photoThumbUrl ||
              (Array.isArray(row.photos) ? row.photos[0] : row.photos)
            "
            :fallback="Array.isArray(row.photos) ? row.photos[0] : row.photos"
            class="rounded shadow-sm"
          />
        </div>
      </template>
      <template #severity="{ row }">
        <Tag :color="getSeverityColor(row.severity)">
          {{ getSeverityLabel(row.severity) }}
        </Tag>
      </template>
      <template #toolbar-actions>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            v-access:code="'QMS:Inspection:Issues:Create'"
            shape="round"
            type="primary"
            @click="handleOpenModal"
          >
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            {{ t('qms.inspection.issues.createIssue') }}
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
          <Button
            v-if="canAddChart"
            shape="round"
            @click="
              () => {
                showCharts = true;
                chartDashboardRef?.handleAddCustomChart();
              }
            "
          >
            <template #icon>
              <IconifyIcon icon="lucide:plus" />
            </template>
            新增图表
          </Button>
          <Button shape="round" @click="showCharts = !showCharts">
            <template #icon>
              <IconifyIcon
                :icon="showCharts ? 'lucide:bar-chart-3' : 'lucide:bar-chart-3'"
              />
            </template>
            {{ showCharts ? t('common.hideChart') : t('common.showChart') }}
          </Button>
          <div class="flex items-center gap-2">
            <span class="text-gray-500"
              >{{ t('qms.inspection.records.statsYear') }}:</span
            >
            <Select
              v-model:value="currentYear"
              :options="yearOptions"
              class="w-[120px]"
              @change="() => gridApi.reload()"
            />
          </div>
          <Button
            v-if="isAdmin"
            shape="round"
            type="link"
            @click="handleSaveSystemDefault"
          >
            <template #icon>
              <IconifyIcon icon="lucide:save" />
            </template>
            存为系统默认
          </Button>
        </div>
      </template>
    </Grid>

    <IssueEditModal
      v-model:open="modalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="currentRecord || undefined"
      :dept-tree-data="deptTreeData"
      @success="
        () => {
          gridApi.reload();
          refreshStatistics();
        }
      "
    />
  </Page>
</template>

<style scoped>
/* 针对表格内图片的样式优化 */
:deep(.vxe-cell .ant-image) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px !important;
  height: 40px !important;
  overflow: hidden;
  border-radius: 4px;
}

:deep(.vxe-cell .ant-image-img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
