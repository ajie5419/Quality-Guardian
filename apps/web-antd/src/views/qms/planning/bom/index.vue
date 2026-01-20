<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { useAccess } from '@vben/access';
import { Button, Empty, Table, Space, message, Modal } from 'ant-design-vue';

import {
  deleteBom,
  getBomTree,
} from '#/api/qms/planning';
import { updateWorkOrder, getWorkOrderList } from '#/api/qms/work-order';
import type { QmsPlanningApi } from '#/api/qms/planning';

// Shared
import PlanningSidebar from '../components/PlanningSidebar.vue';
import BomEditModal from './components/BomEditModal.vue';
import WorkOrderEditModal from '#/views/qms/work-order/components/WorkOrderEditModal.vue';
import { useProjectManager } from '../composables/useProjectManager';
import { getDeptList } from '#/api/system/dept';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:Planning:BOM:Delete']));

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
} = useProjectManager(allProjects);

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
  const newStatus = isArchived ? 'IN_PROGRESS' : 'COMPLETED';

  Modal.confirm({
    title: isArchived ? t('common.restore') : t('common.archive'),
    content: isArchived
      ? `${t('common.confirmRestoreContent')} "${proj.name}" ?`
      : `${t('common.confirmArchiveContent')} "${proj.name}" ?`,
    onOk: async () => {
      try {
        // 直接更新工单状态以实现归档，保持持久化一致性
        await updateWorkOrder(proj.id, { status: newStatus as any });
        message.success(isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'));
        
        if (selectedProjectId.value === proj.id) {
            selectedProjectId.value = null;
        }
        await loadData();
      } catch (err) {
        console.error('BOM Archive Error:', err);
        message.error(t('common.actionFailed'));
      }
    },
  });
}

// ================= Modal =================
const modalVisible = ref(false);
const isEditMode = ref(false);
const currentItemId = ref<string | null>(null);
const initialFormData = ref<any>({});
const woModalRef = ref();

function openModal(mode: 'create' | 'edit', row?: QmsPlanningApi.BomTreeNode) {
  isEditMode.value = mode === 'edit';
  currentItemId.value = row?.id || null;
  initialFormData.value = mode === 'edit' && row 
    ? { ...row, partName: row.name, workOrderNumber: row.parentId || currentProject.value?.id } 
    : { quantity: 1, unit: 'PCS', workOrderNumber: currentProject.value?.workOrderNumber || currentProject.value?.id };
  modalVisible.value = true;
}

function handleCreateProject() {
    console.log('BOM: handleCreateProject clicked');
    if (deptTreeData.value.length === 0) loadDepts();
    woModalRef.value?.open(undefined, deptTreeData.value);
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
      } catch (err) {
        message.error(t('common.actionFailed'));
      }
    },
  });
}

const columns = [
  { title: t('qms.planning.bom.partName'), dataIndex: 'name', minWidth: 150, fixed: 'left' },
  { title: t('qms.planning.bom.partNumber'), dataIndex: 'partNumber', width: 150 },
  { title: t('qms.planning.bom.material'), dataIndex: 'material', width: 150 },
  { title: t('qms.planning.bom.quantity'), dataIndex: 'quantity', width: 80, align: 'center' },
  { title: t('qms.planning.bom.unit'), dataIndex: 'unit', width: 80, align: 'center' },
  { title: t('qms.planning.bom.remarks'), dataIndex: 'remarks', minWidth: 150, ellipsis: true },
  { title: t('common.action'), key: 'action', width: 120, fixed: 'right' },
];

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
        v-model:selectedId="selectedProjectId"
        v-model:activeTab="activeTab"
        v-model:searchText="searchText"
        :show-create="true"
        @change="handleTabChange"
        @archive="handleArchive"
        @create="handleCreateProject"
      >
        <template #projectInfo="{ project }">
            <div class="flex flex-col gap-0.5">
                <span>{{ t('qms.workOrder.workOrderNumber') }}: {{ project.workOrderNumber }}</span>
                <span class="opacity-70 text-[10px]">{{ (project as any).itemCount }} {{ t('qms.planning.bom.itemCountUnit') }}</span>
            </div>
        </template>
      </PlanningSidebar>

      <!-- Right Side: BOM Detail -->
      <div class="flex flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div v-if="currentProject" class="flex h-full flex-col overflow-hidden">
          <div class="flex items-center justify-between border-b border-gray-100 bg-gray-50/30 p-4">
            <div>
              <h2 class="text-xl font-bold text-gray-800">{{ currentProject.name }}</h2>
              <div class="mt-1 text-xs text-gray-500">
                {{ t('qms.planning.bom.workOrderNo') }}: <b class="text-gray-700">{{ currentProject.workOrderNumber }}</b> | 
                {{ t('qms.planning.bom.materialItems') }}: <b class="text-blue-600">{{ (currentProject as any).itemCount }}</b>
              </div>
            </div>
            <Button v-if="canCreate" type="primary" @click="openModal('create')">
              + {{ t('qms.planning.bom.addItem') }}
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
                <template v-if="column.key === 'action'">
                  <Space>
                    <Button v-if="canEdit" type="link" size="small" @click="openModal('edit', record)">
                      {{ t('common.edit') }}
                    </Button>
                    <Button v-if="canDelete" type="link" size="small" danger @click="handleDeleteItem(record)">
                      {{ t('common.delete') }}
                    </Button>
                  </Space>
                </template>
              </template>
            </Table>
          </div>
        </div>
        <div v-else class="flex flex-1 flex-col items-center justify-center bg-gray-50/20 text-gray-300">
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

    <WorkOrderEditModal ref="woModalRef" @success="loadData" />
  </Page>
</template>
