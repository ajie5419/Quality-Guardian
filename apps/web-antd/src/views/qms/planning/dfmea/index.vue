<script lang="ts" setup>
import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemUserApi } from '#/api/system/user';

import { computed, nextTick, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import {
  Button,
  Divider,
  Empty,
  message,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

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
import { useProjectManager } from '../composables/useProjectManager';
import DfmeaAssignModal from './components/DfmeaAssignModal.vue';
import DfmeaItemModal from './components/DfmeaItemModal.vue';
import DfmeaProjectModal from './components/DfmeaProjectModal.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

const canCreate = computed(() =>
  hasAccessByCodes(['QMS:Planning:DFMEA:Create']),
);
const canEdit = computed(() => hasAccessByCodes(['QMS:Planning:DFMEA:Edit']));
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Planning:DFMEA:Delete']),
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
} = useProjectManager(allProjects as any);

const userList = ref<SystemUserApi.User[]>([]);

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
  } catch (error) {
    console.error('DFMEA Load Error:', error);
  } finally {
    loading.value = false;
  }
}

async function handleSuccess(id?: string) {
  await nextTick();
  if (id) {
    activeTab.value = ProjectStatusEnum.ACTIVE;
  }
  await loadData(id);
}

async function handleArchive(proj: QmsPlanningApi.DfmeaTreeNode) {
  if (!proj?.id) return;
  const isArchived = String(proj.status).toLowerCase() === 'archived';
  const newStatus = isArchived ? 'active' : 'archived';

  Modal.confirm({
    title: isArchived ? t('common.restore') : t('common.archive'),
    content: isArchived
      ? `${t('common.confirmRestoreContent')} "${proj.name}" ?`
      : `${t('common.confirmArchiveContent')} "${proj.name}" ?`,
    onOk: async () => {
      try {
        await updateDfmeaProject(proj.id, {
          ...proj,
          status: newStatus as any,
        });
        message.success(
          isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'),
        );
        if (selectedProjectId.value === proj.id) {
          selectedProjectId.value = null;
        }
        await loadData();
      } catch {
        message.error(t('common.actionFailed'));
      }
    },
  });
}

async function handleDeleteProject(proj: QmsPlanningApi.DfmeaTreeNode) {
  if (!proj?.id) return;
  Modal.confirm({
    title: t('qms.planning.itp.deleteProjectTitle'),
    content: t('qms.planning.itp.deleteProjectContent', { name: proj.name }),
    onOk: async () => {
      try {
        await deleteDfmeaProject(proj.id);
        message.success(t('common.deleteSuccess'));
        if (selectedProjectId.value === proj.id) selectedProjectId.value = null;
        await loadData();
      } catch {
        message.error(t('common.actionFailed'));
      }
    },
  });
}

async function handleDeleteItem(record: QmsPlanningApi.DfmeaTreeNode) {
  if (!record?.id) return;
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk: async () => {
      try {
        await deleteDfmea(record.id);
        message.success(t('common.deleteSuccess'));
        await loadData();
      } catch {
        message.error(t('common.actionFailed'));
      }
    },
  });
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

function handleDispatch(proj: QmsPlanningApi.DfmeaTreeNode) {
  if (!proj) return;
  assignTarget.value = { id: proj.id, name: proj.name };
  assignModalVisible.value = true;
  if (userList.value.length === 0) loadUsers();
}

const columns: any[] = [
  {
    title: t('qms.planning.dfmea.item'),
    dataIndex: 'name',
    key: 'name',
    width: 150,
    fixed: 'left',
  },
  {
    title: t('qms.planning.dfmea.failureMode'),
    dataIndex: 'failureMode',
    width: 150,
  },
  { title: t('qms.planning.dfmea.effects'), dataIndex: 'effects', width: 200 },
  {
    title: t('qms.planning.dfmea.severity'),
    dataIndex: 'severity',
    width: 50,
    align: 'center',
  },
  {
    title: t('qms.planning.dfmea.occurrence'),
    dataIndex: 'occurrence',
    width: 50,
    align: 'center',
  },
  {
    title: t('qms.planning.dfmea.detection'),
    dataIndex: 'detection',
    width: 50,
    align: 'center',
  },
  {
    title: t('qms.planning.dfmea.rpn'),
    key: 'rpn',
    width: 80,
    align: 'center',
  },
  {
    title: t('common.action'),
    key: 'action',
    width: 120,
    fixed: 'right' as any,
  },
];

onMounted(async () => {
  await loadWorkOrders();
  await loadData();
});
</script>

<template>
  <Page content-class="p-4 h-full">
    <div class="flex h-full gap-4 overflow-hidden">
      <PlanningSidebar
        :title="t('qms.planning.dfmea.projectList')"
        :projects="filteredProjects"
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchText"
        show-dispatch
        auth-prefix="QMS:Planning:DFMEA"
        @change="handleTabChange"
        @archive="(proj: any) => handleArchive(proj)"
        @dispatch="(proj: any) => handleDispatch(proj)"
        @create="openProjectModal('create')"
      />

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
                <span
                  >{{ t('qms.planning.bom.workOrderNo') }}:
                  <b class="text-gray-700">{{
                    currentProject.workOrderNumber || '-'
                  }}</b></span
                >
                <Divider type="vertical" />
                <Button
                  v-if="canEdit"
                  type="link"
                  size="small"
                  class="h-auto p-0"
                  @click="openProjectModal('edit', currentProject as any)"
                >
                  {{ t('common.edit') }}
                </Button>
                <Button
                  v-if="canDelete"
                  type="link"
                  danger
                  size="small"
                  class="h-auto p-0"
                  @click="handleDeleteProject(currentProject as any)"
                >
                  {{ t('common.delete') }}
                </Button>
              </div>
            </div>
            <Button
              v-if="canCreate"
              type="primary"
              @click="openItemModal('create')"
            >
              + {{ t('common.add') }}
            </Button>
          </div>
          <div class="flex-1 overflow-hidden p-4">
            <Table
              :columns="columns"
              :data-source="currentProject.children"
              :pagination="false"
              size="middle"
              row-key="id"
              :scroll="{ y: 'calc(100vh - 300px)' }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'rpn'">
                  <Tag :color="(record.rpn || 0) > 100 ? 'red' : 'green'">{{
                    record.rpn || 0
                  }}</Tag>
                </template>
                <template v-if="column.key === 'action'">
                  <Space>
                    <Tooltip v-if="canEdit" :title="t('common.edit')">
                      <Button
                        type="link"
                        size="small"
                        @click="openItemModal('edit', record as any)"
                      >
                        <IconifyIcon icon="lucide:edit" class="size-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip v-if="canDelete" :title="t('common.delete')">
                      <Button
                        type="link"
                        size="small"
                        danger
                        @click="handleDeleteItem(record as any)"
                      >
                        <IconifyIcon icon="lucide:trash-2" class="size-4" />
                      </Button>
                    </Tooltip>
                  </Space>
                </template>
              </template>
            </Table>
          </div>
        </div>
        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-400"
        >
          <Empty :description="t('qms.planning.dfmea.selectProjectHint')" />
        </div>
      </div>
    </div>

    <DfmeaProjectModal
      v-model:open="projectModalVisible"
      :is-edit-mode="projectEditMode"
      :initial-data="projectInitialData"
      :work-order-list="workOrderList"
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
  </Page>
</template>
