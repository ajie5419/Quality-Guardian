<script lang="ts" setup>
import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemUserApi } from '#/api/system/user';

import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
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
} from 'ant-design-vue';

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
import { useProjectManager } from '../composables/useProjectManager';
import { CONTROL_POINT_MAP } from '../constants';
import ItpAssignModal from './components/ItpAssignModal.vue';
import ItpItemModal from './components/ItpItemModal.vue';
import ItpProjectModal from './components/ItpProjectModal.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const router = useRouter();

const canCreate = computed(() => hasAccessByCodes(['QMS:Planning:ITP:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:Planning:ITP:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:Planning:ITP:Delete']));

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
} = useProjectManager(allProjects as any);

// ================= Methods =================
async function loadData(idToSelect?: string) {
  loading.value = true;
  try {
    const data = await getItpTree();
    // 补全工单编号
    const enrichedData = (data || []).map((node) => {
      if (node.workOrderId && !node.workOrderNumber) {
        const wo = workOrderList.value.find(
          (w) =>
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
  } catch (error) {
    console.error('ITP Load Error:', error);
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

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

async function handleArchive(proj: QmsPlanningApi.ItpTreeNode) {
  if (!proj?.id) return;
  const isArchived = proj.status === ProjectStatusEnum.ARCHIVED;
  const newStatus = isArchived
    ? ProjectStatusEnum.ACTIVE
    : ProjectStatusEnum.ARCHIVED;

  Modal.confirm({
    title: isArchived ? t('common.restore') : t('common.archive'),
    content: isArchived
      ? `${t('common.confirmRestoreContent')} "${proj.name}" ?`
      : `${t('common.confirmArchiveContent')} "${proj.name}" ?`,
    onOk: async () => {
      try {
        // 关键修复：传递现有对象数据，防止后端 Prisma 校验必填项(如 quantity)报错
        await updateItpProject(proj.id, {
          ...proj,
          status: newStatus as any,
        });
        message.success(
          isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'),
        );

        // 归档后，如果当前项已不在当前 Tab，清除选中
        if (selectedProjectId.value === proj.id) {
          selectedProjectId.value = null;
        }
        await loadData();
      } catch (error) {
        console.error('Archive Error:', error);
        message.error(t('common.actionFailed'));
      }
    },
  });
}

async function handleDeleteProject(proj: QmsPlanningApi.ItpTreeNode) {
  if (!proj?.id) return;
  Modal.confirm({
    title: t('qms.planning.itp.deleteProjectTitle'),
    content: t('qms.planning.itp.deleteProjectContent', { name: proj.name }),
    onOk: async () => {
      try {
        await deleteItpProject(proj.id);
        message.success(t('common.deleteSuccess'));
        if (selectedProjectId.value === proj.id) selectedProjectId.value = null;
        await loadData();
      } catch {
        message.error(t('common.actionFailed'));
      }
    },
  });
}

async function handleDeleteItem(record: QmsPlanningApi.ItpTreeNode) {
  if (!record?.id || !selectedProjectId.value) return;
  Modal.confirm({
    title: t('qms.planning.itp.deleteStepTitle'),
    content: t('qms.planning.itp.deleteStepContent', {
      activity: record.activity || record.name,
    }),
    onOk: async () => {
      try {
        await deleteItp(record.id, selectedProjectId.value!);
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

function handleDispatch(proj: QmsPlanningApi.ItpTreeNode) {
  if (!proj) return;
  assignTarget.value = { id: proj.id, name: proj.name };
  assignModalVisible.value = true;
  if (userList.value.length === 0) loadUsers();
}

const columns = computed<any[]>(() => [
  {
    title: t('qms.planning.itp.processStep'),
    dataIndex: 'processStep',
    width: 120,
    fixed: 'left' as any,
  },
  {
    title: t('qms.planning.itp.activity'),
    dataIndex: 'activity',
    width: 150,
    ellipsis: true,
  },
  {
    title: t('qms.planning.itp.controlPoint.label'),
    key: 'controlPoint',
    width: 80,
    align: 'center',
  },
  {
    title: t('qms.planning.itp.criteria'),
    dataIndex: 'acceptanceCriteria',
    width: 200,
  },
  {
    title: t('qms.planning.itp.frequency'),
    dataIndex: 'frequency',
    width: 100,
  },
  {
    title: t('common.action'),
    key: 'action',
    width: 120,
    fixed: 'right' as any,
  },
]);

onMounted(async () => {
  await loadWorkOrders();
  await loadData();
});
</script>

<template>
  <Page content-class="p-4 h-full">
    <div class="flex h-full gap-4 overflow-hidden">
      <PlanningSidebar
        :title="t('qms.planning.itp.overview')"
        :projects="filteredProjects"
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchText"
        show-dispatch
        auth-prefix="QMS:Planning:ITP"
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
            <Space>
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
            </Space>
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
                <template v-if="column.key === 'controlPoint'">
                  <Tag
                    :color="
                      (CONTROL_POINT_MAP as any)[record.controlPoint]?.color
                    "
                  >
                    {{ record.controlPoint }}
                  </Tag>
                </template>
                <template v-if="column.key === 'action'">
                  <Space>
                    <Button
                      v-if="canEdit"
                      type="link"
                      size="small"
                      @click="openItemModal('edit', record as any)"
                      >{{ t('common.edit') }}</Button
                    >
                    <Button
                      v-if="canDelete"
                      type="link"
                      size="small"
                      danger
                      @click="handleDeleteItem(record as any)"
                      >{{ t('common.delete') }}</Button
                    >
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
          <Empty :description="t('qms.planning.itp.selectProjectHint')" />
        </div>
      </div>
    </div>

    <ItpProjectModal
      v-model:open="projectModalVisible"
      :is-edit-mode="projectEditMode"
      :initial-data="projectInitialData"
      :work-order-list="workOrderList"
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
