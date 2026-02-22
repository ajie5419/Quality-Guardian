<script lang="ts" setup>
import type { PlanningTreeNode } from '../types';

import type { QmsPlanningApi } from '#/api/qms/planning';

import { nextTick, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, Empty, message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createBomProject,
  deleteBom,
  deleteBomProject,
  getBomListPage,
  getBomTree,
  importBomItems,
  updateBomProject,
} from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useGridImport } from '#/hooks/useGridImport';
import { useQmsPermissions } from '#/hooks/useQmsPermissions';

// Shared
import PlanningSidebar from '../components/PlanningSidebar.vue';
import ProjectActionButtons from '../components/ProjectActionButtons.vue';
import WorkOrderSelectModal from '../components/WorkOrderSelectModal.vue';
import { useProjectActions } from '../composables/useProjectActions';
import { useProjectManager } from '../composables/useProjectManager';
import BomEditModal from './components/BomEditModal.vue';
import BomProjectModal from './components/BomProjectModal.vue';

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const { canCreate, canExport, canImport } =
  useQmsPermissions('QMS:Planning:BOM');

type BomProjectViewModel = PlanningTreeNode & {
  itemCount: number;
  workOrderNumber: string;
};

type BomRow = Partial<QmsPlanningApi.BomItem> & {
  id?: string;
  parentId?: string;
};

// ================= Data State =================
const allProjects = ref<BomProjectViewModel[]>([]);
const loading = ref(false);

const {
  searchText,
  activeTab,
  selectedProjectId,
  filteredProjects,
  currentProject,
  handleTabChange,
} = useProjectManager(allProjects);

// ================= Composables =================

// ================= Methods =================

async function loadData() {
  loading.value = true;
  try {
    const data = await getBomTree();
    allProjects.value = (data || []).map((node) => ({
      id: node.id,
      itemCount: node.itemCount || 0,
      name: node.name || '',
      parentId: node.parentId || null,
      status: node.status,
      type: node.type,
      version: node.version,
      workOrderNumber: node.workOrderNumber || '',
    }));
    if (data.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = data[0]?.id ?? null;
    }
    await nextTick();
    try {
      gridApi.reload();
    } catch (error) {
      console.warn('Grid not ready for reload', error);
    }
  } catch (error) {
    handleApiError(error, 'Load BOM Planning Data');
  } finally {
    loading.value = false;
  }
}

const { handleArchiveProject, handleDeleteProject, handleDeleteItem } =
  useProjectActions({
    archiveProject: async (id, status) => {
      await updateBomProject(id, {
        status: status as QmsPlanningApi.BomProject['status'],
      });
    },
    deleteItem: async (id) => {
      await deleteBom(id);
    },
    deleteProject: async (id) => {
      await deleteBomProject(id);
    },
    loadData,
    resetSelectionOnDelete: true,
    selectedProjectId,
  });

// ================= Modal =================
const modalVisible = ref(false);
const isEditMode = ref(false);
const currentItemId = ref<null | string>(null);
const initialFormData = ref<Record<string, unknown>>({});

const projectModalVisible = ref(false);
const projectEditMode = ref(false);
const projectInitialData = ref<
  Partial<QmsPlanningApi.BomProject> & { id?: string; name?: string }
>({});

function openProjectModal(_mode: 'edit', proj: PlanningTreeNode) {
  projectEditMode.value = true;
  projectInitialData.value = {
    id: proj.id,
    name: proj.name,
    projectName: proj.name,
    status: normalizeBomStatus(proj.status),
    workOrderNumber: getProjectWorkOrder(proj),
  };
  projectModalVisible.value = true;
}

function openModal(mode: 'create' | 'edit', row?: BomRow) {
  isEditMode.value = mode === 'edit';
  currentItemId.value = row?.id || null;
  initialFormData.value =
    mode === 'edit' && row
      ? {
          ...row,
          partName: row.partName,
          workOrderNumber: row.parentId || currentProject.value?.id,
        }
      : {
          quantity: 1,
          unit: 'PCS',
          workOrderNumber:
            currentProject.value?.workOrderNumber || currentProject.value?.id,
        };
  modalVisible.value = true;
}

const gridApiProxy = ref<ReturnType<typeof useVbenVxeGrid>[1]>();

const { handleImport } = useGridImport({
  gridApi: gridApiProxy,
  // 显式配置映射规则，确保 CSV/Excel 表头即便有细微差异（如空格、斜杠）也能识别
  fieldMap: {
    partName: [
      t('qms.planning.bom.partName'),
      '部件名称',
      '名称',
      'name',
      'partName',
    ],
    partNumber: [
      t('qms.planning.bom.partNumber'),
      '物料编码/图号',
      '图号',
      '物料编码',
      'partNumber',
      '图号/物料编码',
    ],
    material: [
      t('qms.planning.bom.material'),
      '规格/材质',
      '规格',
      '材质',
      'material',
    ],
    quantity: [t('qms.planning.bom.quantity'), '用量', '数量', 'quantity'],
    unit: [t('qms.planning.bom.unit'), '单位', 'unit'],
    remarks: [t('qms.planning.bom.remarks'), '备注', 'remarks'],
  },
  importApi: (items: Partial<QmsPlanningApi.BomItem>[]) => {
    return importBomItems({
      items,
      projectId: currentProject.value?.id || '',
    });
  },
  onSuccess: () => {
    loadData();
  },
});

const workOrderSelectVisible = ref(false);

function handleCreateProject() {
  workOrderSelectVisible.value = true;
}

async function handleWorkOrderSelected(workOrderNumber: string) {
  try {
    await createBomProject({ workOrderNumber });
    message.success('已成功将工单添加到 BOM 策划列表');
    await loadData();
  } catch (error: unknown) {
    handleApiError(error, 'Create BOM Project');
    message.error((error as { message?: string })?.message || '添加失败');
  }
}

function getProjectWorkOrder(project: null | PlanningTreeNode) {
  return project?.workOrderNumber || '-';
}

function getProjectItemCount(project: null | PlanningTreeNode) {
  const count = project?.itemCount;
  return typeof count === 'number' ? count : 0;
}

function normalizeBomStatus(
  status?: string,
): QmsPlanningApi.BomProject['status'] {
  const value = String(status || '').toLowerCase();
  if (value === 'archived') return 'archived';
  if (value === 'draft') return 'draft';
  return 'active';
}

function toPlanningNode(row: BomRow): PlanningTreeNode {
  return {
    id: String(row.id || ''),
    name: String(row.partName || ''),
    parentId: row.parentId ? String(row.parentId) : null,
    status: 'active',
    workOrderNumber: currentProject.value?.workOrderNumber || '',
  };
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      {
        title: t('qms.planning.bom.partName'),
        field: 'partName',
        width: 200,
        fixed: 'left',
      },
      {
        title: t('qms.planning.bom.partNumber'),
        field: 'partNumber',
        width: 150,
      },
      {
        title: t('qms.planning.bom.material'),
        field: 'material',
        width: 150,
      },
      {
        title: t('qms.planning.bom.quantity'),
        field: 'quantity',
        width: 100,
        align: 'center',
      },
      {
        title: t('qms.planning.bom.unit'),
        field: 'unit',
        width: 100,
        align: 'center',
      },
      {
        title: t('qms.planning.bom.remarks'),
        field: 'remarks',
        minWidth: 200,
      },
      {
        title: t('common.action'),
        field: 'action',
        width: 120,
        fixed: 'right',
        align: 'center',
        slots: { default: 'action' },
      },
    ],
    proxyConfig: {
      ajax: {
        query: async () => {
          if (!currentProject.value?.id) return { items: [] };
          const { items } = await getBomListPage({
            projectId: currentProject.value.id,
          });
          return { items };
        },
      },
    },
    toolbarConfig: {
      refresh: true,
      zoom: true,
      custom: true,
      export: canExport.value,
      import: canImport.value,
    },
    importConfig: {
      remote: true,
      importMethod: handleImport,
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

gridApiProxy.value = gridApi;

// Avoid "datas.slice is not a function" error by ensuring grid reloads when project changes
watch(
  () => currentProject.value?.id,
  async (id) => {
    if (id) {
      await nextTick();
      try {
        gridApi.reload();
      } catch (error) {
        console.warn('Grid not ready for reload', error);
      }
    }
  },
);

onMounted(() => {
  loadData();
});
</script>

<template>
  <Page content-class="p-4 h-full">
    <div class="flex h-[calc(100vh-130px)] min-h-0 gap-4 overflow-hidden">
      <PlanningSidebar
        :title="t('qms.planning.bom.projectList')"
        :projects="filteredProjects"
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchText"
        auth-prefix="QMS:Planning:BOM"
        @change="handleTabChange"
        @create="handleCreateProject"
      >
        <template #actions="{ project }">
          <ProjectActionButtons
            :project="project"
            mode="dropdown"
            auth-prefix="QMS:Planning:BOM"
            @archive="handleArchiveProject"
            @delete="handleDeleteProject"
            @edit="openProjectModal('edit', project)"
          />
        </template>
        <template #projectInfo="{ project }">
          <div class="flex flex-col gap-0.5">
            <span
              >{{ t('qms.workOrder.workOrderNumber') }}:
              {{ getProjectWorkOrder(project) }}</span
            >
            <span class="text-[10px] opacity-70"
              >{{ getProjectItemCount(project) }}
              {{ t('qms.planning.bom.itemCountUnit') }}</span
            >
          </div>
        </template>
      </PlanningSidebar>

      <!-- Right Side: BOM Detail -->
      <div
        class="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <div v-if="currentProject" class="flex h-full flex-col overflow-hidden">
          <div
            class="flex items-center justify-between border-b border-gray-100 bg-gray-50/30 p-4"
          >
            <div>
              <h2 class="text-xl font-bold text-gray-800">
                {{ currentProject.name }}
              </h2>
              <div class="mt-1 flex items-center gap-3 text-xs text-gray-500">
                <span>
                  {{ t('qms.planning.bom.workOrderNo') }}:
                  <b class="text-gray-700">{{
                    getProjectWorkOrder(currentProject)
                  }}</b>
                </span>
                <span>
                  {{ t('qms.planning.bom.materialItems') }}:
                  <b class="text-blue-600">{{
                    getProjectItemCount(currentProject)
                  }}</b>
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button
                v-if="canCreate"
                type="primary"
                @click="openModal('create')"
              >
                + {{ t('qms.planning.bom.addItem') }}
              </Button>
            </div>
          </div>

          <div class="flex-1 overflow-hidden p-4">
            <Grid>
              <template #action="{ row }">
                <ProjectActionButtons
                  :project="toPlanningNode(row)"
                  mode="table"
                  auth-prefix="QMS:Planning:BOM"
                  :can-archive="false"
                  @delete="handleDeleteItem(toPlanningNode(row))"
                  @edit="openModal('edit', row)"
                />
              </template>
            </Grid>
          </div>
        </div>
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-400"
        >
          <Empty :description="t('qms.planning.common.selectProjectHint')" />
        </div>
      </div>
    </div>

    <BomEditModal
      v-model:open="modalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="initialFormData"
      :current-id="currentItemId"
      @success="loadData"
    />

    <WorkOrderSelectModal
      v-model:open="workOrderSelectVisible"
      @success="handleWorkOrderSelected"
    />

    <BomProjectModal
      v-model:open="projectModalVisible"
      :initial-data="projectInitialData"
      :project-id="projectInitialData?.id || null"
      @success="loadData"
    />
  </Page>
</template>
