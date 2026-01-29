<script lang="ts" setup>
import type { SelectProps } from 'ant-design-vue';
import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { QmsPlanningApi } from '#/api/qms/planning';
import type { QmsSupplierApi } from '#/api/qms/supplier';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import { computed, reactive, ref, toRaw, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  AutoComplete,
  DatePicker,
  Divider,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  SelectOption,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createInspectionRecord,
  updateInspectionRecord,
} from '#/api/qms/inspection';
import { getItpList } from '#/api/qms/planning';

import { getProcessOptions } from '../data';
import WorkOrderSelect from '../../issues/components/form/WorkOrderSelect.vue';

const props = withDefaults(
  defineProps<{
    workOrderList?: QmsWorkOrderApi.WorkOrderItem[];
    supplierList?: QmsSupplierApi.SupplierItem[];
    deptList?: any[];
    itpProjectList?: QmsPlanningApi.ItpProject[];
    outsourcingList?: QmsSupplierApi.SupplierItem[];
    activeKey?: string;
  }>(),
  {
    workOrderList: () => [],
    supplierList: () => [],
    deptList: () => [],
    itpProjectList: () => [],
    outsourcingList: () => [],
    activeKey: 'incoming',
  },
);

const emit = defineEmits(['success', 'register']);
const userStore = useUserStore();
const { t } = useI18n();

const isModalVisible = ref(false);
const isEditMode = ref(false);
const currentId = ref<null | string>(null);
const formRef = ref();
const sourceTaskId = ref('');

// Use a local active key that can be updated by open() if needed, or sync with prop
const currentActiveKey = ref(props.activeKey);

watch(
  () => props.activeKey,
  (val) => {
    currentActiveKey.value = val;
  },
);

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
  workOrderId?: string; // Added to store ID if needed
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
  workOrderId: undefined,
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

  switch (currentActiveKey.value) {
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

const projectItpItems = ref<QmsPlanningApi.ItpItem[]>([]);
const inspectionTasks = ref<QmsInspectionApi.InspectionTaskResult[]>([]);

const processOptions = computed(() => getProcessOptions(t));

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
  const productionDept = findDeptByName(props.deptList, '生产 OBU');
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
  if (props.outsourcingList.length > 0) {
    options.push({
      label: '外协单位',
      options: props.outsourcingList.map((o: any) => ({
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
    currentActiveKey.value === 'incoming'
      ? formState.incomingType
      : formState.process;

  // 建议列表仅按工序过滤，不按名称过滤，以提供完整候选
  const filtered = projectItpItems.value.filter(
    (item: any) => !currentProcess || item.processStep === currentProcess,
  );
  const names = filtered.map((t: any) => t.activity);
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
    currentActiveKey.value === 'incoming' ? incomingType : process;
  const targetComp =
    currentActiveKey.value === 'incoming' ? materialName : level1Component;

  try {
    // 缓存项目全量 ITP 项
    if (
      projectItpItems.value.length === 0 ||
      projectItpItems.value[0]?.projectId !== itpProjectId
    ) {
      projectItpItems.value = await getItpList({ projectId: itpProjectId });
    }

    const items = projectItpItems.value;
    const filteredItems = items.filter((item: any) => {
      const matchProcess =
        !currentProcess || item.processStep === currentProcess;
      // 匹配逻辑：如果输入了内容，则尝试匹配；如果没输入，则加载该工序下的所有项
      const matchComp =
        !targetComp ||
        item.activity.toLowerCase().includes(targetComp.toLowerCase());
      return matchProcess && matchComp;
    });

    if (filteredItems.length > 0) {
      inspectionTasks.value = filteredItems.map((item: any) => ({
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

function handleWorkOrderChange(val: any, option: any) {
  // If val is provided, it's the ID from WorkOrderSelect
  // option.item contains the full WorkOrderItem
  if (option && option.item) {
    const wo = option.item;
    formState.workOrderNumber = wo.workOrderNumber;
    formState.projectName = wo.projectName || '';
    const matchedItp = props.itpProjectList.find(
      (itp: any) =>
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
  } else if (val && props.workOrderList.length > 0) {
    // Fallback if passing simple string and looking up in prop list
    const valStr = String(val);
    const wo = props.workOrderList.find(
      (item: any) => item.workOrderNumber === valStr || item.id === val,
    );
    if (wo) {
      formState.workOrderNumber = wo.workOrderNumber;
      formState.projectName = wo.projectName || '';
      const matchedItp = props.itpProjectList.find(
        (itp: any) =>
          itp.workOrderId === wo.id ||
          (formState.projectName &&
            itp.projectName.includes(formState.projectName)),
      );
      if (matchedItp) {
        formState.itpProjectId = matchedItp.id;
        loadItpRequirements();
      }
    }
  }
}

const calculatedOverallResult = computed(() => {
  const hasFail = inspectionTasks.value.some((t: any) => t.result === 'FAIL');
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
      type: currentActiveKey.value as
        | 'FINAL'
        | 'INCOMING'
        | 'OUTGOING'
        | 'PROCESS',
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
    emit('success');
  } catch {
    message.error(t('common.actionFailed'));
  }
}

function open(mode: 'create' | 'edit', record?: any) {
  isEditMode.value = mode === 'edit';
  // activeKey is reactive via prop, but ensure we use current prop value
  if (props.activeKey) {
    currentActiveKey.value = props.activeKey;
  }
  isModalVisible.value = true;

  // 重置表单和缓存
  Object.keys(formState).forEach((key) => {
    delete formState[key as keyof InspectionRecordFormState];
  });
  inspectionTasks.value = [];
  projectItpItems.value = [];

  if (mode === 'edit' && record) {
    currentId.value = record.id;
    sourceTaskId.value = record.taskId || '';
    Object.assign(formState, record);
    // Ensure workOrderId is set if using WorkOrderSelect
    if (record.workOrderNumber && !record.workOrderId && props.workOrderList) {
       const wo = props.workOrderList.find(w => w.workOrderNumber === record.workOrderNumber);
       if (wo) formState.workOrderId = wo.id;
    }

    if (record.results)
      inspectionTasks.value = structuredClone(
        toRaw(
          record.results,
        ) as unknown as QmsInspectionApi.InspectionTaskResult[],
      );
  } else {
    currentId.value = null;
    sourceTaskId.value = '';
    formState.inspector =
      userStore.userInfo?.realName || userStore.userInfo?.username || '';
    formState.reportDate = new Date().toISOString().split('T')[0];
    formState.result = 'PASS';
    formState.quantity = 1;
    if (currentActiveKey.value === 'incoming') formState.hasDocuments = '有';
    if (currentActiveKey.value === 'process') formState.archived = '是';
    if (currentActiveKey.value === 'shipment') formState.packingListArchived = '是';
  }
}

defineExpose({ open });
</script>

<template>
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
          <WorkOrderSelect
            v-model:value="formState.workOrderId"
            @change="handleWorkOrderChange"
            :placeholder="t('common.pleaseSelect')"
          />
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
              v-for="itp in props.itpProjectList"
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
        <div v-if="currentActiveKey === 'incoming'" class="grid grid-cols-4 gap-4">
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
                v-for="s in props.supplierList"
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
              :options="availableComponents as any"
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
        <div v-if="currentActiveKey === 'process'" class="grid grid-cols-4 gap-4">
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
              :options="availableComponents as any"
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
          <FormItem :label="t('qms.inspection.records.form.team')" name="team">
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
        <div v-if="currentActiveKey === 'shipment'" class="grid grid-cols-4 gap-4">
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
                :color="text === 'H' ? 'red' : text === 'W' ? 'orange' : 'blue'"
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
                <Select v-model:value="record.result" size="small" class="w-24">
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
</template>

<style scoped>
:deep(.ant-modal-body) {
  padding-top: 12px;
}

:deep(.ant-form-item) {
  margin-bottom: 12px;
}
</style>
