<script lang="ts" setup>
import type { InspectionDocItem } from '../types';

import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import { Card, message, Modal, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getInspectionRecords } from '#/api/qms/inspection';
import { getWorkOrderList, updateWorkOrder } from '#/api/qms/work-order';

import PlanningSidebar from '../components/PlanningSidebar.vue';

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

const canExport = computed(() =>
  hasAccessByCodes(['QMS:Planning:ProjectDocs:Export']),
);

// ================= Left Column: Project List =================
const projectList = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
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
    const res = await getWorkOrderList();
    projectList.value = res.items || [];
    if (projectList.value.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = projectList.value[0]?.id || null;
    }
  } finally {
    isProjectsLoading.value = false;
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

async function handleArchiveProject(project: any) {
  const isArchived = isArchivedStatus(project.status);
  const newStatus = isArchived ? 'IN_PROGRESS' : 'COMPLETED';

  Modal.confirm({
    title: isArchived ? t('common.restore') : t('common.archive'),
    content: isArchived
      ? `${t('common.confirmRestoreContent')} "${project.projectName || project.name}" ?`
      : `${t('common.confirmArchiveContent')} "${project.projectName || project.name}" ?`,
    onOk: async () => {
      try {
        // 修复 Prisma 报错：传递完整对象以满足 quantity 等必填项校验
        await updateWorkOrder(project.id, {
          ...project,
          status: newStatus,
        });
        message.success(
          isArchived ? t('common.restoreSuccess') : t('common.archiveSuccess'),
        );

        if (selectedProjectId.value === project.id) {
          selectedProjectId.value = null;
        }
        await loadProjects();
      } catch (error) {
        console.error('Archive Work Order Error:', error);
        message.error(t('common.actionFailed'));
      }
    },
  });
}

// ================= Right Column: Documents =================
const gridOptions = computed(() => ({
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
      title: '资料情况',
      width: 100,
      slots: { default: 'status' },
    },
    {
      field: 'reportDate',
      title: t('qms.inspection.issues.reportDate'),
      width: 120,
    },
  ],
  minHeight: 500,
  toolbarConfig: { export: canExport.value },
  proxyConfig: {
    autoLoad: false,
    ajax: {
      query: async ({ page }: any) => {
        if (!selectedProject.value) return { items: [], total: 0 };
        try {
          const res = await getInspectionRecords();
          const filtered: InspectionDocItem[] = (res as any[])
            .filter((item) => {
              const pName = selectedProject.value?.projectName;
              const wNum = selectedProject.value?.workOrderNumber;
              return (
                (pName &&
                  item.projectName &&
                  item.projectName.includes(pName)) ||
                (wNum &&
                  item.workOrderNumber &&
                  item.workOrderNumber.includes(wNum))
              );
            })
            .map((item) => {
              const recordType = item.category || item.type;
              let displayCategory = t('common.other');
              switch (recordType) {
                case 'FINAL': {
                  displayCategory = '成品检验';
                  break;
                }
                case 'INCOMING': {
                  displayCategory =
                    item.incomingType ||
                    t('qms.inspection.records.tab.incoming');
                  break;
                }
                case 'PROCESS': {
                  displayCategory =
                    item.process || t('qms.inspection.records.tab.process');
                  break;
                }
                default: {
                  if (recordType) displayCategory = recordType;
                }
              }

              return {
                id: item.id,
                category: displayCategory,
                name:
                  item.materialName ||
                  item.componentName ||
                  item.partName ||
                  '未命名',
                inspector: item.inspector || item.reporter || '-',
                supplier: item.supplierName || item.team || '-',
                status: item.status || '已归档',
                reportDate: item.reportDate || item.createTime || '-',
              };
            });
          const { pageSize, currentPage } = page;
          return {
            items: filtered.slice(
              (currentPage - 1) * pageSize,
              currentPage * pageSize,
            ),
            total: filtered.length,
          };
        } catch {
          return { items: [], total: 0 };
        }
      },
    },
  },
}));

const [Grid, gridApi] = useVbenVxeGrid({ gridOptions: gridOptions as any });

watch(selectedProject, () => gridApi.reload());
onMounted(() => loadProjects());
</script>

<template>
  <Page>
    <div class="flex h-full gap-4 overflow-hidden p-4">
      <!-- Left: Project List -->
      <PlanningSidebar
        :title="t('qms.planning.bom.projectList')"
        :projects="
          filteredProjects.map((p) => ({
            ...p,
            name: p.projectName || (p as any).name,
            status: isArchivedStatus(p.status as string)
              ? 'archived'
              : 'active',
          }))
        "
        v-model:selected-id="selectedProjectId"
        v-model:active-tab="activeTab"
        v-model:search-text="searchTerm"
        auth-prefix="QMS:Planning:ProjectDocs"
        @archive="handleArchiveProject"
      />

      <!-- Right: Documents List -->
      <Card
        :title="
          selectedProject
            ? `${selectedProject.projectName} - ${t('qms.planning.projectDocs.documentList')}`
            : t('qms.planning.projectDocs.documentList')
        "
        class="flex flex-1 flex-col overflow-hidden"
        :body-style="{ flex: 1, overflow: 'hidden', padding: 0 }"
      >
        <Grid>
          <template #status="{ row }">
            <Tag
              color="green"
              v-if="
                ['Completed', 'COMPLETED', '已归档', 'Pass', 'PASS'].includes(
                  row.status,
                )
              "
              >{{ t('common.completed') }}</Tag
            >
            <Tag color="orange" v-else>{{ t('task.status.pending') }}</Tag>
          </template>
        </Grid>
      </Card>
    </div>
  </Page>
</template>
