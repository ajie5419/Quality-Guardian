<script lang="ts" setup>
import type { InspectionDocItem, PlanningTreeNode } from '../types';

import type { InspectionRecordPrintDetail } from '#/api/qms/inspection';
import type { ProjectDocProject } from '#/api/qms/planning';

import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Empty, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  getInspectionRecordDetail,
  getInspectionRecordsExport,
} from '#/api/qms/inspection';
import {
  createProjectDocProject,
  deleteProjectDocProject,
  getProjectDocProjectsPage,
  updateProjectDocProject,
} from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import PlanningSidebar from '../components/PlanningSidebar.vue';
import ProjectActionButtons from '../components/ProjectActionButtons.vue';
import WorkOrderSelectModal from '../components/WorkOrderSelectModal.vue';
import { useProjectActions } from '../composables/useProjectActions';
import InspectionDocPrintModal from './components/InspectionDocPrintModal.vue';

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
const router = useRouter();

const canExport = computed(() =>
  hasAccessByCodes([
    'QMS:Inspection:Records:Export',
    'QMS:Planning:ProjectDocs:Export',
  ]),
);

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
    const res = await getProjectDocProjectsPage();
    projectList.value = res.items || [];
    if (projectList.value.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = projectList.value[0]?.id || null;
    }
  } catch (error) {
    handleApiError(error, 'Load Project Docs Projects');
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
    handleApiError(error, 'Create Project Docs Project');
    message.error((error as { message?: string })?.message || '添加失败');
  }
}

function isArchivedStatus(status?: string) {
  const s = String(status || '').toLowerCase();
  return ['archived', 'closed', 'completed', '已完成', '已归档'].includes(s);
}

const filteredProjects = computed(() => {
  let list = projectList.value;

  const isArchivedTab = activeTab.value === 'archived';
  list = list.filter((p) => {
    const isArchived = isArchivedStatus(p.status as string);
    return isArchivedTab ? isArchived : !isArchived;
  });

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

const inspectionRecords = ref<InspectionDocItem[]>([]);
const isRecordsLoading = ref(false);
const detailVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref<InspectionRecordPrintDetail | null>(null);

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
      {
        field: 'actions',
        title: t('common.actions'),
        width: 120,
        slots: { default: 'actions' },
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
    const res = await getInspectionRecordsExport({
      workOrderNumber: selectedProject.value?.workOrderNumber,
      type: 'ALL',
    });
    const items = res.items || [];

    const filtered: InspectionDocItem[] = items
      .filter((item) => {
        const pName = selectedProject.value?.projectName;
        const wNum = selectedProject.value?.workOrderNumber;

        const itemProjectName = getField(item, 'projectName');
        const itemWorkOrderNumber = getField(item, 'workOrderNumber');
        const type = getField(item, 'type') || getField(item, 'category');

        if (type === 'SHIPMENT') return false;

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

function handleOpenInspectionRecord(row: InspectionDocItem) {
  const workOrderNumber = selectedProject.value?.workOrderNumber || '';
  const keyword = [workOrderNumber, row.category, row.name]
    .filter(Boolean)
    .join(' ');
  void router.push({
    path: '/qms/inspection/records',
    query: {
      keyword,
      sourceInspectionId: row.id,
      workOrderNumber,
    },
  });
}

async function handleViewDoc(row: InspectionDocItem) {
  if (!row.id) return;
  detailLoading.value = true;
  try {
    currentDetail.value = await getInspectionRecordDetail(row.id);
    detailVisible.value = true;
  } catch (error) {
    handleApiError(error, 'Load Inspection Record Detail');
    message.error('加载检验资料失败');
  } finally {
    detailLoading.value = false;
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
            <div class="flex h-full flex-col gap-4 overflow-hidden">
              <div
                class="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200"
              >
                <div class="border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <h3 class="text-sm font-semibold text-gray-700">
                    检验资料记录
                  </h3>
                </div>
                <div class="h-[calc(100%-49px)] p-4">
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
                      <Tag color="orange" v-else>{{
                        t('task.status.pending')
                      }}</Tag>
                    </template>
                    <template #actions="{ row }">
                      <div class="flex items-center gap-2">
                        <a @click="handleViewDoc(row)">查看资料</a>
                        <a @click="handleOpenInspectionRecord(row)">查看记录</a>
                      </div>
                    </template>
                  </Grid>
                </div>
              </div>
            </div>
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
    <InspectionDocPrintModal
      v-model:open="detailVisible"
      :detail="currentDetail"
      :loading="detailLoading"
    />
  </Page>
</template>
