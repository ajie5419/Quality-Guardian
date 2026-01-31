<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsAfterSalesApi } from '#/api/qms/after-sales';
import type {
  DeptTreeNode,
  TreeSelectNode,
  VxeCheckboxChangeParams,
} from '#/types';

import { computed, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, message, Modal, Select, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  batchDeleteAfterSales,
  deleteAfterSales,
  getAfterSalesList,
  importAfterSalesExcel,
} from '#/api/qms/after-sales';
import { getDeptList } from '#/api/system/dept';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useGridImport } from '#/hooks/useGridImport';
import { useKnowledgeSettlement } from '#/hooks/useKnowledgeSettlement';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import { convertToTreeSelectData, findNameById } from '#/types';

import AfterSalesCharts from './components/AfterSalesCharts.vue';
import AfterSalesModal from './components/AfterSalesModal.vue';
import { useStatusOptions } from './constants';

const { t } = useI18n();

const showCharts = ref(false);
const chartRefreshKey = ref(0);

// 缓存失效控制
const { invalidateAfterSales } = useInvalidateQmsQueries();

// 权限控制
const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['QMS:AfterSales:Create']));
const canEdit = computed(() => hasAccessByCodes(['QMS:AfterSales:Edit']));
const canDelete = computed(() => hasAccessByCodes(['QMS:AfterSales:Delete']));
const canSettle = computed(() => hasAccessByCodes(['QMS:AfterSales:Settle']));

// 状态选项
const { getStatusInfo } = useStatusOptions();

// ...

// 数据
const deptTreeData = ref<TreeSelectNode[]>([]);
const deptRawData = ref<DeptTreeNode[]>([]); // 保存原始部门数据用于 ID 转名称

async function loadData() {
  try {
    const data = await getDeptList();
    deptRawData.value = data;
    deptTreeData.value = convertToTreeSelectData(data);
  } catch (error) {
    console.error('Failed to load data', error);
    message.error(t('common.dataLoadFailed'));
  }
}

onMounted(() => loadData());

// Define strict type for schema item
type GridFormSchema = NonNullable<
  NonNullable<VxeGridProps['formOptions']>['schema']
>[number];

// Year Filter (Dynamic)
const { years: dynamicYears } = useAvailableYears();
const currentYear = ref<number>(new Date().getFullYear());
const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

// 5. 导入功能
const gridApiProxy =
  ref<ReturnType<typeof useVbenVxeGrid<QmsAfterSalesApi.AfterSalesItem>>[1]>();
const { handleImport } = useGridImport({
  gridApi: gridApiProxy as any,
  importApi: importAfterSalesExcel,
  statusMap: {
    待处理: 'OPEN',
    处理中: 'IN_PROGRESS',
    已解决: 'RESOLVED',
    已结束: 'CLOSED',
    已完结: 'CLOSED',
    已完成: 'COMPLETED',
    已取消: 'CANCELLED',
  },
  onSuccess: () => {
    invalidateAfterSales();
    chartRefreshKey.value++;
  },
});

// 表格列配置
const gridOptions = computed(() => ({
  checkboxConfig: {
    reserve: true,
    highlight: true,
  },
  columns: [
    { type: 'checkbox', width: 50, fixed: 'left' },
    {
      type: 'seq',
      title: t('qms.afterSales.columns.seq'),
      width: 60,
      fixed: 'left',
    },
    {
      field: 'workOrderNumber',
      title: t('qms.afterSales.form.workOrderNumber'),
      minWidth: 120,
      fixed: 'left',
    },
    {
      field: 'division',
      title: t('qms.afterSales.form.division'),
      width: 120,
      formatter: ({ cellValue }: { cellValue: string }) => {
        if (!cellValue) return '';
        const name = findNameById(deptRawData.value, cellValue);
        return name || cellValue;
      },
    },
    {
      field: 'isClaim',
      title: t('qms.afterSales.columns.isClaim'),
      width: 100,
      slots: { default: 'isClaim' },
    },
    {
      field: 'projectName',
      title: t('qms.afterSales.form.projectName'),
      minWidth: 150,
    },
    {
      field: 'partName',
      title: t('qms.afterSales.form.partName'),
      minWidth: 150,
    },
    {
      field: 'customerName',
      title: t('qms.afterSales.form.customerName'),
      minWidth: 150,
    },
    {
      field: 'location',
      title: t('qms.afterSales.form.location'),
      minWidth: 120,
    },
    {
      field: 'factoryDate',
      title: t('qms.afterSales.form.factoryDate'),
      width: 120,
    },
    {
      field: 'warrantyStatus',
      title: t('qms.afterSales.form.warrantyStatus'),
      width: 100,
    },
    {
      field: 'issueDescription',
      title: t('qms.afterSales.form.issueDescription'),
      minWidth: 200,
    },
    {
      field: 'productType',
      title: t('qms.afterSales.form.productType'),
      minWidth: 120,
    },
    {
      field: 'productSubtype',
      title: t('qms.afterSales.form.productSubtype'),
      minWidth: 120,
    },
    {
      field: 'runningHours',
      title: t('qms.afterSales.form.runningHours'),
      width: 100,
    },
    {
      field: 'defectType',
      title: t('qms.afterSales.form.defectType'),
      minWidth: 120,
    },
    {
      field: 'defectSubtype',
      title: t('qms.afterSales.form.defectSubtype'),
      minWidth: 120,
    },
    {
      field: 'severity',
      title: t('qms.afterSales.form.severity'),
      width: 100,
    },
    {
      field: 'quantity',
      title: t('qms.afterSales.form.quantity'),
      width: 80,
    },
    {
      field: 'issueDate',
      title: t('qms.afterSales.form.issueDate'),
      width: 120,
    },
    {
      field: 'handler',
      title: t('qms.afterSales.form.handler'),
      width: 100,
    },
    {
      field: 'resolutionPlan',
      title: t('qms.afterSales.form.resolutionPlan'),
      minWidth: 200,
    },
    {
      field: 'responsibleDept',
      title: t('qms.afterSales.form.responsibleDept'),
      width: 120,
      formatter: ({ cellValue }: { cellValue: string }) => {
        if (!cellValue) return '';
        const name = findNameById(deptRawData.value, cellValue);
        return name || cellValue;
      },
    },
    {
      field: 'supplierBrand',
      title: t('qms.afterSales.form.supplierBrand'),
      width: 150,
    },
    {
      field: 'materialCost',
      title: t('qms.afterSales.form.materialCost'),
      width: 100,
    },
    {
      field: 'laborTravelCost',
      title: t('qms.afterSales.form.laborTravelCost'),
      width: 120,
    },
    {
      field: 'closeDate',
      title: t('qms.afterSales.form.closeDate'),
      width: 120,
    },
    {
      field: 'status',
      title: t('qms.afterSales.form.status'),
      width: 100,
      fixed: 'right',
      slots: { default: 'status' },
    },
    {
      title: t('qms.afterSales.columns.action'),
      width: 150,
      fixed: 'right',
      cellRender: {
        name: 'CellOperation',
        props: {
          options: [
            ...(canEdit.value ? ['edit'] : []),
            ...(canSettle.value
              ? [
                  {
                    code: 'settle',
                    icon: 'lucide:book-check',
                    title: t('qms.inspection.issues.settleToKnowledge'),
                  },
                ]
              : []),
            ...(canDelete.value ? ['delete'] : []),
          ],
          onClick: ({
            code,
            row,
          }: {
            code: string;
            row: QmsAfterSalesApi.AfterSalesItem;
          }) => {
            if (code === 'edit') handleEdit(row);
            if (code === 'delete') handleDelete(row);
            if (code === 'settle') handleSettleToKnowledge(row);
          },
        },
      },
    },
  ],
  toolbarConfig: {
    export: true,
    import: true,
    search: true,
    refresh: true,
    zoom: true,
    custom: true,
    slots: {
      buttons: 'toolbar-actions',
    },
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
  proxyConfig: {
    ajax: {
      query: async (
        { page }: { page?: { currentPage?: number; pageSize?: number } },
        formValues: Record<string, unknown> = {},
      ) => {
        const data = await getAfterSalesList({
          year: currentYear.value,
          ...formValues,
        } as QmsAfterSalesApi.AfterSalesParams);

        const { currentPage = 1, pageSize = 20 } = page || {};
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = data.slice(start, end);

        return { items: pageData, total: data.length };
      },
      queryAll: async ({
        formValues = {},
      }: {
        formValues?: Record<string, unknown>;
      }) => {
        const data = await getAfterSalesList({
          year: currentYear.value,
          ...formValues,
        } as QmsAfterSalesApi.AfterSalesParams);
        return { items: data || [] };
      },
    },
  },
}));

// ...

const checkedRows = ref<QmsAfterSalesApi.AfterSalesItem[]>([]);

function onCheckChange(
  params: VxeCheckboxChangeParams<QmsAfterSalesApi.AfterSalesItem>,
) {
  const records = params.$grid.getCheckboxRecords();
  checkedRows.value = records;
}

const gridEvents = {
  checkboxChange: onCheckChange,
  checkboxAll: onCheckChange,
};

// ...

const { statusMap } = useStatusOptions();
const statusOptionsList = computed(() =>
  Object.entries(statusMap.value).map(([value, config]) => ({
    label: config.label,
    value,
  })),
);

// ...
// Define strict type for schema item with colProps extension
// VxeFormSchema might be missing colProps in type definition but supports it in runtime/other types
type ExtendedGridFormSchema = GridFormSchema & { colProps?: { span?: number } };

const formSchema: ExtendedGridFormSchema[] = [
  {
    fieldName: 'workOrderNumber',
    label: t('qms.afterSales.form.workOrderNumber'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'customerName',
    label: t('qms.afterSales.form.customerName'),
    component: 'Input',
    colProps: { span: 6 },
  },
  {
    fieldName: 'status',
    label: t('qms.afterSales.form.status'),
    component: 'Select',
    componentProps: {
      options: statusOptionsList,
    },
    colProps: { span: 6 },
  },
];

const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions:
    gridOptions.value as VxeGridProps<QmsAfterSalesApi.AfterSalesItem>,
  gridEvents,
  formOptions: {
    schema: formSchema,
    showCollapseButton: true,
    submitOnChange: true,
    submitOnEnter: true,
  },
});

gridApiProxy.value = gridApi;

// 监听部门数据变化，刷新表格显示
watch(deptRawData, () => {
  gridApi.reload();
});

// Modal 状态
const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentRecord = ref<QmsAfterSalesApi.AfterSalesItem | undefined>(
  undefined,
);

function handleOpenModal() {
  isEditMode.value = false;
  currentRecord.value = undefined;
  isModalVisible.value = true;
}

function handleEdit(row: QmsAfterSalesApi.AfterSalesItem) {
  isEditMode.value = true;
  currentRecord.value = { ...row };
  isModalVisible.value = true;
}

function handleDelete(row: QmsAfterSalesApi.AfterSalesItem) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    onOk: async () => {
      try {
        await deleteAfterSales(row.id);
        message.success(t('common.deleteSuccess'));
        invalidateAfterSales();
        chartRefreshKey.value++;
        gridApi.reload();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

function handleBatchDelete() {
  if (checkedRows.value.length === 0) {
    return;
  }
  Modal.confirm({
    title: t('common.confirmBatchDelete'),
    content: t('common.confirmBatchDeleteContent', {
      count: checkedRows.value.length,
    }),
    onOk: async () => {
      try {
        const ids = checkedRows.value.map((r) => r.id);
        const res = await batchDeleteAfterSales(ids);
        message.success(
          t('common.deleteSuccessCount', { count: res.successCount }),
        );
        checkedRows.value = [];
        invalidateAfterSales();
        chartRefreshKey.value++;
        gridApi.reload();
      } catch {
        message.error(t('common.deleteFailed'));
      }
    },
  });
}

const { settle: settleToKnowledge } = useKnowledgeSettlement();

function handleSettleToKnowledge(row: QmsAfterSalesApi.AfterSalesItem) {
  settleToKnowledge({
    title: `【${t('qms.afterSales.title')}】${row.workOrderNumber} - ${row.partName || row.projectName}`,
    summary: row.issueDescription,
    categoryId: 'CAT-DEFAULT',
    photos: row.photos,
    attachmentNamePrefix: t('qms.afterSales.title'),
    tags: [row.defectType, row.productType],
    sections: [
      {
        title: t('qms.afterSales.form.baseInfo'),
        fields: [
          {
            label: t('qms.afterSales.form.workOrderNumber'),
            value: row.workOrderNumber,
          },
          {
            label: t('qms.afterSales.form.projectName'),
            value: row.projectName,
          },
          {
            label: t('qms.afterSales.form.partName'),
            value: row.partName || '-',
          },
          {
            label: t('qms.afterSales.form.customerName'),
            value: row.customerName,
          },
        ],
      },
      {
        title: t('qms.afterSales.form.issueDetails'),
        content: row.issueDescription,
      },
      {
        title: t('qms.afterSales.form.resolutionPlan'),
        content: row.resolutionPlan || t('common.notSet'),
      },
      {
        title: t('qms.afterSales.form.responsibility'),
        fields: [
          {
            label: t('qms.afterSales.form.materialCost'),
            value: `¥${row.materialCost}`,
          },
          {
            label: t('qms.afterSales.form.laborTravelCost'),
            value: `¥${row.laborTravelCost}`,
          },
        ],
      },
    ],
  });
}

function handleModalSuccess() {
  invalidateAfterSales();
  chartRefreshKey.value++;
  gridApi.reload();
}
</script>

<template>
  <Page>
    <div class="flex h-full flex-col">
      <div v-if="showCharts" class="mb-4 flex-shrink-0">
        <AfterSalesCharts :year="currentYear" :refresh-key="chartRefreshKey" />
      </div>

      <div class="flex-1 overflow-hidden rounded-lg bg-white">
        <Grid>
          <template #status="{ row }">
            <Tag :color="getStatusInfo(row.status).color">
              {{ getStatusInfo(row.status).label }}
            </Tag>
          </template>
          <template #isClaim="{ row }">
            <Tag :color="row.isClaim ? 'red' : 'green'">
              {{ row.isClaim ? t('common.yes') : t('common.no') }}
            </Tag>
          </template>
          <template #toolbar-actions>
            <Space>
              <Button
                @click="showCharts = !showCharts"
                shape="round"
                :type="showCharts ? 'primary' : 'default'"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:bar-chart-3" />
                </template>
                {{ showCharts ? t('common.hideChart') : t('common.showChart') }}
              </Button>
              <Button
                v-if="canCreate"
                shape="round"
                type="primary"
                @click="handleOpenModal"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:plus" />
                </template>
                {{ t('qms.inspection.issues.createIssue') }}
              </Button>
              <Button
                v-if="checkedRows.length > 0 && canDelete"
                danger
                shape="round"
                type="primary"
                @click="handleBatchDelete"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:trash-2" />
                </template>
                {{ t('common.batchDelete') }}
              </Button>
              <div class="ml-2 flex items-center gap-2">
                <span class="text-xs text-gray-500"
                  >{{ t('qms.inspection.records.statsYear') }}:</span
                >
                <Select
                  v-model:value="currentYear"
                  :options="yearOptions"
                  size="small"
                  class="w-[100px]"
                  @change="() => gridApi.reload()"
                />
              </div>
            </Space>
          </template>
        </Grid>
      </div>
    </div>

    <AfterSalesModal
      v-model:open="isModalVisible"
      :is-edit-mode="isEditMode"
      :initial-data="currentRecord"
      :dept-tree-data="deptTreeData"
      @success="handleModalSuccess"
    />
  </Page>
</template>
