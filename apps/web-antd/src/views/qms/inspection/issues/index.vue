<script lang="ts" setup>
import type { InspectionGridRow } from './composables/useIssueGridOptions';
import type { InspectionIssue } from './types';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  hasInspectionIssueAdminAccess,
  hasInspectionIssueWriteAccess,
  QMS_DICTIONARY_TYPE_KEYS,
  QUALITY_CLASSIFICATION_SCOPES,
} from '@qgs/shared';
import { Image, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { importInspectionIssues } from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { findNameById } from '#/types';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import { useDictionaryOptions } from '../../shared/composables/useDictionaryOptions';
import { useProcessMasterOptions } from '../../shared/composables/useProcessMasterOptions';
import { useQualityClassificationOptions } from '../../shared/composables/useQualityClassificationOptions';
import { mapDictionaryOptionsToInspectionProcess } from '../records/config';
import IssueChartDashboard from './components/IssueChartDashboard.vue';
import IssueDetailDrawer from './components/IssueDetailDrawer.vue';
import IssueEditModal from './components/IssueEditModal.vue';
import IssueMobileList from './components/IssueMobileList.vue';
import IssueStatisticsCard from './components/IssueStatisticsCard.vue';
import IssueToolbarActions from './components/IssueToolbarActions.vue';
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
const isAdmin = computed(() =>
  hasInspectionIssueAdminAccess(userStore.userRoles),
);

function canManageIssue(issue: InspectionIssue) {
  return hasInspectionIssueWriteAccess({
    createdBy: issue.createdBy || null,
    roles: userStore.userRoles,
    userId: userStore.userInfo?.userId,
  });
}

const checkedRows = ref<InspectionIssue[]>([]);
const { isMobile } = useMobileViewport();
const mobileIssues = ref<InspectionGridRow[]>([]);
const mobileTotal = ref(0);
const mobilePage = ref(1);
const mobilePageSize = ref(20);

const { invalidateInspectionIssues } = useInvalidateQmsQueries();
const { deptTreeData, deptRawData, loadInitialData } = useIssueData();
const { detailVisible, detailRecord, openDetail } = useIssueDetail(deptRawData);
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
} = useProcessMasterOptions({
  mapOptions: (options) => mapDictionaryOptionsToInspectionProcess(options),
});
const {
  options: issueDefectCategories,
  loadOptions: loadIssueDefectCategories,
} = useQualityClassificationOptions(QUALITY_CLASSIFICATION_SCOPES[0]);

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
  canManageIssue,
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
  ] as Array<{ label: string; value: 'month' | 'week' | 'year' }>;
});

function syncMobileRows(payload: {
  items: InspectionGridRow[];
  total: number;
}) {
  mobileIssues.value = payload.items.map((item) => {
    const departments =
      item.responsibleDepartments && item.responsibleDepartments.length > 0
        ? item.responsibleDepartments
        : [item.responsibleDepartment].filter(Boolean);
    return {
      ...item,
      responsibleDepartment: departments
        .map((value) => findNameById(deptRawData.value, value) || value)
        .join(', '),
    };
  });
  mobileTotal.value = payload.total;
}

function addCustomChart() {
  showCharts.value = true;
  chartDashboardRef.value?.handleAddCustomChart();
}

function handleMobilePageChange(nextPage: number, nextPageSize: number) {
  mobilePage.value = nextPage;
  mobilePageSize.value = nextPageSize;
  gridApi.setGridOptions({
    pagerConfig: {
      ...gridOptions.value?.pagerConfig,
      currentPage: nextPage,
      pageSize: nextPageSize,
    },
  });
  gridApi.reload();
}

const { gridOptions } = useIssueGridOptions({
  canManageIssue,
  currentDateMode,
  currentDateValue,
  canDelete,
  canEdit,
  canImport,
  canSettle,
  defectCategories: issueDefectCategories,
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
  onRowsChange: syncMobileRows,
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
void Promise.all([
  loadIssueStatusOptions(),
  loadIssueProcessOptions(),
  loadIssueDefectCategories().then(() => {
    gridApi.setGridOptions({
      columns: gridOptions.value?.columns || [],
    });
  }),
]);

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
  mobilePage.value = 1;
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
    <QmsPageShell>
      <div v-if="showCharts" class="mb-4">
        <IssueChartDashboard
          ref="chartDashboardRef"
          :date-mode="currentDateMode"
          :date-value="currentDateValue"
          :year="currentFilterYear"
        />
      </div>

      <IssueStatisticsCard
        :statistics="statistics"
        :loading="isGeneratingInsight"
        @generate-insight="handleGenerateInsight"
      />

      <IssueToolbarActions
        v-if="isMobile"
        v-model:date-mode="currentDateMode"
        v-model:date-value="currentDate"
        v-model:year="currentYear"
        class="mb-3"
        :can-add-chart="canAddChart"
        :can-delete="canDelete"
        :checked-count="checkedRows.length"
        :date-mode-label="t('qms.inspection.issues.dateMode.label')"
        :date-mode-options="dateModeOptions"
        :is-admin="isAdmin"
        :is-mobile="isMobile"
        :show-charts="showCharts"
        :year-options="yearOptions"
        @add-chart="addCustomChart"
        @batch-delete="handleBatchDelete"
        @create="handleOpenModal"
        @save-system-default="handleSaveSystemDefault"
        @toggle-charts="showCharts = !showCharts"
      />

      <IssueMobileList
        v-if="isMobile"
        :can-delete="canDelete"
        :can-edit="canEdit"
        :can-manage-issue="canManageIssue"
        :can-settle="canSettle"
        :issues="mobileIssues"
        :page="mobilePage"
        :page-size="mobilePageSize"
        :total="mobileTotal"
        @delete="handleDelete"
        @detail="openDetail"
        @edit="handleEdit"
        @page-change="handleMobilePageChange"
        @settle="handleSettleToKnowledge"
      />

      <Grid
        v-show="!isMobile"
        class="h-full"
        :grid-api="gridApi"
        :grid-events="gridEvents"
      >
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
          <IssueToolbarActions
            v-model:date-mode="currentDateMode"
            v-model:date-value="currentDate"
            v-model:year="currentYear"
            :can-add-chart="canAddChart"
            :can-delete="canDelete"
            :checked-count="checkedRows.length"
            :date-mode-label="t('qms.inspection.issues.dateMode.label')"
            :date-mode-options="dateModeOptions"
            :is-admin="isAdmin"
            :is-mobile="isMobile"
            :show-charts="showCharts"
            :year-options="yearOptions"
            @add-chart="addCustomChart"
            @batch-delete="handleBatchDelete"
            @create="handleOpenModal"
            @save-system-default="handleSaveSystemDefault"
            @toggle-charts="showCharts = !showCharts"
          />
        </template>
      </Grid>
    </QmsPageShell>

    <IssueDetailDrawer
      v-model:open="detailVisible"
      :dept-data="deptRawData"
      :record="detailRecord"
    />

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
