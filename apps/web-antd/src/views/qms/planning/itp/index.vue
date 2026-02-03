<script lang="ts" setup>
import type { PlanningTreeNode } from '../types';

import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemUserApi } from '#/api/system/user';

import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Button, Empty, message, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { ProjectStatusEnum } from '#/api/qms/enums';
import {
  deleteItp,
  deleteItpProject,
  getItpTree,
  updateItpProject,
} from '#/api/qms/planning';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getUserList } from '#/api/system/user';

// Shared
import PlanningSidebar from '../components/PlanningSidebar.vue';
import ProjectActionButtons from '../components/ProjectActionButtons.vue';
import { useProjectActions } from '../composables/useProjectActions';
import { useProjectManager } from '../composables/useProjectManager';
import { CONTROL_POINT_MAP } from '../constants';
import ItpAssignModal from './components/ItpAssignModal.vue';
import ItpItemModal from './components/ItpItemModal.vue';
import ItpProjectModal from './components/ItpProjectModal.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const router = useRouter();

const canCreate = computed(() => hasAccessByCodes(['QMS:Planning:ITP:Create']));
const canExport = computed(() => hasAccessByCodes(['QMS:Planning:ITP:Export']));

// ================= Data State =================
const allProjects = ref<QmsPlanningApi.ItpTreeNode[]>([]);
const workOrderList = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
const userList = ref<SystemUserApi.User[]>([]);
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
async function loadData(idToSelect?: string) {
  loading.value = true;
  try {
    const data = await getItpTree();
    // 补全工单编号
    const enrichedData = (data || []).map((node) => {
      if (node.workOrderId && !node.workOrderNumber) {
        const wo = workOrderList.value.find(
          (w: any) =>
            w.id === node.workOrderId || w.workOrderNumber === node.workOrderId,
        );
        if (wo) return { ...node, workOrderNumber: wo.workOrderNumber };
      }
      return node;
    });

    allProjects.value = enrichedData;

    // 智能定位
    if (idToSelect) {
      selectedProjectId.value = idToSelect;
    } else if (enrichedData.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = enrichedData[0]?.id ?? null;
    }
    await nextTick();
    try {
      gridApi.reload();
    } catch (error) {
      console.warn('Grid not ready for reload', error);
    }
  } catch (error) {
    console.error('ITP Load Error:', error);
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

const { handleArchiveProject, handleDeleteProject, handleDeleteItem } =
  useProjectActions<any>({
    archiveProject: async (id, status, project) => {
      await updateItpProject(id, {
        ...(project as any),
        status: status as any,
      });
    },
    deleteItem: async (id, projectId) => {
      await deleteItp(id, projectId!);
    },
    deleteProject: async (id) => {
      await deleteItpProject(id);
    },
    loadData,
    resetSelectionOnDelete: true,
    selectedProjectId,
    passFullProjectOnArchive: true,
  });

function handleGoToGenerator() {
  router.push('/qms/planning/itp-generator');
}

async function handleSuccess(id?: string) {
  await nextTick();
  // 关键修复：切换 Tab 会触发过滤器更新，如果 id 匹配新 Tab 下的内容，则能显示
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
  proj?: QmsPlanningApi.ItpTreeNode,
) {
  projectEditMode.value = mode === 'edit';
  projectInitialData.value =
    mode === 'edit' && proj
      ? {
          projectName: proj.name,
          workOrderId: proj.workOrderId,
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
  item?: QmsPlanningApi.ItpTreeNode,
) {
  itemEditMode.value = mode === 'edit';
  currentItemId.value = item?.id || null;
  itemInitialData.value =
    mode === 'edit' && item
      ? { ...item }
      : {
          processStep: '组对',
          controlPoint: 'W',
          isQuantitative: false,
          frequency: '100%',
        };
  itemModalVisible.value = true;
}

const assignModalVisible = ref(false);
const assignTarget = ref({ id: '', name: '' });

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
        title: t('qms.planning.itp.processStep'),
        field: 'processStep',
        width: 120,
        fixed: 'left',
      },
      {
        title: t('qms.planning.itp.activity'),
        field: 'activity',
        width: 150,
      },
      {
        title: t('qms.planning.itp.controlPoint.label'),
        field: 'controlPoint',
        width: 80,
        align: 'center',
        slots: { default: 'controlPoint' },
      },
      {
        title: t('qms.planning.itp.criteria'),
        field: 'acceptanceCriteria',
        width: 200,
      },
      {
        title: t('qms.planning.itp.frequency'),
        field: 'frequency',
        width: 100,
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
    <div class="flex h-[calc(100vh-130px)] min-h-0 gap-4 overflow-hidden">
      <PlanningSidebar
        :title="t('qms.planning.itp.overview')"
        :projects="filteredProjects"
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchText"
        auth-prefix="QMS:Planning:ITP"
        @change="handleTabChange"
        @create="openProjectModal('create')"
      >
        <template #actions="{ project }">
          <ProjectActionButtons
            :project="project"
            mode="dropdown"
            auth-prefix="QMS:Planning:ITP"
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
                    currentProject.workOrderNumber || '-'
                  }}</b>
                </span>
                <span>
                  {{ t('qms.planning.itp.stepCount') }}:
                  <b class="text-blue-600">{{
                    currentProject.children?.length || 0
                  }}</b>
                </span>
                <span>
                  {{ t('qms.planning.bom.version') }}:
                  <b class="text-orange-600">{{
                    (currentProject as any).version || 'v1.0'
                  }}</b>
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button
                v-if="canCreate"
                type="dashed"
                @click="handleGoToGenerator"
              >
                <span class="i-lucide-sparkles mr-1"></span> AI 生成
              </Button>
              <Button
                v-if="canCreate"
                type="primary"
                @click="openItemModal('create')"
              >
                + {{ t('qms.planning.itp.addStep') }}
              </Button>
            </div>
          </div>

          <div class="flex-1 overflow-hidden p-4">
            <Grid>
              <template #controlPoint="{ row }">
                <Tag
                  :color="(CONTROL_POINT_MAP as any)[row.controlPoint]?.color"
                >
                  {{ row.controlPoint }}
                </Tag>
              </template>
              <template #action="{ row }">
                <ProjectActionButtons
                  :project="row as any"
                  mode="table"
                  auth-prefix="QMS:Planning:ITP"
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

    <ItpProjectModal
      v-model:open="projectModalVisible"
      :is-edit-mode="projectEditMode"
      :initial-data="projectInitialData"
      :selected-project-id="selectedProjectId"
      @success="handleSuccess"
    />

    <ItpItemModal
      v-model:open="itemModalVisible"
      :is-edit-mode="itemEditMode"
      :initial-data="itemInitialData"
      :current-item-id="currentItemId"
      :selected-project-id="selectedProjectId"
      @success="handleSuccess"
    />

    <ItpAssignModal
      v-model:open="assignModalVisible"
      :user-list="userList"
      :target-id="assignTarget.id"
      :target-name="assignTarget.name"
      @success="handleSuccess"
    />
  </Page>
</template>
