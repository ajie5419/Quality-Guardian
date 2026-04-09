<script lang="ts" setup>
import type { InspectionIssue } from './types';

import type { VxeCheckboxChangeParams } from '#/types';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Image,
  Row,
  Select,
  Statistic,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { importInspectionIssues } from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';

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
const route = useRoute();

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
const detailVisible = ref(false);
const detailRecord = ref<InspectionIssue | undefined>(undefined);

function openDetail(row: InspectionIssue) {
  detailRecord.value = row;
  detailVisible.value = true;
}

function parsePhotos(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  const result: string[] = [];
  for (const item of photos) {
    if (typeof item === 'string') {
      result.push(item);
      continue;
    }
    if (
      item &&
      typeof item === 'object' &&
      'url' in item &&
      typeof item.url === 'string'
    ) {
      result.push(item.url);
    }
  }
  return result;
}

const detailPhotos = computed(() => parsePhotos(detailRecord.value?.photos));

function formatDept(value: string | undefined) {
  if (!value) return '-';
  return findNameById(deptRawData.value, value) || value;
}

function formatDisplayDate(value: string | undefined) {
  if (!value) return '-';
  return value.includes('T') ? value.slice(0, 10) : value;
}

function onCheckChange(params: VxeCheckboxChangeParams) {
  const records = params.$grid.getCheckboxRecords() || [];
  checkedRows.value = records as unknown as InspectionIssue[];
}

function onCellClick(params: {
  column?: { field?: string; type?: string };
  row: InspectionIssue;
}) {
  if (!params?.row) return;
  if (params.column?.type === 'checkbox') return;
  if (!params.column?.field) return;
  openDetail(params.row);
}

const { invalidateInspectionIssues } = useInvalidateQmsQueries();
const { deptTreeData, deptRawData, loadInitialData } = useIssueData();

const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const currentDateMode = ref<'month' | 'week' | 'year'>('year');
const currentDate = ref(dayjs());
const chartDashboardRef = ref();

const currentFilterYear = computed(() => {
  return currentDateMode.value === 'year'
    ? currentYear.value
    : currentDate.value.year();
});

const currentDateValue = computed(() => {
  if (currentDateMode.value === 'month') {
    return currentDate.value.format('YYYY-MM');
  }
  if (currentDateMode.value === 'week') {
    return currentDate.value.format('YYYY-MM-DD');
  }
  return String(currentYear.value);
});
const routeProjectName = computed(() =>
  typeof route.query.projectName === 'string' ? route.query.projectName : '',
);
const routeSourceIssueId = computed(() =>
  typeof route.query.sourceIssueId === 'string'
    ? route.query.sourceIssueId
    : '',
);
const routeWorkOrderNumber = computed(() =>
  typeof route.query.workOrderNumber === 'string'
    ? route.query.workOrderNumber
    : '',
);

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

const dateModeOptions = computed(() => {
  return [
    { label: t('qms.inspection.issues.dateMode.year'), value: 'year' },
    { label: t('qms.inspection.issues.dateMode.month'), value: 'month' },
    { label: t('qms.inspection.issues.dateMode.week'), value: 'week' },
  ];
});

const { gridOptions } = useIssueGridOptions({
  currentDateMode,
  currentDateValue,
  canDelete,
  canEdit,
  canImport,
  canSettle,
  currentYear: currentFilterYear,
  defaultProjectName: routeProjectName,
  defaultSourceIssueId: routeSourceIssueId,
  defaultWorkOrderNumber: routeWorkOrderNumber,
  deptRawData,
  handleDelete,
  handleEdit,
  handleImport,
  handleSettleToKnowledge,
  t,
});

const gridEvents = {
  cellClick: onCellClick,
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
  return fetchStatistics({
    dateMode: currentDateMode.value,
    dateValue: currentDateValue.value,
    year: currentFilterYear.value,
  });
}

watch([currentYear, currentDateMode, currentDate], () => {
  refreshStatistics();
  gridApi.reload();
});

watch(currentDateMode, (mode) => {
  if (mode === 'year') {
    currentYear.value = currentDate.value.year();
    return;
  }

  currentDate.value = currentDate.value.year(currentYear.value);
});

watch(deptRawData, () => {
  gridApi.setGridOptions({
    columns: gridOptions.value?.columns || [],
  });
  gridApi.reload();
});

onMounted(() => {
  loadInitialData().then(() => {
    gridApi.setGridOptions({
      columns: gridOptions.value?.columns || [],
    });
    gridApi.reload();
  });
  loadPreferences();
  refreshStatistics();
});

const { isGeneratingInsight, generateReport } = useAiReport();

async function handleGenerateInsight() {
  await generateReport(statistics.value, currentFilterYear.value);
}
</script>

<template>
  <Page class="h-full">
    <div v-if="showCharts" class="mb-4">
      <IssueChartDashboard
        ref="chartDashboardRef"
        :date-mode="currentDateMode"
        :date-value="currentDateValue"
        :year="currentFilterYear"
      />
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
            <span class="text-gray-500">
              {{ t('qms.inspection.issues.dateMode.label') }}:
            </span>
            <Select
              v-model:value="currentDateMode"
              :options="dateModeOptions"
              class="w-[100px]"
            />
            <Select
              v-if="currentDateMode === 'year'"
              v-model:value="currentYear"
              :options="yearOptions"
              class="w-[120px]"
            />
            <DatePicker
              v-else
              v-model:value="currentDate"
              :allow-clear="false"
              :picker="currentDateMode"
              class="w-[160px]"
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

    <Drawer
      v-model:open="detailVisible"
      :title="`不合格项详情 - ${detailRecord?.ncNumber || ''}`"
      :width="960"
      placement="right"
    >
      <Descriptions v-if="detailRecord" bordered :column="2" size="small">
        <Descriptions.Item :label="t('qms.inspection.issues.ncNumber')">
          {{ detailRecord.ncNumber || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.statusLabel')">
          <Tag :color="getStatusColor(detailRecord.status)">
            {{ getStatusLabel(detailRecord.status) }}
          </Tag>
        </Descriptions.Item>

        <Descriptions.Item :label="t('qms.inspection.issues.workOrderNumber')">
          {{ detailRecord.workOrderNumber || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.projectName')">
          {{ detailRecord.projectName || '-' }}
        </Descriptions.Item>

        <Descriptions.Item :label="t('qms.inspection.issues.partName')">
          {{ detailRecord.partName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.processName')">
          {{ detailRecord.processName || '-' }}
        </Descriptions.Item>

        <Descriptions.Item :label="t('qms.inspection.issues.reportDate')">
          {{ formatDisplayDate(detailRecord.reportDate) }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.reportedBy')">
          {{ detailRecord.inspector || '-' }}
        </Descriptions.Item>

        <Descriptions.Item label="事业部">
          {{ formatDept(detailRecord.division) }}
        </Descriptions.Item>
        <Descriptions.Item
          :label="t('qms.inspection.issues.responsibleDepartment')"
        >
          {{ formatDept(detailRecord.responsibleDepartment) }}
        </Descriptions.Item>
        <Descriptions.Item
          :label="t('qms.inspection.issues.responsibleWelder')"
        >
          {{ detailRecord.responsibleWelder || '-' }}
        </Descriptions.Item>

        <Descriptions.Item :label="t('qms.inspection.issues.defectType')">
          {{ detailRecord.defectType || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.defectSubtype')">
          {{ detailRecord.defectSubtype || '-' }}
        </Descriptions.Item>

        <Descriptions.Item :label="t('qms.inspection.issues.severity')">
          <Tag :color="getSeverityColor(detailRecord.severity)">
            {{ getSeverityLabel(detailRecord.severity) }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.claim')">
          <Tag :color="detailRecord.claim === 'Yes' ? 'red' : 'green'">
            {{
              detailRecord.claim === 'Yes' ? t('common.yes') : t('common.no')
            }}
          </Tag>
        </Descriptions.Item>

        <Descriptions.Item :label="t('qms.inspection.issues.quantity')">
          {{ detailRecord.quantity ?? '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.lossAmount')">
          ¥{{ detailRecord.lossAmount ?? 0 }}
        </Descriptions.Item>

        <Descriptions.Item label="供应商">
          {{ detailRecord.supplierName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="更新时间">
          {{ formatDisplayDate(detailRecord.updatedAt) }}
        </Descriptions.Item>

        <Descriptions.Item
          :label="t('qms.inspection.issues.description')"
          :span="2"
        >
          {{ detailRecord.description || '-' }}
        </Descriptions.Item>
        <Descriptions.Item
          :label="t('qms.inspection.issues.rootCause')"
          :span="2"
        >
          {{ detailRecord.rootCause || '-' }}
        </Descriptions.Item>
        <Descriptions.Item
          :label="t('qms.inspection.issues.solution')"
          :span="2"
        >
          {{ detailRecord.solution || '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('qms.inspection.issues.photos')" :span="2">
          <div v-if="detailPhotos.length > 0" class="flex flex-wrap gap-2">
            <Image
              v-for="(photo, index) in detailPhotos"
              :key="`${photo}-${index}`"
              :width="96"
              :height="96"
              :src="photo"
              class="rounded border border-gray-200"
            />
          </div>
          <span v-else>-</span>
        </Descriptions.Item>
      </Descriptions>
    </Drawer>

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
:deep(.vxe-table--filter-wrapper.is--multiple .vxe-table--filter-body) {
  max-height: 180px;
}

:deep(.vxe-table--filter-wrapper .vxe-table--filter-footer) {
  position: sticky;
  bottom: 0;
  background: var(--vxe-ui-layout-background-color);
}

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
