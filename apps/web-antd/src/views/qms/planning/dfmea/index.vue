<script lang="ts" setup>
import type { PlanningTreeNode } from '../types';

import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemUserApi } from '#/api/system/user';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, Empty, Tag } from 'ant-design-vue';

import ErrorBoundary from '#/components/ErrorBoundary.vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { ProjectStatusEnum } from '#/api/qms/enums';
import {
  deleteDfmea,
  deleteDfmeaProject,
  getDfmeaTree,
  updateDfmeaProject,
} from '#/api/qms/planning';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getUserList } from '#/api/system/user';

// Shared
import PlanningSidebar from '../components/PlanningSidebar.vue';
import ProjectActionButtons from '../components/ProjectActionButtons.vue';
import { useProjectActions } from '../composables/useProjectActions';
import { useProjectManager } from '../composables/useProjectManager';
import DfmeaAssignModal from './components/DfmeaAssignModal.vue';
import DfmeaItemModal from './components/DfmeaItemModal.vue';
import DfmeaProjectModal from './components/DfmeaProjectModal.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

const canCreate = computed(() =>
  hasAccessByCodes(['QMS:Planning:DFMEA:Create']),
);
const canExport = computed(() =>
  hasAccessByCodes(['QMS:Planning:DFMEA:Export']),
);

// ================= Data State =================
const allProjects = ref<QmsPlanningApi.DfmeaTreeNode[]>([]);
const workOrderList = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
const loading = ref(false);

const {
  searchText,
  activeTab,
  selectedProjectId,
  filteredProjects,
  currentProject,
  handleTabChange,
} = useProjectManager(allProjects);

const userList = ref<SystemUserApi.User[]>([]);

// ================= Composables =================

// ================= Methods =================
async function loadData(idToSelect?: string) {
  loading.value = true;
  try {
    const data = await getDfmeaTree();
    allProjects.value = data;

    if (idToSelect) {
      selectedProjectId.value = idToSelect;
      if (activeTab.value !== ProjectStatusEnum.ACTIVE) {
        activeTab.value = ProjectStatusEnum.ACTIVE;
      }
    } else if (data.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = data[0]?.id ?? null;
    }
    await nextTick();
    try {
      gridApi.reload();
    } catch (error) {
      console.warn('Grid not ready for reload', error);
    }
  } catch (error) {
    console.error('DFMEA Load Error:', error);
  } finally {
    loading.value = false;
  }
}

const { handleArchiveProject, handleDeleteProject, handleDeleteItem } =
  useProjectActions<any>({
    archiveProject: async (id, status) => {
      await updateDfmeaProject(id, { status: status as any });
    },
    deleteItem: async (id) => {
      await deleteDfmea(id);
    },
    deleteProject: async (id) => {
      await deleteDfmeaProject(id);
    },
    loadData,
    resetSelectionOnDelete: true,
    selectedProjectId,
  });

async function handleSuccess(id?: string) {
  await nextTick();
  if (id) {
    activeTab.value = ProjectStatusEnum.ACTIVE;
  }
  await loadData(id);
}

async function loadWorkOrders() {
  try {
    const res = await getWorkOrderList();
    workOrderList.value = res.items || [];
  } catch {}
}

async function loadUsers() {
  try {
    const res = await getUserList();
    userList.value = (res as any).items || [];
  } catch {}
}

// ================= Modals =================
const projectModalVisible = ref(false);
const projectEditMode = ref(false);
const projectInitialData = ref({});

function openProjectModal(
  mode: 'create' | 'edit',
  proj?: QmsPlanningApi.DfmeaTreeNode,
) {
  projectEditMode.value = mode === 'edit';
  projectInitialData.value =
    mode === 'edit' && proj
      ? {
          projectName: proj.name,
          workOrderId: (proj as any).workOrderNumber,
          version: proj.version,
          status: proj.status,
        }
      : { version: 'V1.0', status: 'active' };
  projectModalVisible.value = true;
  if (workOrderList.value.length === 0) loadWorkOrders();
}

const itemModalVisible = ref(false);
const itemEditMode = ref(false);
const currentItemId = ref<null | string>(null);
const itemInitialData = ref({});

function openItemModal(
  mode: 'create' | 'edit',
  item?: QmsPlanningApi.DfmeaTreeNode,
) {
  itemEditMode.value = mode === 'edit';
  currentItemId.value = item?.id || null;
  itemInitialData.value = mode === 'edit' && item ? { ...item } : {};
  itemModalVisible.value = true;
}

const assignModalVisible = ref(false);
const assignTarget = ref<{ id: string; name: string }>({ id: '', name: '' });

function handleDispatch(proj: PlanningTreeNode) {
  if (!proj) return;
  assignTarget.value = { id: proj.id, name: proj.name };
  assignModalVisible.value = true;
  if (userList.value.length === 0) loadUsers();
}

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [
      {
        title: t('qms.planning.dfmea.item'),
        field: 'name',
        width: 150,
        fixed: 'left',
      },
      {
        title: t('qms.planning.dfmea.failureMode'),
        field: 'failureMode',
        width: 150,
      },
      {
        title: t('qms.planning.dfmea.effects'),
        field: 'effects',
        width: 200,
      },
      {
        title: t('qms.planning.dfmea.severity'),
        field: 'severity',
        width: 50,
        align: 'center',
      },
      {
        title: t('qms.planning.dfmea.occurrence'),
        field: 'occurrence',
        width: 50,
        align: 'center',
      },
      {
        title: t('qms.planning.dfmea.detection'),
        field: 'detection',
        width: 50,
        align: 'center',
      },
      {
        title: t('qms.planning.dfmea.rpn'),
        field: 'rpn',
        width: 80,
        align: 'center',
        slots: { default: 'rpn' },
      },
      {
        title: t('common.action'),
        field: 'action',
        width: 120,
        fixed: 'right',
        slots: { default: 'action' },
      },
    ],
    proxyConfig: {
      ajax: {
        query: async () => {
          return { items: currentProject.value?.children || [] };
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

onMounted(async () => {
  await loadWorkOrders();
  await loadData();
});
</script>

<template>
  <Page content-class="p-4 h-full">
    <ErrorBoundary>
      <div class="flex h-[calc(100vh-130px)] min-h-0 gap-4 overflow-hidden">
        <PlanningSidebar
          :title="t('qms.planning.dfmea.projectList')"
          :projects="filteredProjects"
          v-model:selected-id="selectedProjectId"
          v-model:active-tab="activeTab"
          v-model:search-text="searchText"
          auth-prefix="QMS:Planning:DFMEA"
          @change="handleTabChange"
          @create="openProjectModal('create')"
        >
          <template #actions="{ project }">
            <ProjectActionButtons
              :project="project"
              mode="dropdown"
              auth-prefix="QMS:Planning:DFMEA"
              :can-dispatch="true"
              @archive="handleArchiveProject"
              @delete="handleDeleteProject"
              @edit="openProjectModal('edit', project as any)"
              @dispatch="handleDispatch"
            />
          </template>
        </PlanningSidebar>

        <div
          class="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          <div
            v-if="currentProject"
            class="flex h-full flex-col overflow-hidden"
          >
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
                      currentProject.workOrderNumber || '-'
                    }}</b>
                  </span>
                  <span>
                    {{ t('qms.planning.dfmea.itemCount') }}:
                    <b class="text-blue-600">{{
                      currentProject.children?.length || 0
                    }}</b>
                  </span>
                  <span>
                    {{ t('qms.planning.bom.version') }}:
                    <b class="text-orange-600">{{
                      currentProject.version || 'V1.0'
                    }}</b>
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  v-if="canCreate"
                  type="primary"
                  @click="openItemModal('create')"
                >
                  + {{ t('common.add') }}
                </Button>
              </div>
            </div>
            <div class="flex-1 overflow-hidden p-4">
              <Grid>
                <template #rpn="{ row }">
                  <Tag :color="(row.rpn || 0) > 100 ? 'red' : 'green'">
                    {{ row.rpn || 0 }}
                  </Tag>
                </template>
                <template #action="{ row }">
                  <ProjectActionButtons
                    :project="row as any"
                    mode="table"
                    auth-prefix="QMS:Planning:DFMEA"
                    :can-archive="false"
                    @delete="handleDeleteItem(row as any)"
                    @edit="openItemModal('edit', row as any)"
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

      <DfmeaProjectModal
        v-model:open="projectModalVisible"
        :is-edit-mode="projectEditMode"
        :initial-data="projectInitialData"
        :selected-project-id="selectedProjectId"
        @success="handleSuccess"
      />

      <DfmeaItemModal
        v-model:open="itemModalVisible"
        :is-edit-mode="itemEditMode"
        :initial-data="itemInitialData"
        :selected-project-id="selectedProjectId"
        :current-item-id="currentItemId"
        @success="loadData"
      />

      <DfmeaAssignModal
        v-model:open="assignModalVisible"
        :user-list="userList"
        :target-id="assignTarget.id"
        :target-name="assignTarget.name"
        @success="handleSuccess"
      />
    </ErrorBoundary>
  </Page>
</template>
