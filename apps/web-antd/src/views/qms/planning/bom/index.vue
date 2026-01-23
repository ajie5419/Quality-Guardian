<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsPlanningApi } from '#/api/qms/planning';

import { computed, onMounted, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Empty,
  message,
  Modal,
  Space,
  Table,
  Tooltip,
} from 'ant-design-vue';

import {
  createBomProject,
  deleteBom,
  getBomTree,
  updateBomProject,
} from '#/api/qms/planning';
import { getDeptList } from '#/api/system/dept';
import { convertToTreeSelectData } from '#/types';

// Shared
import PlanningSidebar from '../components/PlanningSidebar.vue';
import WorkOrderSelectModal from '../components/WorkOrderSelectModal.vue';
import { useProjectManager } from '../composables/useProjectManager';
import BomEditModal from './components/BomEditModal.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Delete']));
const canExport = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Export']));

// ================= Data State =================
const allProjects = ref<QmsPlanningApi.BomTreeNode[]>([]);
const loading = ref(false);
const deptData = ref<any[]>([]);
const deptTreeData = ref<any[]>([]);

const {
  searchText,
  activeTab,
  selectedProjectId,
  filteredProjects,
  currentProject,
  handleTabChange,
} = useProjectManager(allProjects as any);

// ================= Methods =================

async function loadData() {
  loading.value = true;
  try {
    const data = await getBomTree();
    allProjects.value = data;
    if (data.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = data[0]?.id ?? null;
    }
  } catch {
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadDepts() {
  try {
    const data = await getDeptList();
    deptData.value = data;
    deptTreeData.value = convertToTreeSelectData(data);
  } catch {}
}

async function handleArchive(proj: QmsPlanningApi.BomTreeNode) {
  const isArchived = String(proj.status).toLowerCase() === 'archived';
  const newStatus = isArchived ? 'active' : 'archived';

  Modal.confirm({
    title: isArchived ? t('common.restore') : t('common.archive'),
    content: isArchived
      ? `${t('common.confirmRestoreContent')} "${proj.name}" ?`
      : `${t('common.confirmArchiveContent')} "${proj.name}" ?`,
    onOk: async () => {
      try {
        await updateBomProject(proj.id, { status: newStatus as any });
        message.success(
          isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'),
        );
        if (selectedProjectId.value === proj.id) {
          selectedProjectId.value = null;
        }
        await loadData();
      } catch (error) {
        console.error('BOM Archive Error:', error);
        message.error(t('common.actionFailed'));
      }
    },
  });
}

// ================= Modal =================
const modalVisible = ref(false);
const isEditMode = ref(false);
const currentItemId = ref<null | string>(null);
const initialFormData = ref<any>({});

function openModal(mode: 'create' | 'edit', row?: QmsPlanningApi.BomTreeNode) {
  isEditMode.value = mode === 'edit';
  currentItemId.value = row?.id || null;
  initialFormData.value =
    mode === 'edit' && row
      ? {
          ...row,
          partName: row.name,
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

const woSelectModalRef = ref();

function handleCreateProject() {
  woSelectModalRef.value?.open();
}

async function handleWorkOrderSelected(workOrderNumber: string) {
  try {
    await createBomProject({ workOrderNumber });
    message.success('已成功将工单添加到 BOM 策划列表');
    await loadData();
  } catch (error: any) {
    message.error(error.message || '添加失败');
  }
}

async function handleDeleteItem(row: QmsPlanningApi.BomTreeNode) {
  Modal.confirm({
    title: t('qms.planning.bom.deleteTitle'),
    content: t('qms.planning.bom.deleteContent', { name: row.name }),
    onOk: async () => {
      try {
        await deleteBom(row.id);
        message.success(t('common.deleteSuccess'));
        await loadData();
      } catch {
        message.error(t('common.actionFailed'));
      }
    },
  });
}

const gridOptions = computed<VxeGridProps>(() => ({
  columns: [
    {
      title: t('qms.planning.bom.partName'),
      dataIndex: 'name',
      width: 200,
      fixed: 'left',
    },
    {
      title: t('qms.planning.bom.partNumber'),
      dataIndex: 'partNumber',
      width: 150,
    },
    {
      title: t('qms.planning.bom.material'),
      dataIndex: 'material',
      width: 150,
    },
    {
      title: t('qms.planning.bom.quantity'),
      dataIndex: 'quantity',
      width: 100,
      align: 'center',
    },
    {
      title: t('qms.planning.bom.unit'),
      dataIndex: 'unit',
      width: 100,
      align: 'center',
    },
    {
      title: t('qms.planning.bom.remarks'),
      dataIndex: 'remarks',
      minWidth: 200,
      ellipsis: true,
    },
    {
      title: t('common.action'),
      key: 'action',
      width: 120,
      fixed: 'right',
      align: 'center',
    },
  ],
  toolbarConfig: {
    export: canExport.value,
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
}));

onMounted(() => {
  loadData();
  loadDepts();
});
</script>

<template>
  <Page content-class="p-4 h-full">
    <div class="flex h-full gap-4 overflow-hidden">
      <PlanningSidebar
        :title="t('qms.planning.bom.projectList')"
        :projects="filteredProjects"
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchText"
        auth-prefix="QMS:Planning:BOM"
        @change="handleTabChange"
        @archive="(proj: any) => handleArchive(proj)"
        @create="handleCreateProject"
      >
        <template #projectInfo="{ project }">
          <div class="flex flex-col gap-0.5">
            <span
              >{{ t('qms.workOrder.workOrderNumber') }}:
              {{ (project as any).workOrderNumber }}</span
            >
            <span class="text-[10px] opacity-70"
              >{{ (project as any).itemCount || 0 }}
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
              <div class="mt-1 text-xs text-gray-500">
                {{ t('qms.planning.bom.workOrderNo') }}:
                <b class="text-gray-700">{{
                  (currentProject as any).workOrderNumber
                }}</b>
                | {{ t('qms.planning.bom.materialItems') }}:
                <b class="text-blue-600">{{
                  (currentProject as any).itemCount || 0
                }}</b>
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
            <Table
              :columns="gridOptions.columns as any"
              :data-source="currentProject.children"
              :pagination="false"
              size="middle"
              row-key="id"
              :scroll="{ x: 1000, y: 'calc(100vh - 280px)' }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'action'">
                  <Space>
                    <Tooltip v-if="canEdit" :title="t('common.edit')">
                      <Button
                        type="link"
                        size="small"
                        @click="openModal('edit', record as any)"
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
          class="flex flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-300"
        >
          <Empty :description="t('qms.planning.bom.selectProjectHint')" />
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
      ref="woSelectModalRef"
      @success="handleWorkOrderSelected"
    />
  </Page>
</template>
