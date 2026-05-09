<script lang="ts" setup>
import type { PlanningTreeNode } from '../types';

import type { VxeGridListeners } from '#/adapter/vxe-table';
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
import { createVxePhotoXlsxExportMethod } from '#/utils/vxe-photo-export';

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
const bomItems = ref<BomRow[]>([]);
const selectedBomId = ref<null | string>(null);

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
      '图号',
      t('qms.planning.bom.partNumber'),
      '物料编码/图号',
      '图号',
      '物料编码',
      'partNumber',
      '图号/物料编码',
    ],
    requiredProcesses: [
      '所需检验工序',
      '部件需要的工序检验',
      '工序检验',
      '检验工序',
      'requiredProcesses',
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

function getInspectionProgress(row: BomRow) {
  return Array.isArray(row.inspectionProgress) ? row.inspectionProgress : [];
}

function getSelectedBomRow() {
  return bomItems.value.find((item) => item.id === selectedBomId.value) || null;
}

function getProgressSummary(row: BomRow) {
  const progress = getInspectionProgress(row);
  if (progress.length === 0) return '未设置所需工序';
  const completed = progress.filter((item) => item.completed).length;
  const pending = progress.length - completed;
  return `完成 ${completed}/${progress.length}，未完成 ${pending}`;
}

function getProgressExportText(row: BomRow) {
  const progress = getInspectionProgress(row);
  if (progress.length === 0) return '未设置所需工序';
  return progress
    .map(
      (item) =>
        `${item.processName}:${item.completed ? '已完成' : '未完成'} ${item.completedQuantity}/${item.requiredQuantity}`,
    )
    .join('\n');
}

function handleBomRowClick(row: BomRow) {
  selectedBomId.value = row.id || null;
}

const gridEvents: VxeGridListeners<BomRow> = {
  cellClick: ({ row }) => handleBomRowClick(row),
};

function handlePrint() {
  window.print();
}

const exportBomAsXlsx = createVxePhotoXlsxExportMethod<BomRow>({
  filename: () => `BOM明细-${Date.now()}.xlsx`,
  getPhotoUrl: () => '',
  getRows: async ({ mode, $table }) => {
    if (mode === 'selected') {
      return ($table.getCheckboxRecords?.() || []) as BomRow[];
    }
    if (mode === 'all' && currentProject.value?.id) {
      const { items } = await getBomListPage({
        projectId: currentProject.value.id,
      });
      return items;
    }
    return bomItems.value;
  },
  photoField: '__none__',
  sheetName: 'BOM明细',
});

const [Grid, gridApi] = useVbenVxeGrid({
  gridEvents,
  gridOptions: {
    columns: [
      {
        title: t('qms.planning.bom.partName'),
        field: 'partName',
        width: 200,
        fixed: 'left',
      },
      {
        title: '图号',
        field: 'partNumber',
        width: 150,
        sortable: true,
      },
      {
        title: t('qms.planning.bom.quantity'),
        field: 'quantity',
        width: 80,
        align: 'center',
      },
      {
        title: '检验进度',
        field: 'inspectionProgressText',
        minWidth: 260,
        slots: { default: 'inspectionProgress' },
        formatter: ({ row }: { row: BomRow }) => getProgressExportText(row),
      },
      {
        title: t('qms.planning.bom.unit'),
        field: 'unit',
        width: 80,
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
          bomItems.value = items;
          if (!items.some((item) => item.id === selectedBomId.value)) {
            selectedBomId.value = items[0]?.id || null;
          }
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
      remote: true,
      exportMethod: exportBomAsXlsx,
      types: ['xlsx', 'csv'],
      modes: ['current', 'selected', 'all'],
    },
    pagerConfig: {
      enabled: false,
    },
    height: 'auto',
    scrollX: { enabled: true, gt: 0 },
    scrollY: { enabled: true, gt: 0 },
    rowConfig: {
      isHover: true,
    },
    rowClassName: ({ row }: { row: BomRow }) =>
      row.id === selectedBomId.value ? 'bom-selected-row' : '',
  },
});

gridApiProxy.value = gridApi;

// Avoid "datas.slice is not a function" error by ensuring grid reloads when project changes
watch(
  () => currentProject.value?.id,
  async (id) => {
    if (id) {
      selectedBomId.value = null;
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
        <div
          v-if="currentProject"
          class="bom-print-area flex h-full flex-col overflow-hidden"
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
            <div class="bom-screen-actions flex items-center gap-2">
              <Button @click="handlePrint">打印</Button>
              <Button
                v-if="canCreate"
                type="primary"
                @click="openModal('create')"
              >
                + {{ t('qms.planning.bom.addItem') }}
              </Button>
            </div>
          </div>

          <div class="bom-screen-grid flex-1 p-4">
            <div class="bom-grid-shell">
              <Grid :grid-api="gridApi" :grid-events="gridEvents">
                <template #inspectionProgress="{ row }">
                  <div class="bom-progress-summary-cell">
                    {{ getProgressSummary(row) }}
                  </div>
                </template>
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
            <div class="bom-detail-panel">
              <template v-if="getSelectedBomRow()">
                <div class="bom-detail-header">
                  <div>
                    <div class="bom-detail-title">
                      {{ getSelectedBomRow()?.partName || '-' }}
                    </div>
                    <div class="bom-detail-meta">
                      图号：{{ getSelectedBomRow()?.partNumber || '-' }} /
                      数量：{{ getSelectedBomRow()?.quantity || 0 }}
                      {{ getSelectedBomRow()?.unit || '' }}
                    </div>
                  </div>
                  <div class="bom-detail-summary">
                    {{ getProgressSummary(getSelectedBomRow() as BomRow) }}
                  </div>
                </div>
                <table class="bom-detail-table">
                  <thead>
                    <tr>
                      <th>工序</th>
                      <th>状态</th>
                      <th>完成/需求</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in getInspectionProgress(
                        getSelectedBomRow() as BomRow,
                      )"
                      :key="`detail-${getSelectedBomRow()?.id}-${item.processName}`"
                    >
                      <td>{{ item.processName }}</td>
                      <td
                        :class="{
                          'bom-detail-status-done': item.completed,
                          'bom-detail-status-pending': !item.completed,
                        }"
                      >
                        {{ item.completed ? '已完成' : '未完成' }}
                      </td>
                      <td>
                        {{ item.completedQuantity }}/{{ item.requiredQuantity }}
                      </td>
                    </tr>
                    <tr
                      v-if="
                        getInspectionProgress(getSelectedBomRow() as BomRow)
                          .length === 0
                      "
                    >
                      <td colspan="3">未设置所需工序</td>
                    </tr>
                  </tbody>
                </table>
              </template>
              <Empty v-else description="请选择 BOM 条目查看检验工序" />
            </div>
          </div>
          <div class="bom-print-details">
            <div
              v-for="row in bomItems"
              :key="`print-${row.id}`"
              class="bom-print-item"
            >
              <div class="bom-print-title">
                <span>{{ row.partName || '-' }}</span>
                <span>图号：{{ row.partNumber || '-' }}</span>
                <span>数量：{{ row.quantity || 0 }} {{ row.unit || '' }}</span>
              </div>
              <table class="bom-print-progress-table">
                <thead>
                  <tr>
                    <th>工序</th>
                    <th>状态</th>
                    <th>完成/需求</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in getInspectionProgress(row)"
                    :key="`print-${row.id}-${item.processName}`"
                  >
                    <td>{{ item.processName }}</td>
                    <td>{{ item.completed ? '已完成' : '未完成' }}</td>
                    <td>
                      {{ item.completedQuantity }}/{{ item.requiredQuantity }}
                    </td>
                  </tr>
                  <tr v-if="getInspectionProgress(row).length === 0">
                    <td colspan="3">未设置所需工序</td>
                  </tr>
                </tbody>
              </table>
            </div>
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

<style scoped>
.bom-progress-summary-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 22px;
  color: #111827;
  white-space: nowrap;
}

.bom-print-details {
  display: none;
}

.bom-screen-grid {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
  min-height: 0;
}

.bom-grid-shell {
  min-height: 0;
  overflow: hidden;
}

.bom-detail-panel {
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.bom-detail-header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.bom-detail-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.bom-detail-meta,
.bom-detail-summary {
  font-size: 12px;
  color: #6b7280;
}

.bom-detail-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}

.bom-detail-table th,
.bom-detail-table td {
  padding: 6px 8px;
  text-align: left;
  border: 1px solid #e5e7eb;
}

.bom-detail-table th {
  font-weight: 600;
  color: #374151;
  background: #f9fafb;
}

.bom-detail-status-done {
  color: #047857;
}

.bom-detail-status-pending {
  color: #c2410c;
}

:deep(.bom-selected-row) {
  background-color: #eff6ff;
}

@media print {
  @page {
    margin: 10mm;
  }

  :global(html),
  :global(body),
  :global(#app) {
    height: auto !important;
    margin: 0 !important;
    overflow: visible !important;
  }

  :global(body *) {
    visibility: hidden !important;
  }

  .bom-print-area,
  .bom-print-area * {
    visibility: visible !important;
  }

  .bom-print-area {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    display: block !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    border: 0 !important;
  }

  .bom-print-area,
  .bom-print-area :deep(*) {
    background: #fff !important;
    box-shadow: none !important;
  }

  .bom-screen-grid,
  .bom-print-area :deep(.vxe-grid) {
    display: none !important;
  }

  .bom-print-details {
    display: block;
    padding: 8px 0 0;
  }

  .bom-print-item {
    margin-bottom: 12px;
    break-inside: avoid;
  }

  .bom-print-title {
    display: flex;
    gap: 16px;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
  }

  .bom-print-progress-table {
    width: 100%;
    font-size: 12px;
    border-collapse: collapse;
  }

  .bom-print-progress-table th,
  .bom-print-progress-table td {
    padding: 4px 8px;
    text-align: left;
    border: 1px solid #d1d5db;
  }

  .bom-print-progress-table th {
    background: #f3f4f6;
  }

  .bom-print-area :deep(.vxe-table--fixed-right-wrapper),
  .bom-print-area :deep(.vxe-toolbar),
  .bom-print-area :deep(.vxe-cell--checkbox),
  .bom-print-area :deep([colid='action']),
  .bom-screen-actions {
    display: none !important;
  }
}
</style>
