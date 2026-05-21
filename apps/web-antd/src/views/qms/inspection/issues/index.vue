<script lang="ts" setup>
import type { InspectionIssue } from './types';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { QMS_DICTIONARY_TYPE_KEYS } from '@qgs/shared';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Image,
  Select,
  Statistic,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { importInspectionIssues } from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import MobilePageShell from '#/views/qms/shared/components/MobilePageShell.vue';

import { useDictionaryOptions } from '../../shared/composables/useDictionaryOptions';
import { cloneInspectionProcessFallbackOptions } from '../../shared/constants/inspection-process-fallback';
import { mapDictionaryOptionsToInspectionProcess } from '../records/config';
import IssueChartDashboard from './components/IssueChartDashboard.vue';
import IssueEditModal from './components/IssueEditModal.vue';
import { useAiReport } from './composables/useAiReport';
import { useIssueActions } from './composables/useIssueActions';
import { useIssueChartPreferences } from './composables/useIssueChartPreferences';
import { useIssueData } from './composables/useIssueData';
import { useIssueDetail } from './composables/useIssueDetail';
import { useIssueGridEvents } from './composables/useIssueGridEvents';
import { useIssueGridOptions } from './composables/useIssueGridOptions';
import { useIssueRemoteStatistics } from './composables/useIssueRemoteStatistics';
import {
  mapDictionaryOptionsToIssueStatus,
  useStatusOptions,
} from './constants';
import { getIssueSearchFormSchema } from './data';
import {
  getSeverityColor,
  getSeverityLabel,
  getStatusColor,
  getStatusLabel,
} from './utils/statusHelper';

import './index.css';

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
const { isMobile } = useMobileViewport();
const detailDrawerWidth = computed(() =>
  isMobile.value ? '100vw' : 'min(100vw, 960px)',
);

const { invalidateInspectionIssues } = useInvalidateQmsQueries();
const { deptTreeData, deptRawData, loadInitialData } = useIssueData();
const {
  detailVisible,
  detailRecord,
  detailPhotos,
  openDetail,
  formatDept,
  formatDisplayDate,
} = useIssueDetail(deptRawData);
const { statusOptions: fallbackIssueStatusOptions } = useStatusOptions();
const {
  options: issueStatusOptions,
  loadOptions: loadIssueStatusDictionaryOptions,
} = useDictionaryOptions({
  dictType: QMS_DICTIONARY_TYPE_KEYS.inspectionIssueStatus,
  fallbackOptions: fallbackIssueStatusOptions.value,
  mapOptions: (options, fallbackOptions) =>
    mapDictionaryOptionsToIssueStatus(options, fallbackOptions),
});
const {
  options: issueProcessOptions,
  loadOptions: loadIssueProcessDictionaryOptions,
} = useDictionaryOptions({
  dictType: QMS_DICTIONARY_TYPE_KEYS.inspectionProcessName,
  fallbackOptions: cloneInspectionProcessFallbackOptions(),
  mapOptions: (options, fallbackOptions) =>
    mapDictionaryOptionsToInspectionProcess(options, fallbackOptions),
});

function refreshIssueSearchSchema() {
  gridApi.setState({
    formOptions: {
      schema: getIssueSearchFormSchema(
        issueStatusOptions.value,
        issueProcessOptions.value,
      ),
      submitOnChange: true,
    },
  });
}

async function loadIssueStatusOptions() {
  try {
    await loadIssueStatusDictionaryOptions();
    refreshIssueSearchSchema();
    gridApi.setGridOptions({
      columns: gridOptions.value?.columns || [],
    });
  } catch {
    // Keep local fallback options.
  }
}

async function loadIssueProcessOptions() {
  try {
    await loadIssueProcessDictionaryOptions();
    refreshIssueSearchSchema();
  } catch {
    // Keep local fallback options.
  }
}

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
function getRouteQueryText(key: string) {
  const value = route.query[key];
  return typeof value === 'string' ? value : '';
}
const routeProjectName = computed(() => getRouteQueryText('projectName'));
const routeSourceIssueId = computed(() => getRouteQueryText('sourceIssueId'));
const routeWorkOrderNumber = computed(() =>
  getRouteQueryText('workOrderNumber'),
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
  issueStatusOptions,
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

const { onCheckChange, onCellClick } = useIssueGridEvents({
  checkedRows,
  onOpenDetail: openDetail,
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
    schema: getIssueSearchFormSchema(
      issueStatusOptions.value,
      issueProcessOptions.value,
    ),
    submitOnChange: true,
  },
});

gridApiProxyRef.value = gridApi;
void Promise.all([loadIssueStatusOptions(), loadIssueProcessOptions()]);

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
  <Page class="h-full" content-class="p-0">
    <MobilePageShell>
      <div v-if="showCharts" class="mb-4">
        <IssueChartDashboard
          ref="chartDashboardRef"
          :date-mode="currentDateMode"
          :date-value="currentDateValue"
          :year="currentFilterYear"
        />
      </div>

      <Card size="small" class="mb-4 border-none bg-gray-50 shadow-sm">
        <div
          class="grid grid-cols-1 gap-3 text-center sm:grid-cols-2 lg:grid-cols-5"
        >
          <Statistic
            :title="t('qms.inspection.issues.totalCount')"
            :value="statistics.totalCount"
          />
          <Statistic
            :title="t('qms.inspection.issues.status.open')"
            :value="statistics.openCount"
            :value-style="{ color: '#cf1322' }"
          />
          <Statistic
            :title="t('qms.inspection.issues.status.closed')"
            :value="statistics.closedCount"
            :value-style="{ color: '#3f8600' }"
          />
          <Statistic
            :title="`${t('qms.inspection.issues.lossAmount')} (RMB)`"
            :value="statistics.totalLoss"
            prefix="¥"
            :precision="2"
          />
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
        </div>
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
                  :icon="
                    showCharts ? 'lucide:bar-chart-3' : 'lucide:bar-chart-3'
                  "
                />
              </template>
              {{ showCharts ? t('common.hideChart') : t('common.showChart') }}
            </Button>
            <div
              class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
            >
              <span class="text-gray-500">
                {{ t('qms.inspection.issues.dateMode.label') }}:
              </span>
              <Select
                v-model:value="currentDateMode"
                :options="dateModeOptions"
                :class="isMobile ? 'w-full' : 'w-[100px]'"
              />
              <Select
                v-if="currentDateMode === 'year'"
                v-model:value="currentYear"
                :options="yearOptions"
                :class="isMobile ? 'w-full' : 'w-[120px]'"
              />
              <DatePicker
                v-else
                v-model:value="currentDate"
                :allow-clear="false"
                :picker="currentDateMode"
                :class="isMobile ? 'w-full' : 'w-[160px]'"
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
    </MobilePageShell>

    <Drawer
      v-model:open="detailVisible"
      :title="`不合格项详情 - ${detailRecord?.ncNumber || ''}`"
      :width="detailDrawerWidth"
      placement="right"
    >
      <Descriptions
        v-if="detailRecord"
        bordered
        :column="isMobile ? 1 : 2"
        size="small"
      >
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
      :status-options="issueStatusOptions"
      :process-options="issueProcessOptions"
      @success="
        () => {
          gridApi.reload();
          refreshStatistics();
        }
      "
    />
  </Page>
</template>
