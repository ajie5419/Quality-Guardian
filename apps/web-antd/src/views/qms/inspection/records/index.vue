<script lang="ts" setup>
import type { VxeGridProps } from '#/adapter/vxe-table';
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  AutoComplete,
  Button,
  DatePicker,
  Divider,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Segmented,
  Select,
  SelectOption,
  Table,
  Tag,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createInspectionRecord,
  deleteInspectionRecord,
  getInspectionRecords,
  updateInspectionRecord,
} from '#/api/qms/inspection';
import { getItpList, getItpProjectList } from '#/api/qms/planning';
import { getSupplierList } from '#/api/qms/supplier';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import { useAvailableYears } from '#/hooks/useAvailableYears';

const userStore = useUserStore();
const route = useRoute();
const { t } = useI18n();

// ================= 1. 响应式状态声明 =================
const { years: dynamicYears } = useAvailableYears();
const activeKey = ref('incoming');
const sourceTaskId = ref('');
const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const formRef = ref();

/**
 * 检验记录表单状态
 */
interface InspectionRecordFormState {
  archived?: string;
  componentName?: string;
  date?: string;
  defectSubtype?: string;
  defectType?: string;
  description?: string;
  division?: string;
  documents?: string;
  hasDocuments?: string;
  id?: string;
  incomingType?: string;
  inspector?: string;
  itpProjectId?: string;
  level1Component?: string;
  lossAmount?: number;
  materialName?: string;
  ncNumber?: string;
  packingListArchived?: string;
  photos?: string[];
  process?: string;
  projectName?: string;
  quantity?: number;
  reportDate?: string;
  reportedBy?: string;
  reporter?: string;
  responsibleDepartment?: string;
  result?: string;
  solution?: string;
  status?: string;
  supplierName?: string;
  team?: string;
  title?: string;
  type?: string;
  workOrderNumber?: string;
}

const formState = reactive<InspectionRecordFormState>({
  archived: t('qms.inspection.records.options.yes'),
  componentName: '',
  documents: '',
  hasDocuments: t('qms.inspection.records.options.have'),
  incomingType: undefined,
  inspector: '',
  itpProjectId: undefined,
  level1Component: '',
  materialName: '',
  packingListArchived: '是',
  process: undefined,
  projectName: '',
  quantity: 1,
  reportDate: '',
  reporter: '',
  result: 'PASS',
  team: '',
  workOrderNumber: '',
});

const rules = computed(() => {
  const commonRules = {
    inspector: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.inspection.records.form.inspector'),
        ]),
      },
    ],
    quantity: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.inspection.records.form.quantity'),
        ]),
      },
    ],
    reportDate: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.inspection.records.form.reportDate'),
        ]),
      },
    ],
    workOrderNumber: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.workOrder.workOrderNumber'),
        ]),
      },
    ],
  };

  switch (activeKey.value) {
    case 'incoming': {
      return {
        ...commonRules,
        incomingType: [
          {
            required: true,
            message: t('ui.formRules.selectRequired', [
              t('qms.inspection.records.form.incomingType'),
            ]),
          },
        ],
        materialName: [
          {
            required: true,
            message: t('ui.formRules.required', [
              t('qms.inspection.records.form.materialName'),
            ]),
          },
        ],
        supplierName: [
          {
            required: true,
            message: t('ui.formRules.selectRequired', [t('qms.supplier.name')]),
          },
        ],
      };
    }
    case 'process': {
      return {
        ...commonRules,
        componentName: [
          {
            required: true,
            message: t('ui.formRules.required', [
              t('qms.inspection.records.form.componentName'),
            ]),
          },
        ],
        process: [
          {
            required: true,
            message: t('ui.formRules.selectRequired', [
              t('qms.inspection.records.form.process'),
            ]),
          },
        ],
      };
    }
    case 'shipment': {
      return {
        ...commonRules,
        documents: [
          {
            required: true,
            message: t('ui.formRules.required', [
              t('qms.inspection.records.form.documents'),
            ]),
          },
        ],
      };
    }
    // No default
  }
  return commonRules;
});

const workOrderList = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
const supplierList = ref<QmsSupplierApi.SupplierItem[]>([]);
const outsourcingList = ref<QmsSupplierApi.SupplierItem[]>([]); // 外协单位列表
const deptList = ref<any[]>([]); // 部门列表
const itpProjectList = ref<QmsPlanningApi.ItpProject[]>([]);
const projectItpItems = ref<QmsPlanningApi.ItpItem[]>([]); // 缓存当前项目的全量 ITP 项
const inspectionTasks = ref<QmsInspectionApi.InspectionTaskResult[]>([]);
const currentYear = ref<number>(new Date().getFullYear());

// ================= 3. 业务配置 =================
const segmentedOptions = computed(() => [
  { label: t('qms.inspection.records.tab.incoming'), value: 'incoming' },
  { label: t('qms.inspection.records.tab.process'), value: 'process' },
  { label: t('qms.inspection.records.tab.shipment'), value: 'shipment' },
]);

const processOptions = computed(() => [
  {
    label: t('qms.inspection.records.options.process.outsourced'),
    value: '外购件',
  },
  {
    label: t('qms.inspection.records.options.process.rawMaterial'),
    value: '原材料',
  },
  {
    label: t('qms.inspection.records.options.process.auxiliary'),
    value: '辅材',
  },
  {
    label: t('qms.inspection.records.options.process.machined'),
    value: '机加成品件',
  },
  { label: t('qms.inspection.records.options.process.cutting'), value: '下料' },
  {
    label: t('qms.inspection.records.options.process.assembly'),
    value: '组对',
  },
  { label: t('qms.inspection.records.options.process.welding'), value: '焊接' },
  {
    label: t('qms.inspection.records.options.process.weldSize'),
    value: '焊后尺寸',
  },
  {
    label: t('qms.inspection.records.options.process.appearance'),
    value: '外观',
  },
  {
    label: t('qms.inspection.records.options.process.overallAssembly'),
    value: '整体拼装',
  },
  {
    label: t('qms.inspection.records.options.process.assembling'),
    value: '组装',
  },
  {
    label: t('qms.inspection.records.options.process.mounting'),
    value: '装配',
  },
  {
    label: t('qms.inspection.records.options.process.grouping'),
    value: '组拼',
  },
  {
    label: t('qms.inspection.records.options.process.sandblasting'),
    value: '打砂',
  },
  {
    label: t('qms.inspection.records.options.process.painting'),
    value: '喷漆',
  },
]);

const yearOptions = computed(() => {
  return dynamicYears.value.map((y) => ({
    label: `${y}${t('common.unit.year')}`,
    value: y,
  }));
});

// 递归查找部门
function findDeptByName(tree: any[], name: string): any {
  for (const node of tree) {
    if (node.name === name) return node;
    if (node.children) {
      const found = findDeptByName(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// 班组/外协选项
const teamOptions = computed(() => {
  const options = [];

  // 1. 内部班组 (生产 OBU 下属)
  const productionDept = findDeptByName(deptList.value, '生产 OBU');
  if (productionDept && productionDept.children) {
    options.push({
      label: '生产班组',
      options: productionDept.children.map((d: any) => ({
        label: d.name,
        value: d.name,
        isOutsourcing: false,
      })),
    });
  }

  // 2. 外协单位
  if (outsourcingList.value.length > 0) {
    options.push({
      label: '外协单位',
      options: outsourcingList.value.map((o) => ({
        label: o.name,
        value: o.name,
        isOutsourcing: true,
      })),
    });
  }

  return options;
});

// 计算属性：提供智能补全建议
const itpSuggestions = computed(() => {
  if (!projectItpItems.value || projectItpItems.value.length === 0) return [];
  const currentProcess =
    activeKey.value === 'incoming' ? formState.incomingType : formState.process;

  // 建议列表仅按工序过滤，不按名称过滤，以提供完整候选
  const filtered = projectItpItems.value.filter(
    (item) => !currentProcess || item.processStep === currentProcess,
  );
  const names = filtered.map((t) => t.activity);
  return [...new Set(names)].map((name) => ({ label: name, value: name }));
});

const availableComponents = computed(() => itpSuggestions.value);

// ================= 4. 业务逻辑 =================

async function loadItpRequirements() {
  const { itpProjectId, process, incomingType, materialName, level1Component } =
    formState;
  if (!itpProjectId) {
    projectItpItems.value = [];
    inspectionTasks.value = [];
    return;
  }

  const currentProcess =
    activeKey.value === 'incoming' ? incomingType : process;
  const targetComp =
    activeKey.value === 'incoming' ? materialName : level1Component;

  try {
    // 缓存项目全量 ITP 项
    if (
      projectItpItems.value.length === 0 ||
      projectItpItems.value[0]?.projectId !== itpProjectId
    ) {
      projectItpItems.value = await getItpList({ projectId: itpProjectId });
    }

    const items = projectItpItems.value;
    const filteredItems = items.filter((item) => {
      const matchProcess =
        !currentProcess || item.processStep === currentProcess;
      // 匹配逻辑：如果输入了内容，则尝试匹配；如果没输入，则加载该工序下的所有项
      const matchComp =
        !targetComp ||
        item.activity.toLowerCase().includes(targetComp.toLowerCase());
      return matchProcess && matchComp;
    });
    // ... (rest unchanged)

    if (filteredItems.length > 0) {
      inspectionTasks.value = filteredItems.map((item) => ({
        itpItemId: item.id,
        activity: item.activity,
        controlPoint: item.controlPoint,
        isQuantitative: item.isQuantitative,
        standardValue: item.standardValue,
        upperTolerance: item.upperTolerance,
        lowerTolerance: item.lowerTolerance,
        unit: item.unit,
        acceptanceCriteria: item.acceptanceCriteria,
        referenceDoc: item.referenceDoc,
        measuredValue: undefined,
        result: 'PASS',
        remarks: '',
      }));
    } else if (currentProcess || targetComp) {
      inspectionTasks.value = [];
    }
  } catch (error) {
    console.error('Auto-load ITP failed', error);
  }
}

watch(
  [
    () => formState.process,
    () => formState.incomingType,
    () => formState.componentName,
    () => formState.materialName,
    () => formState.level1Component,
    () => formState.itpProjectId,
  ],
  () => {
    if (formState.itpProjectId) loadItpRequirements();
  },
);

function handleMeasuredValueChange(
  task: QmsInspectionApi.InspectionTaskResult,
) {
  if (task.isQuantitative && task.measuredValue !== undefined) {
    const min = (task.standardValue || 0) - (task.lowerTolerance || 0);
    const max = (task.standardValue || 0) + (task.upperTolerance || 0);
    task.result =
      task.measuredValue >= min && task.measuredValue <= max ? 'PASS' : 'FAIL';
  }
}

async function handleWorkOrderChange(val: unknown) {
  if (!val) return;
  const valStr = String(val);
  const wo = workOrderList.value.find(
    (item) => item.workOrderNumber === valStr,
  );
  if (wo) {
    formState.projectName = wo.projectName || '';
    const matchedItp = itpProjectList.value.find(
      (itp) =>
        itp.workOrderId === wo.id ||
        (formState.projectName &&
          itp.projectName.includes(formState.projectName)),
    );
    if (matchedItp) {
      formState.itpProjectId = matchedItp.id;
      message.info(
        t('qms.inspection.records.autoMatchedItp', {
          name: matchedItp.projectName,
        }),
      );
      loadItpRequirements();
    }
  }
}

// ================= 5. 表格 Grid 配置 =================

const commonFormOptions = {
  schema: [
    {
      fieldName: 'workOrderNumber',
      label: t('qms.workOrder.workOrderNumber'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'projectName',
      label: t('qms.workOrder.projectName'),
      component: 'Input',
      colProps: { span: 6 },
    },
    {
      fieldName: 'reportDate',
      label: t('qms.inspection.records.form.reportDate'),
      component: 'RangePicker',
      componentProps: { valueFormat: 'YYYY-MM-DD' },
      colProps: { span: 8 },
    },
  ],
  submitOnChange: true,
  fieldMappingTime: [['reportDate', ['startDate', 'endDate']]] as any,
};

const incomingGridOptions = computed<VxeGridProps>(() => ({
  toolbarConfig: {
    export: true,
    slots: { buttons: 'toolbar-actions' },
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
    { type: 'seq', title: t('common.seq'), width: 60 },
    {
      field: 'workOrderNumber',
      title: t('qms.workOrder.workOrderNumber'),
      width: 150,
    },
    {
      field: 'projectName',
      title: t('qms.workOrder.projectName'),
      minWidth: 150,
    },
    {
      field: 'incomingType',
      title: t('qms.inspection.records.form.incomingType'),
      width: 120,
    },
    { field: 'supplierName', title: t('qms.supplier.name'), minWidth: 150 },
    {
      field: 'materialName',
      title: t('qms.inspection.records.form.materialName'),
      minWidth: 150,
    },
    {
      field: 'quantity',
      title: t('qms.inspection.records.form.quantity'),
      width: 100,
    },
    {
      field: 'result',
      title: t('qms.inspection.records.form.result'),
      width: 100,
      slots: { default: 'result' },
    },
    {
      field: 'hasDocuments',
      title: t('qms.inspection.records.form.hasDocuments'),
      width: 100,
    },
    {
      field: 'inspector',
      title: t('qms.inspection.records.form.inspector'),
      width: 120,
    },
    { field: 'reportDate', title: t('common.date'), width: 120 },
    {
      title: t('common.action'),
      width: 150,
      fixed: 'right',
      slots: { default: 'action' },
    },
  ],
  proxyConfig: {
    ajax: {
      query: async (_params, formValues) => {
        const data = await getInspectionRecords({
          type: 'incoming',
          year: currentYear.value,
          ...formValues,
        });
        return { items: data, total: data.length };
      },
      queryAll: async ({ formValues }: any) => {
        const data = await getInspectionRecords({
          type: 'incoming',
          year: currentYear.value,
          ...formValues,
        });
        return { items: data || [] };
      },
    },
  },
}));

const processGridOptions = computed<VxeGridProps>(() => ({
  toolbarConfig: {
    export: true,
    slots: { buttons: 'toolbar-actions' },
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
    { type: 'seq', title: t('common.seq'), width: 60 },
    {
      field: 'workOrderNumber',
      title: t('qms.workOrder.workOrderNumber'),
      width: 150,
    },
    {
      field: 'projectName',
      title: t('qms.workOrder.projectName'),
      minWidth: 150,
    },
    {
      field: 'process',
      title: t('qms.inspection.records.form.process'),
      width: 150,
      formatter: ({ row }) =>
        row.process ||
        (row.itpProjectId ? t('qms.inspection.records.itpPlan') : '-'),
    },
    {
      field: 'level1Component',
      title: t('qms.inspection.records.form.level1'),
      width: 120,
    },
    {
      field: 'componentName',
      title: t('qms.inspection.records.form.componentName'),
      minWidth: 150,
      formatter: ({ row }) =>
        row.componentName ||
        (row.results
          ? t('qms.inspection.records.inspectionCount', {
              count: row.results.length,
            })
          : '-'),
    },
    {
      field: 'quantity',
      title: t('qms.inspection.records.form.quantity'),
      width: 80,
    },
    {
      field: 'result',
      title: t('qms.inspection.records.form.result'),
      width: 100,
      slots: { default: 'result' },
    },
    {
      field: 'inspector',
      title: t('qms.inspection.records.form.inspector'),
      width: 120,
    },
    { field: 'team', title: t('qms.inspection.records.form.team'), width: 100 },
    { field: 'reportDate', title: t('common.date'), width: 120 },
    {
      title: t('common.action'),
      width: 150,
      fixed: 'right',
      slots: { default: 'action' },
    },
  ],
  proxyConfig: {
    ajax: {
      query: async (_params, formValues) => {
        const data = await getInspectionRecords({
          type: 'process',
          year: currentYear.value,
          ...formValues,
        });
        return { items: data, total: data.length };
      },
      queryAll: async ({ formValues }: any) => {
        const data = await getInspectionRecords({
          type: 'process',
          year: currentYear.value,
          ...formValues,
        });
        return { items: data || [] };
      },
    },
  },
}));

const shipmentGridOptions = computed<VxeGridProps>(() => ({
  toolbarConfig: {
    export: true,
    slots: { buttons: 'toolbar-actions' },
  },
  exportConfig: {
    remote: false,
    types: ['xlsx', 'csv'],
    modes: ['current', 'selected', 'all'],
  },
  columns: [
    { type: 'seq', title: t('common.seq'), width: 60 },
    {
      field: 'workOrderNumber',
      title: t('qms.workOrder.workOrderNumber'),
      width: 150,
    },
    {
      field: 'projectName',
      title: t('qms.workOrder.projectName'),
      minWidth: 150,
    },
    {
      field: 'componentName',
      title: t('qms.inspection.records.form.componentName'),
      minWidth: 150,
      formatter: ({ row }) =>
        row.componentName ||
        (row.results
          ? t('qms.inspection.records.inspectionCount', {
              count: row.results.length,
            })
          : '-'),
    },
    {
      field: 'quantity',
      title: t('qms.inspection.records.form.quantity'),
      width: 100,
    },
    {
      field: 'inspector',
      title: t('qms.inspection.records.form.inspector'),
      width: 120,
    },
    { field: 'reportDate', title: t('common.date'), width: 120 },
    {
      field: 'documents',
      title: t('qms.inspection.records.form.documents'),
      width: 150,
    },
    {
      field: 'packingListArchived',
      title: t('qms.inspection.records.form.packingListArchived'),
      width: 100,
    },
    {
      title: t('common.action'),
      width: 150,
      fixed: 'right',
      slots: { default: 'action' },
    },
  ],
  proxyConfig: {
    ajax: {
      query: async (_params, formValues) => {
        const data = await getInspectionRecords({
          type: 'shipment',
          year: currentYear.value,
          ...formValues,
        });
        return { items: data, total: data.length };
      },
      queryAll: async ({ formValues }: any) => {
        const data = await getInspectionRecords({
          type: 'shipment',
          year: currentYear.value,
          ...formValues,
        });
        return { items: data || [] };
      },
    },
  },
}));

const [IncomingGrid, incomingApi] = useVbenVxeGrid({
  gridOptions: incomingGridOptions as any,
  formOptions: commonFormOptions as any,
});
const [ProcessGrid, processApi] = useVbenVxeGrid({
  gridOptions: processGridOptions as any,
  formOptions: commonFormOptions as any,
});
const [ShipmentGrid, shipmentApi] = useVbenVxeGrid({
  gridOptions: shipmentGridOptions as any,
  formOptions: commonFormOptions as any,
});

// ================= 6. 初始化与弹窗处理 =================

onMounted(async () => {
  try {
    const woRes = await getWorkOrderList();
    workOrderList.value = woRes.items || [];
    // 分类加载供应商和外协单位，增加 pageSize 并增加过滤鲁棒性
    const res = await getSupplierList({ pageSize: 2000 });
    const items = res.items || [];

    supplierList.value = items.filter((s) => {
      const cat = (s.category || '').trim().toLowerCase();
      return cat === 'supplier' || cat === '';
    });

    outsourcingList.value = items.filter((s) => {
      const cat = (s.category || '').trim().toLowerCase();
      return cat === 'outsourcing';
    });

    deptList.value = await getDeptList();
    itpProjectList.value = await getItpProjectList();

    // Handle Task Dispatch Redirection
    const { taskId, itpProjectId } = route.query;
    if (taskId && itpProjectId) {
      sourceTaskId.value = String(taskId);
      activeKey.value = 'process'; // Switch to process tab
      openModal('create');
      formState.itpProjectId = String(itpProjectId);
      // Trigger load logic manually since watch might not catch initial set if modal logic resets
      loadItpRequirements();
    }
  } catch (error) {
    console.error(error);
  }
});

function openModal(
  mode: 'create' | 'edit',
  row?: QmsInspectionApi.DetailedInspectionRecord,
) {
  isEditMode.value = mode === 'edit';
  currentId.value = row?.id || null;
  isModalVisible.value = true;

  // 重置表单和缓存
  Object.keys(formState).forEach((key) => {
    delete formState[key as keyof InspectionRecordFormState];
  });
  inspectionTasks.value = [];
  projectItpItems.value = [];

  if (mode === 'edit' && row) {
    Object.assign(formState, row);
    if (row.results)
      inspectionTasks.value = structuredClone(
        toRaw(
          row.results,
        ) as unknown as QmsInspectionApi.InspectionTaskResult[],
      );
  } else {
    formState.inspector =
      userStore.userInfo?.realName || userStore.userInfo?.username || '';
    formState.reportDate = new Date().toISOString().split('T')[0];
    formState.result = 'PASS';
    formState.quantity = 1;
    if (activeKey.value === 'incoming') formState.hasDocuments = '有';
    if (activeKey.value === 'process') formState.archived = '是';
    if (activeKey.value === 'shipment') formState.packingListArchived = '是';
  }
}

const calculatedOverallResult = computed(() => {
  const hasFail = inspectionTasks.value.some((t) => t.result === 'FAIL');
  if (hasFail) return 'FAIL';
  return formState.result || 'PASS';
});

async function handleSubmit() {
  try {
    await formRef.value.validate();
    const finalResult = calculatedOverallResult.value;
    const data = {
      ...formState,
      result: finalResult as 'FAIL' | 'PASS' | 'Resolved',
      type: activeKey.value as 'FINAL' | 'INCOMING' | 'OUTGOING' | 'PROCESS',
      results: inspectionTasks.value,
      taskId: sourceTaskId.value || undefined,
    };
    if (isEditMode.value && currentId.value) {
      await updateInspectionRecord(
        currentId.value,
        data as unknown as Partial<QmsInspectionApi.InspectionRecord>,
      );
      message.success(t('common.saveSuccess'));
    } else {
      await createInspectionRecord(
        data as unknown as Partial<QmsInspectionApi.InspectionRecord>,
      );
      message.success(t('common.createSuccess'));
    }
    isModalVisible.value = false;
    incomingApi.reload();
    processApi.reload();
    shipmentApi.reload();
  } catch {
    message.error(t('common.actionFailed'));
  }
}

function handleDelete(row: QmsInspectionApi.DetailedInspectionRecord) {
  Modal.confirm({
    title: t('common.confirmDelete'),
    content: t('common.confirmDeleteContent'),
    okText: t('common.confirm'),
    cancelText: t('common.cancel'),
    onOk: async () => {
      await deleteInspectionRecord(row.id);
      message.success(t('common.deleteSuccess'));
      incomingApi.reload();
      processApi.reload();
      shipmentApi.reload();
    },
  });
}
</script>

<template>
  <Page>
    <div class="flex h-full flex-col overflow-hidden rounded-lg bg-white p-4">
      <div class="mb-4 flex flex-shrink-0 items-center justify-between">
        <Segmented v-model:value="activeKey" :options="segmentedOptions" />
        <div class="flex items-center gap-2">
          <span class="text-gray-500"
            >{{ t('qms.inspection.records.statsYear') }}:</span
          >
          <Select
            v-model:value="currentYear"
            :options="yearOptions"
            class="w-[120px]"
            @change="
              () => {
                incomingApi.reload();
                processApi.reload();
                shipmentApi.reload();
              }
            "
          />
        </div>
      </div>

      <div class="flex-1 overflow-hidden">
        <!-- 进货检验 Tab -->
        <div v-show="activeKey === 'incoming'" class="h-full">
          <IncomingGrid>
            <template #toolbar-actions>
              <Button
                v-access:code="'QMS:Inspection:Records:Create'"
                type="primary"
                @click="openModal('create')"
              >
                {{ t('qms.inspection.records.createIncoming') }}
              </Button>
            </template>
            <template #result="{ row }">
              <Tag
                :color="
                  String(row.result || '').toUpperCase() === 'PASS'
                    ? 'green'
                    : String(row.result || '').toUpperCase() === 'FAIL'
                      ? 'red'
                      : 'orange'
                "
              >
                {{
                  String(row.result || '').toUpperCase() === 'PASS'
                    ? t('qms.inspection.records.result.pass')
                    : String(row.result || '').toUpperCase() === 'FAIL'
                      ? t('qms.inspection.records.result.fail')
                      : t('qms.inspection.records.result.concession')
                }}
              </Tag>
            </template>
            <template #action="{ row }">
              <Button
                v-access:code="'QMS:Inspection:Records:Edit'"
                type="link"
                size="small"
                @click="openModal('edit', row)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                v-access:code="'QMS:Inspection:Records:Delete'"
                type="link"
                danger
                size="small"
                @click="handleDelete(row)"
              >
                {{ t('common.delete') }}
              </Button>
            </template>
          </IncomingGrid>
        </div>

        <!-- 过程检验 Tab -->
        <div v-show="activeKey === 'process'" class="h-full">
          <ProcessGrid>
            <template #toolbar-actions>
              <Button
                v-access:code="'QMS:Inspection:Records:Create'"
                type="primary"
                @click="openModal('create')"
              >
                {{ t('qms.inspection.records.createProcess') }}
              </Button>
            </template>
            <template #result="{ row }">
              <Tag
                :color="
                  String(row.result || '').toUpperCase() === 'PASS'
                    ? 'green'
                    : String(row.result || '').toUpperCase() === 'FAIL'
                      ? 'red'
                      : 'orange'
                "
              >
                {{
                  String(row.result || '').toUpperCase() === 'PASS'
                    ? t('qms.inspection.records.result.pass')
                    : String(row.result || '').toUpperCase() === 'FAIL'
                      ? t('qms.inspection.records.result.fail')
                      : t('qms.inspection.records.result.concession')
                }}
              </Tag>
            </template>
            <template #action="{ row }">
              <Button
                v-access:code="'QMS:Inspection:Records:Edit'"
                type="link"
                size="small"
                @click="openModal('edit', row)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                v-access:code="'QMS:Inspection:Records:Delete'"
                type="link"
                danger
                size="small"
                @click="handleDelete(row)"
              >
                {{ t('common.delete') }}
              </Button>
            </template>
          </ProcessGrid>
        </div>

        <!-- 发货检验 Tab -->
        <div v-show="activeKey === 'shipment'" class="h-full">
          <ShipmentGrid>
            <template #toolbar-actions>
              <Button
                v-access:code="'QMS:Inspection:Records:Create'"
                type="primary"
                @click="openModal('create')"
              >
                {{ t('qms.inspection.records.createShipment') }}
              </Button>
            </template>
            <template #action="{ row }">
              <Button
                v-access:code="'QMS:Inspection:Records:Edit'"
                type="link"
                size="small"
                @click="openModal('edit', row)"
              >
                {{ t('common.edit') }}
              </Button>
              <Button
                v-access:code="'QMS:Inspection:Records:Delete'"
                type="link"
                danger
                size="small"
                @click="handleDelete(row)"
              >
                {{ t('common.delete') }}
              </Button>
            </template>
          </ShipmentGrid>
        </div>
      </div>
    </div>

    <!-- 录入弹窗 -->
    <Modal
      v-model:open="isModalVisible"
      :title="
        isEditMode
          ? t('qms.inspection.records.editRecord')
          : t('qms.inspection.records.createRecord')
      "
      @ok="handleSubmit"
      width="1050px"
      style="top: 20px"
    >
      <Form layout="vertical" :model="formState" :rules="rules" ref="formRef">
        <div class="mb-4 grid grid-cols-3 gap-4 border-b pb-4">
          <FormItem
            :label="t('qms.workOrder.workOrderNumber')"
            name="workOrderNumber"
          >
            <Select
              v-model:value="formState.workOrderNumber"
              show-search
              @change="(val) => handleWorkOrderChange(val)"
              :placeholder="t('common.pleaseSelect')"
            >
              <SelectOption
                v-for="wo in workOrderList"
                :key="wo.workOrderNumber"
                :value="wo.workOrderNumber"
              >
                {{ wo.workOrderNumber }}
              </SelectOption>
            </Select>
          </FormItem>
          <FormItem :label="t('qms.workOrder.projectName')" name="projectName">
            <Input v-model:value="formState.projectName" />
          </FormItem>
          <FormItem
            :label="t('qms.inspection.records.form.relatedItp')"
            name="itpProjectId"
          >
            <Select
              v-model:value="formState.itpProjectId"
              :placeholder="t('qms.inspection.records.form.placeholder.itp')"
              allow-clear
            >
              <SelectOption
                v-for="itp in itpProjectList"
                :key="itp.id"
                :value="itp.id"
              >
                {{ itp.projectName }}
              </SelectOption>
            </Select>
          </FormItem>
        </div>

        <div class="mb-4">
          <!-- 进货录入项 -->
          <div v-if="activeKey === 'incoming'" class="grid grid-cols-4 gap-4">
            <FormItem
              :label="t('qms.inspection.records.form.incomingType')"
              name="incomingType"
            >
              <Select v-model:value="formState.incomingType">
                <SelectOption
                  v-for="p in processOptions.slice(0, 4)"
                  :key="p.value"
                  :value="p.value"
                >
                  {{ p.label }}
                </SelectOption>
              </Select>
            </FormItem>
            <FormItem :label="t('qms.supplier.name')" name="supplierName">
              <Select v-model:value="formState.supplierName" show-search>
                <SelectOption
                  v-for="s in supplierList"
                  :key="s.id"
                  :value="s.name"
                >
                  {{ s.name }}
                </SelectOption>
              </Select>
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.materialName')"
              name="materialName"
            >
              <AutoComplete
                v-model:value="formState.materialName"
                :options="availableComponents"
                :placeholder="t('common.pleaseInput')"
                allow-clear
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.quantity')"
              name="quantity"
            >
              <InputNumber v-model:value="formState.quantity" class="w-full" />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.hasDocuments')"
              name="hasDocuments"
            >
              <Select v-model:value="formState.hasDocuments">
                <SelectOption value="有">{{
                  t('qms.inspection.records.options.have')
                }}</SelectOption>
                <SelectOption value="无">{{
                  t('qms.inspection.records.options.none')
                }}</SelectOption>
              </Select>
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.reportDate')"
              name="reportDate"
            >
              <DatePicker
                v-model:value="formState.reportDate"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.inspector')"
              name="inspector"
            >
              <Input v-model:value="formState.inspector" />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.reporter')"
              name="reporter"
            >
              <Input v-model:value="formState.reporter" />
            </FormItem>
          </div>

          <!-- 过程录入项 -->
          <div v-if="activeKey === 'process'" class="grid grid-cols-4 gap-4">
            <FormItem
              :label="t('qms.inspection.records.form.process')"
              name="process"
            >
              <Select v-model:value="formState.process">
                <SelectOption
                  v-for="p in processOptions.slice(4)"
                  :key="p.value"
                  :value="p.value"
                >
                  {{ p.label }}
                </SelectOption>
              </Select>
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.level1')"
              name="level1Component"
            >
              <AutoComplete
                v-model:value="formState.level1Component"
                :options="availableComponents"
                :placeholder="
                  t('qms.inspection.records.form.placeholder.level1')
                "
                allow-clear
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.componentName')"
              name="componentName"
            >
              <Input
                v-model:value="formState.componentName"
                :placeholder="
                  t('qms.inspection.records.form.placeholder.component')
                "
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.quantity')"
              name="quantity"
            >
              <InputNumber v-model:value="formState.quantity" class="w-full" />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.team')"
              name="team"
            >
              <Select
                v-model:value="formState.team"
                show-search
                :placeholder="t('qms.inspection.records.form.placeholder.team')"
              >
                <Select.OptGroup
                  v-for="group in teamOptions"
                  :key="group.label"
                  :label="group.label"
                >
                  <Select.Option
                    v-for="opt in group.options"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </Select.Option>
                </Select.OptGroup>
              </Select>
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.archived')"
              name="archived"
            >
              <Select v-model:value="formState.archived">
                <SelectOption value="是">{{
                  t('qms.inspection.records.options.yes')
                }}</SelectOption>
                <SelectOption value="否">{{
                  t('qms.inspection.records.options.no')
                }}</SelectOption>
              </Select>
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.inspector')"
              name="inspector"
            >
              <Input v-model:value="formState.inspector" />
            </FormItem>
          </div>

          <!-- 发货录入项 -->
          <div v-if="activeKey === 'shipment'" class="grid grid-cols-4 gap-4">
            <FormItem
              :label="t('qms.inspection.records.form.componentName')"
              name="componentName"
            >
              <Input
                v-model:value="formState.componentName"
                :placeholder="
                  t('qms.inspection.records.form.placeholder.component')
                "
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.quantity')"
              name="quantity"
            >
              <InputNumber v-model:value="formState.quantity" class="w-full" />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.documents')"
              name="documents"
            >
              <Input
                v-model:value="formState.documents"
                :placeholder="
                  t('qms.inspection.records.form.placeholder.documents')
                "
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.packingListArchived')"
              name="packingListArchived"
            >
              <Select v-model:value="formState.packingListArchived">
                <SelectOption value="是">{{
                  t('qms.inspection.records.options.yes')
                }}</SelectOption>
                <SelectOption value="否">{{
                  t('qms.inspection.records.options.no')
                }}</SelectOption>
              </Select>
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.reportDate')"
              name="reportDate"
            >
              <DatePicker
                v-model:value="formState.reportDate"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.inspector')"
              name="inspector"
            >
              <Input v-model:value="formState.inspector" />
            </FormItem>
            <FormItem
              :label="t('qms.inspection.records.form.reporter')"
              name="reporter"
            >
              <Input v-model:value="formState.reporter" />
            </FormItem>
          </div>
        </div>

        <!-- ITP 实测表格 -->
        <div v-if="inspectionTasks.length > 0" class="mb-4">
          <Divider plain orientation="left">
            <span
              class="text-xs font-bold uppercase tracking-wider text-blue-500"
              >{{ t('qms.inspection.records.itpDataEntry') }}</span
            >
          </Divider>
          <Table
            :data-source="inspectionTasks"
            :pagination="false"
            size="small"
            row-key="itpItemId"
            class="border"
          >
            <Table.Column
              :title="t('qms.inspection.records.activity')"
              data-index="activity"
              width="180"
            />
            <Table.Column
              :title="t('qms.inspection.records.controlPoint')"
              data-index="controlPoint"
              width="80"
              align="center"
            >
              <template #default="{ text }">
                <Tag
                  :color="
                    text === 'H' ? 'red' : text === 'W' ? 'orange' : 'blue'
                  "
                >
                  {{ text }}
                </Tag>
              </template>
            </Table.Column>
            <Table.Column
              :title="t('qms.inspection.records.standard')"
              width="220"
            >
              <template #default="{ record }">
                <div v-if="record.isQuantitative" class="text-xs">
                  {{ t('qms.planning.itpGenerator.std') }}:
                  <b>{{ record.standardValue }}</b> (+{{
                    record.upperTolerance
                  }}/-{{ record.lowerTolerance }}) {{ record.unit }}
                </div>
                <div v-else class="text-xs text-gray-600">
                  <div class="font-bold">{{ record.acceptanceCriteria }}</div>
                  <div
                    v-if="record.referenceDoc"
                    class="mt-1 text-[10px] text-gray-400"
                  >
                    [{{ t('qms.inspection.records.reference') }}:
                    {{ record.referenceDoc }}]
                  </div>
                </div>
              </template>
            </Table.Column>
            <Table.Column
              :title="t('qms.inspection.records.measuredValue')"
              width="220"
            >
              <template #default="{ record }">
                <div class="flex items-center gap-2">
                  <InputNumber
                    v-if="record.isQuantitative"
                    v-model:value="record.measuredValue"
                    size="small"
                    class="flex-1"
                    @change="() => handleMeasuredValueChange(record)"
                  />
                  <Select
                    v-model:value="record.result"
                    size="small"
                    class="w-24"
                  >
                    <SelectOption value="PASS">{{
                      t('qms.inspection.records.result.pass')
                    }}</SelectOption>
                    <SelectOption value="FAIL">{{
                      t('qms.inspection.records.result.fail')
                    }}</SelectOption>
                    <SelectOption value="NA">{{
                      t('qms.inspection.records.result.na')
                    }}</SelectOption>
                  </Select>
                </div>
              </template>
            </Table.Column>
            <Table.Column
              :title="t('qms.planning.bom.remarks')"
              data-index="remarks"
            >
              <template #default="{ record }">
                <Input
                  v-model:value="record.remarks"
                  size="small"
                  :placeholder="
                    t('qms.inspection.records.form.placeholder.remarks')
                  "
                />
              </template>
            </Table.Column>
          </Table>
        </div>

        <!-- 汇总区域 -->
        <div
          class="mt-4 grid grid-cols-3 gap-4 rounded-b-lg border-t bg-gray-50 p-4 pt-4"
        >
          <FormItem
            :label="t('qms.inspection.records.form.singleResult')"
            class="mb-0"
          >
            <Select v-model:value="formState.result">
              <SelectOption value="PASS">{{
                t('qms.inspection.records.result.pass')
              }}</SelectOption
              ><SelectOption value="FAIL">{{
                t('qms.inspection.records.result.fail')
              }}</SelectOption
              ><SelectOption value="CONDITIONAL">{{
                t('qms.inspection.records.result.concession')
              }}</SelectOption>
            </Select>
          </FormItem>
          <FormItem
            :label="t('qms.inspection.records.form.overallResult')"
            class="mb-0"
          >
            <Tag
              :color="
                calculatedOverallResult === 'PASS'
                  ? 'green'
                  : calculatedOverallResult === 'FAIL'
                    ? 'red'
                    : 'orange'
              "
              class="px-4 py-1 text-base"
            >
              {{
                calculatedOverallResult === 'PASS'
                  ? t('qms.inspection.records.result.pass')
                  : calculatedOverallResult === 'FAIL'
                    ? t('qms.inspection.records.result.fail')
                    : t('qms.inspection.records.result.concession')
              }}
            </Tag>
          </FormItem>
          <FormItem
            :label="t('qms.inspection.records.form.auditor')"
            class="mb-0"
          >
            <Input v-model:value="formState.inspector" />
          </FormItem>
        </div>
      </Form>
    </Modal>
  </Page>
</template>

<style scoped>
:deep(.ant-modal-body) {
  padding-top: 12px;
}

:deep(.ant-form-item) {
  margin-bottom: 12px;
}
</style>
