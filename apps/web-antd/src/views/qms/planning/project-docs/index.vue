<script lang="ts" setup>
import type { InspectionDocItem } from '../types';

import type { ProjectDocProject } from '#/api/qms/planning';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Empty, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getInspectionRecords } from '#/api/qms/inspection';
import {
  createProjectDocProject,
  deleteProjectDocProject,
  getProjectDocProjects,
  updateProjectDocProject,
} from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import PlanningSidebar from '../components/PlanningSidebar.vue';
import ProjectActionButtons from '../components/ProjectActionButtons.vue';
import WorkOrderSelectModal from '../components/WorkOrderSelectModal.vue';
import { useProjectActions } from '../composables/useProjectActions';
import type { PlanningTreeNode } from '../types';

// Helper for strict type safe access
function getField(record: unknown, field: string): string | undefined {
  if (typeof record === 'object' && record !== null && field in record) {
    const value = (record as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function getBooleanField(record: unknown, field: string): boolean | undefined {
  if (typeof record === 'object' && record !== null && field in record) {
    const value = (record as Record<string, unknown>)[field];
    return typeof value === 'boolean' ? value : undefined;
  }
  return undefined;
}

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { hasAccessByCodes } = useAccess();

const canExport = computed(() =>
  hasAccessByCodes([
    'QMS:Inspection:Records:Export',
    'QMS:Planning:ProjectDocs:Export',
  ]),
);

// ================= Left Column: Project List =================
const projectList = ref<ProjectDocProject[]>([]);
const isProjectsLoading = ref(false);
const selectedProjectId = ref<null | string>(null);
const searchTerm = ref('');
const activeTab = ref('active');

const selectedProject = computed(
  () => projectList.value.find((p) => p.id === selectedProjectId.value) || null,
);

async function loadProjects() {
  isProjectsLoading.value = true;
  try {
    const res = await getProjectDocProjects();
    projectList.value = res || [];
    if (projectList.value.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = projectList.value[0]?.id || null;
    }
  } finally {
    isProjectsLoading.value = false;
  }
}

const workOrderSelectVisible = ref(false);

function handleCreateProject() {
  workOrderSelectVisible.value = true;
}

async function handleWorkOrderSelected(workOrderNumber: string) {
  try {
    await createProjectDocProject({ workOrderNumber });
    message.success('已成功将工单添加到项目资料列表');
    await loadProjects();
  } catch (error: unknown) {
    message.error((error as { message?: string })?.message || '添加失败');
  }
}

/**
 * 判断是否为归档状态
 */
function isArchivedStatus(status?: string) {
  const s = String(status || '').toLowerCase();
  return ['archived', 'closed', 'completed', '已完成', '已归档'].includes(s);
}

/**
 * 核心过滤逻辑：必须与 useProjectManager 保持逻辑一致
 */
const filteredProjects = computed(() => {
  let list = projectList.value;

  // 1. 状态过滤
  const isArchivedTab = activeTab.value === 'archived';
  list = list.filter((p) => {
    const isArchived = isArchivedStatus(p.status as string);
    return isArchivedTab ? isArchived : !isArchived;
  });

  // 2. 搜索过滤
  if (searchTerm.value) {
    const lower = searchTerm.value.toLowerCase();
    list = list.filter(
      (p) =>
        p.projectName?.toLowerCase().includes(lower) ||
        p.workOrderNumber?.toLowerCase().includes(lower),
    );
  }
  return list;
});

function normalizeProjectDocStatus(
  status: string,
): NonNullable<ProjectDocProject['status']> {
  const value = status.toLowerCase();
  if (value === 'archived') return 'archived';
  if (value === 'draft') return 'draft';
  return 'active';
}

function getProjectDisplayName(project: ProjectDocProject) {
  return project.projectName || getField(project, 'name') || '';
}

const sidebarProjects = computed<PlanningTreeNode[]>(() =>
  filteredProjects.value.map((project) => ({
    id: project.id,
    name: getProjectDisplayName(project),
    status: isArchivedStatus(project.status as string) ? 'archived' : 'active',
    type: 'project',
    workOrderNumber: project.workOrderNumber,
  })),
);

// ================= Composables =================
const { handleArchiveProject, handleDeleteProject } =
  useProjectActions<PlanningTreeNode>({
  archiveProject: async (id, status) => {
    await updateProjectDocProject(id, {
      status: normalizeProjectDocStatus(status),
    });
  },
  deleteProject: async (id) => {
    await deleteProjectDocProject(id);
  },
  loadData: loadProjects,
  resetSelectionOnDelete: true,
  selectedProjectId,
});

// ================= Right Column: Documents =================
const inspectionRecords = ref<InspectionDocItem[]>([]);
const isRecordsLoading = ref(false);

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      { field: 'category', title: t('common.category'), minWidth: 200 },
      { field: 'name', title: t('qms.planning.bom.partName'), minWidth: 150 },
      {
        field: 'inspector',
        title: t('qms.inspection.issues.reportedBy'),
        width: 120,
      },
      {
        field: 'supplier',
        title: t('qms.inspection.issues.responsibleUnit'),
        width: 150,
      },
      {
        field: 'status',
        title: t('qms.inspection.records.form.documents'),
        width: 100,
        slots: { default: 'status' },
      },
      {
        field: 'reportDate',
        title: t('qms.inspection.issues.reportDate'),
        width: 120,
      },
    ],
    proxyConfig: {
      ajax: {
        query: async () => {
          return { items: inspectionRecords.value };
        },
      },
    },
    toolbarConfig: {
      refresh: true,
      zoom: true,
      custom: true,
      export: canExport.value,
    },
    exportConfig: {
      remote: false,
      types: ['xlsx', 'csv'],
      modes: ['current', 'selected', 'all'],
    },
    pagerConfig: {
      enabled: false,
    },
    height: 'auto',
    scrollX: { enabled: true, gt: 0 },
    scrollY: { enabled: true, gt: 0 },
  },
});

async function loadRecords() {
  if (!selectedProject.value) {
    inspectionRecords.value = [];
    return;
  }
  isRecordsLoading.value = true;
  try {
    const res = await getInspectionRecords({
      workOrderNumber: selectedProject.value?.workOrderNumber,
      type: 'ALL',
      pageSize: 500, // Get all records for this project
    });
    const items = res.items || [];

    const filtered: InspectionDocItem[] = items
      .filter((item) => {
        const pName = selectedProject.value?.projectName;
        const wNum = selectedProject.value?.workOrderNumber;

        const itemProjectName = getField(item, 'projectName');
        const itemWorkOrderNumber = getField(item, 'workOrderNumber');
        const type = getField(item, 'type') || getField(item, 'category');

        // Exclude Shipment records as per user request
        if (type === 'SHIPMENT') return false;

        // Filter by hasDocuments (only show if true, default to true if undefined for backward compatibility)
        const hasDocs = getBooleanField(item, 'hasDocuments');
        if (hasDocs === false) return false;

        return (
          (pName && itemProjectName && itemProjectName.includes(pName)) ||
          (wNum && itemWorkOrderNumber && itemWorkOrderNumber.includes(wNum))
        );
      })
      .map((item) => {
        const category = getField(item, 'category');
        const type = getField(item, 'type');
        const recordType = (category || type || '').toUpperCase();

        let displayCategory = t('common.other');
        switch (recordType) {
          case 'FINAL': {
            displayCategory = t('qms.inspection.records.tab.detailed');
            break;
          }
          case 'INCOMING': {
            const incomingType = getField(item, 'incomingType');
            displayCategory =
              incomingType || t('qms.inspection.records.tab.incoming');
            break;
          }
          case 'PROCESS': {
            const processVal = getField(item, 'process');
            displayCategory =
              processVal || t('qms.inspection.records.tab.process');
            break;
          }
          default: {
            if (recordType) displayCategory = recordType;
          }
        }

        // Logic: INCOMING -> materialName, PROCESS -> level2Component
        let displayName = '-';
        if (recordType === 'INCOMING') {
          displayName = getField(item, 'materialName') || '-';
        } else if (recordType === 'PROCESS') {
          displayName = getField(item, 'level2Component') || '-';
        } else {
          displayName =
            getField(item, 'materialName') ||
            getField(item, 'componentName') ||
            getField(item, 'partName') ||
            '-';
        }

        return {
          id: item.id,
          category: displayCategory,
          name: displayName,
          inspector:
            getField(item, 'inspector') || getField(item, 'reporter') || '-',
          supplier:
            getField(item, 'supplierName') || getField(item, 'team') || '-',
          status: getField(item, 'status') || t('qms.planning.status.archived'),
          reportDate: (
            getField(item, 'reportDate') ||
            getField(item, 'inspectionDate') ||
            getField(item, 'createdAt') ||
            getField(item, 'createTime') ||
            '-'
          ).slice(0, 10),
        };
      });
    inspectionRecords.value = filtered;
    await nextTick();
    try {
      gridApi.reload();
    } catch (error) {
      console.warn('Grid not ready for reload', error);
    }
  } catch (error) {
    handleApiError(error, 'Load Project Docs Inspection Records');
    inspectionRecords.value = [];
  } finally {
    isRecordsLoading.value = false;
  }
}

watch(selectedProjectId, () => {
  loadRecords();
});

onMounted(() => {
  loadProjects();
  loadRecords();
});
</script>

<template>
  <Page content-class="h-full p-4">
    <div class="flex h-[calc(100vh-130px)] min-h-0 gap-4 overflow-hidden">
      <!-- Left: Project List -->
      <PlanningSidebar
        :title="t('qms.planning.bom.projectList')"
        :projects="sidebarProjects"
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchTerm"
        auth-prefix="QMS:Planning:ProjectDocs"
        @archive="handleArchiveProject"
        @create="handleCreateProject"
      >
        <template #actions="{ project }">
          <ProjectActionButtons
            :project="project"
            mode="dropdown"
            auth-prefix="QMS:Planning:ProjectDocs"
            @archive="handleArchiveProject"
            @delete="handleDeleteProject"
          />
        </template>
      </PlanningSidebar>

      <div
        class="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <div
          v-show="selectedProject"
          class="flex h-full flex-col overflow-hidden"
        >
          <div
            class="flex items-center justify-between border-b border-gray-100 bg-gray-50/30 p-4"
          >
            <div>
              <h2 class="text-xl font-bold text-gray-800">
                {{ selectedProject?.projectName }}
              </h2>
              <div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
                <span>
                  {{ t('qms.planning.bom.workOrderNo') }}:
                  <b class="text-gray-700">{{
                    selectedProject?.workOrderNumber
                  }}</b>
                </span>
                <span>
                  {{ t('qms.planning.projectDocs.recordCount') }}:
                  <b class="text-blue-600">{{ inspectionRecords.length }}</b>
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2"></div>
          </div>

          <div class="flex-1 overflow-hidden p-4">
            <Grid>
              <template #status="{ row }">
                <Tag
                  color="green"
                  v-if="
                    [
                      'Completed',
                      'COMPLETED',
                      '已归档',
                      'Pass',
                      'PASS',
                    ].includes(row.status as string)
                  "
                >
                  {{ t('common.completed') }}
                </Tag>
                <Tag color="orange" v-else>{{ t('task.status.pending') }}</Tag>
              </template>
            </Grid>
          </div>
        </div>
        <div
          v-show="!selectedProject"
          class="flex flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-400"
        >
          <Empty :description="t('qms.planning.common.selectProjectHint')" />
        </div>
      </div>
    </div>
    <WorkOrderSelectModal
      v-model:open="workOrderSelectVisible"
      @success="handleWorkOrderSelected"
    />
  </Page>
</template>
