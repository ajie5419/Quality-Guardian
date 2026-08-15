<script lang="ts" setup>
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import type { UploadFileWithResponse } from '../../issues/types';

import type { QmsInspectionApi } from '#/api/qms/inspection';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  isExternalInspectionIssueResponsibility,
  normalizeInspectionIssueCanonicalId,
  QUALITY_CLASSIFICATION_SCOPES,
} from '@qgs/shared';
import {
  Input,
  InputNumber,
  message,
  Select,
  Switch,
  TreeSelect,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenForm } from '#/adapter/form';
import { getWelderListPage } from '#/api/qms/welder';
import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import BomItemSelect from '#/views/qms/shared/components/BomItemSelect.vue';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import { useProcessMasterOptions } from '../../../shared/composables/useProcessMasterOptions';
import { useQualityClassificationOptions } from '../../../shared/composables/useQualityClassificationOptions';
import IssuePhotoUpload from '../../issues/components/IssuePhotoUpload.vue';
import {
  DEFAULT_VALUES,
  useClaimOptions,
  useSeverityOptions,
} from '../../issues/constants';
import { mapDictionaryOptionsToInspectionProcess } from '../config';
import TeamSelect from './form/TeamSelect.vue';
import { buildTeamIdentityFields, getFormSchema } from './formData';
import {
  deriveIssuePartName,
  deriveIssueProcessName,
  normalizeIssuePhotoUrls,
} from './inspection-form.utils';

const props = defineProps<{
  record?: QmsInspectionApi.InspectionRecord;
  type: string;
}>();

interface LinkedIssueDraft {
  claim: string;
  defectCategoryId: string;
  defectSubcategoryId: string;
  defectSubtype: string;
  defectType: string;
  description: string;
  generateNcNumber: boolean;
  lossAmount: number;
  partName: string;
  processName: string;
  qualifiedQuantity: number;
  reportDate: string;
  reportedBy: string;
  responsibleWelder: string;
  responsibleWelderId: string;
  rootCause: string;
  solution: string;
  status: string;
  supplierId: string;
  supplierName: string;
  photos: UploadFileWithResponse[];
  unqualifiedQuantity: number;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  severity: string;
}

interface DepartmentTreeNode {
  children?: DepartmentTreeNode[];
  title: string;
  value: string;
}

const userStore = useUserStore();
const { handleApiError } = useErrorHandler();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();
const {
  loadOptions: loadDefectClassifications,
  options: defectClassifications,
} = useQualityClassificationOptions(QUALITY_CLASSIFICATION_SCOPES[0]);

const linkedIssueDraft = ref<LinkedIssueDraft>({
  claim: DEFAULT_VALUES.DEFAULT_CLAIM,
  defectCategoryId: '',
  defectSubcategoryId: '',
  defectSubtype: '',
  defectType: '',
  description: '',
  generateNcNumber: false,
  lossAmount: 0,
  partName: '',
  processName: '',
  qualifiedQuantity: 1,
  reportDate: dayjs().format('YYYY-MM-DD'),
  reportedBy: '',
  responsibleWelder: '',
  responsibleWelderId: '',
  rootCause: '',
  solution: '',
  status: 'OPEN',
  supplierId: '',
  supplierName: '',
  photos: [],
  unqualifiedQuantity: 0,
  responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
  responsibleDepartmentId: '',
  severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
});
const departmentTreeData = ref<DepartmentTreeNode[]>([]);
const linkedDefectSubtypeOptions = computed(() => {
  const category = defectClassifications.value.find(
    (item) => item.id === linkedIssueDraft.value.defectCategoryId,
  );
  return (category?.subcategories || []).map((item) => ({
    label: item.name,
    value: item.id,
  }));
});
const defectOptions = computed(() =>
  defectClassifications.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
const shouldCreateLinkedIssue = computed(
  () =>
    !props.record?.id &&
    String(activeValues.value.result || '').toUpperCase() === 'FAIL',
);
const isLinkedIssueExternalResponsibility = computed(() =>
  isExternalInspectionIssueResponsibility(
    linkedIssueDraft.value.responsibilityType,
  ),
);
const linkedIssueSupplierCategory = computed(() =>
  linkedIssueDraft.value.responsibilityType ===
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
    ? 'Outsourcing'
    : 'Supplier',
);

// Local reactive state for form values to ensure filtering logic is reactive
const activeValues = ref<Record<string, unknown>>({});
const welderOptions = ref<
  Array<{ label: string; name: string; value: string }>
>([]);
const welderLoading = ref(false);
const {
  options: processOptions,
  loadOptions: loadInspectionProcessDictionaryOptions,
} = useProcessMasterOptions({
  mapOptions: (options) => mapDictionaryOptionsToInspectionProcess(options),
});

const [Form, formApi] = useVbenForm({
  handleSubmit: () => {}, // Handled by parent
  schema: getFormSchema(props.type, processOptions.value),
  showDefaultActions: false,
  wrapperClass:
    'grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3',
  commonConfig: {
    componentProps: {
      class: 'w-full',
    },
  },
  handleValuesChange: (vals) => {
    activeValues.value = vals;
  },
});

async function loadWelderOptions() {
  try {
    welderLoading.value = true;
    const result = await getWelderListPage({
      employmentStatus: 'ON_DUTY',
      page: 1,
      pageSize: 500,
    });
    welderOptions.value = (result.items || [])
      .map((item) => {
        const name = String(item.name || '').trim();
        if (!name) return null;
        const code = String(item.welderCode || '').trim();
        return {
          label: code ? `${name}（${code}）` : name,
          name,
          value: item.id,
        };
      })
      .filter(Boolean) as Array<{ label: string; name: string; value: string }>;
  } catch (error) {
    handleApiError(error, 'Load Welder Options');
  } finally {
    welderLoading.value = false;
  }
}

function handleWelderChange(value: unknown) {
  const welderId = String(value || '').trim();
  const option = welderOptions.value.find((item) => item.value === welderId);
  linkedIssueDraft.value.responsibleWelder = option?.name || '';
  linkedIssueDraft.value.responsibleWelderId = welderId;
}

async function loadInspectionProcessOptions() {
  await loadInspectionProcessDictionaryOptions();
  formApi.setState({
    schema: getFormSchema(props.type, processOptions.value),
  });
}

function toDepartmentTreeNode(
  department: SystemDeptApi.Dept,
): DepartmentTreeNode {
  return {
    children: (department.children || []).map((child) =>
      toDepartmentTreeNode(child),
    ),
    title: department.name,
    value: department.id,
  };
}

async function loadDepartmentOptions() {
  try {
    const departments = await getDeptList();
    departmentTreeData.value = departments.map((department) =>
      toDepartmentTreeNode(department),
    );
  } catch (error) {
    handleApiError(error, 'Load Inspection Issue Departments');
  }
}

function resolveIncomingResponsibilityType() {
  const selectedProcess = processOptions.value.find(
    (item) => item.value === activeValues.value.incomingType,
  );
  return selectedProcess?.supplierSource === 'Outsourcing'
    ? INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
    : INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER;
}

function syncLinkedIssueResponsibilityFromContext() {
  if (props.type !== 'incoming') return;
  linkedIssueDraft.value.responsibilityType =
    resolveIncomingResponsibilityType();
  linkedIssueDraft.value.supplierId = normalizeInspectionIssueCanonicalId(
    activeValues.value.supplierId,
  );
  linkedIssueDraft.value.supplierName =
    typeof activeValues.value.supplierName === 'string'
      ? activeValues.value.supplierName.trim()
      : '';
}

function handleLinkedIssueSupplierChange(
  supplierId: string | undefined,
  option?: { item?: { name?: string } },
) {
  linkedIssueDraft.value.supplierId =
    normalizeInspectionIssueCanonicalId(supplierId);
  linkedIssueDraft.value.supplierName = String(option?.item?.name || '').trim();
}

// Watch form state changes to sync linked issue draft
watch(
  () => activeValues.value,
  (values) => {
    if (!String(linkedIssueDraft.value.partName || '').trim()) {
      linkedIssueDraft.value.partName = deriveIssuePartName(values);
    }
    linkedIssueDraft.value.processName = deriveIssueProcessName(values);
    if (!linkedIssueDraft.value.processName.includes('焊')) {
      linkedIssueDraft.value.responsibleWelder = '';
      linkedIssueDraft.value.responsibleWelderId = '';
    }
    const totalQuantity = Math.max(1, Number(values.quantity) || 1);
    const defaultUnqualified =
      String(activeValues.value.result || '').toUpperCase() === 'FAIL' ? 1 : 0;
    const normalizedUnqualified = Math.max(
      0,
      Math.min(
        totalQuantity,
        linkedIssueDraft.value.unqualifiedQuantity || defaultUnqualified,
      ),
    );
    linkedIssueDraft.value.unqualifiedQuantity = normalizedUnqualified;
    linkedIssueDraft.value.qualifiedQuantity =
      totalQuantity - normalizedUnqualified;
    syncLinkedIssueResponsibilityFromContext();
    if (!String(linkedIssueDraft.value.supplierName || '').trim()) {
      linkedIssueDraft.value.supplierName = String(
        values.supplierName || '',
      ).trim();
    }
    if (!String(linkedIssueDraft.value.reportDate || '').trim()) {
      linkedIssueDraft.value.reportDate = String(values.inspectionDate || '')
        .trim()
        .slice(0, 10);
    }
    if (!String(linkedIssueDraft.value.reportedBy || '').trim()) {
      linkedIssueDraft.value.reportedBy = String(values.inspector || '').trim();
    }
  },
  { deep: true },
);

async function handleWorkOrderChange(
  val: string | undefined,
  option: { item?: { projectName: string; workOrderNumber: string } },
) {
  try {
    formApi.setFieldValue('workOrderNumber', val);
    const projectNameFromWO = option?.item?.projectName || '';
    await formApi.setValues({
      projectName: projectNameFromWO,
    });
    setTimeout(() => {
      formApi.validateField('workOrderNumber');
    }, 200);
  } catch (error) {
    handleApiError(error, 'Handle Work Order Change');
  }
}

async function handleSupplierChange(
  val: string | undefined,
  option?: { item?: { name?: string } },
) {
  const supplierName = String(option?.item?.name || '').trim();
  formApi.setFieldValue('supplierId', val);
  formApi.setFieldValue('supplierName', supplierName || undefined);
  setTimeout(() => {
    formApi.validateField('supplierId');
  }, 200);
}

interface TeamSelectOption {
  label: string;
  value: string;
}

function handleTeamChange(
  value: string | undefined,
  option?: TeamSelectOption,
) {
  const identity = buildTeamIdentityFields(value, option);
  formApi.setFieldValue('teamId', identity.teamId);
  formApi.setFieldValue('team', identity.team);
  clearFieldValidator('teamId');
}

function clearFieldValidator(fieldName: string) {
  setTimeout(() => {
    formApi.validateField(fieldName);
  }, 200);
}

watch(
  () => props.type,
  (newType) => {
    formApi.setState({ schema: getFormSchema(newType, processOptions.value) });
  },
  { immediate: true },
);

// Watch for incomingType changes to switch Supplier/Outsourcing
watch(
  () => activeValues.value.incomingType,
  (newVal, oldVal) => {
    if (props.type === 'incoming') {
      const selectedProcess = processOptions.value.find(
        (item) => item.value === newVal,
      );
      const isMachined = selectedProcess?.supplierSource === 'Outsourcing';
      formApi.updateSchema([
        {
          fieldName: 'supplierId',
          componentProps: {
            category: isMachined ? 'Outsourcing' : 'Supplier',
            placeholder: isMachined ? '请选择外协单位' : '请选择供应商',
          },
        },
        {
          fieldName: 'hasDocuments',
          show: true,
        },
      ] as unknown as Parameters<typeof formApi.updateSchema>[0]);

      // Clear value if type changes and it's not the initial load (optimization)
      if (newVal !== oldVal && oldVal !== undefined) {
        formApi.setFieldValue('supplierId', undefined);
        formApi.setFieldValue('supplierName', undefined);
      }
    }
  },
);

watch(
  () => activeValues.value.incomingType,
  () => syncLinkedIssueResponsibilityFromContext(),
);

watch(
  () => props.record,
  async (val) => {
    if (val && Object.keys(val).length > 0) {
      await formApi.setValues(val);
      activeValues.value = val as unknown as Record<string, unknown>; // Sync local state
    } else {
      await formApi.resetForm();
      const defaultInspector =
        userStore.userInfo?.username || userStore.userInfo?.realName || '';
      const initialVals = {
        inspector: defaultInspector,
        inspectionDate: dayjs().format('YYYY-MM-DD'),
        quantity: 1,
        result: 'PASS',
      };
      await formApi.setValues(initialVals);
      activeValues.value = initialVals; // Sync local state
    }
    linkedIssueDraft.value = {
      claim: DEFAULT_VALUES.DEFAULT_CLAIM,
      defectCategoryId: '',
      defectSubcategoryId: '',
      defectSubtype: '',
      defectType: '',
      description: '',
      generateNcNumber: false,
      lossAmount: 0,
      partName: deriveIssuePartName(activeValues.value),
      processName: deriveIssueProcessName(activeValues.value),
      qualifiedQuantity: Math.max(1, Number(activeValues.value.quantity) || 1),
      reportDate: String(activeValues.value.inspectionDate || '').slice(0, 10),
      reportedBy: String(activeValues.value.inspector || ''),
      responsibleWelder: '',
      responsibleWelderId: '',
      rootCause: '',
      solution: '',
      status: 'OPEN',
      supplierId: normalizeInspectionIssueCanonicalId(
        activeValues.value.supplierId,
      ),
      supplierName: String(activeValues.value.supplierName || ''),
      photos: [],
      unqualifiedQuantity: 0,
      responsibilityType:
        props.type === 'incoming'
          ? resolveIncomingResponsibilityType()
          : INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
      responsibleDepartmentId: '',
      severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
    };
  },
  { immediate: true },
);

void Promise.all([
  loadWelderOptions(),
  loadInspectionProcessOptions(),
  loadDefectClassifications(),
  loadDepartmentOptions(),
]);

defineExpose({
  getValues: async () => {
    const values = await formApi.getValues();
    const totalQuantity = Math.max(1, Number(values.quantity) || 1);
    const currentResult = String(values.result || '').toUpperCase();
    const unqualifiedQuantity =
      currentResult === 'FAIL'
        ? Math.max(
            0,
            Math.min(
              totalQuantity,
              Number(linkedIssueDraft.value.unqualifiedQuantity) || 0,
            ),
          )
        : 0;
    const qualifiedQuantity = totalQuantity - unqualifiedQuantity;
    return {
      ...values,
      ...(props.type === 'process'
        ? {
            team: String(values.team || activeValues.value.team || '').trim(),
            teamId: String(values.teamId || '').trim(),
          }
        : {}),
      qualifiedQuantity,
      unqualifiedQuantity,
      linkedIssue: shouldCreateLinkedIssue.value
        ? {
            ...linkedIssueDraft.value,
            partName: deriveIssuePartName(activeValues.value),
            processName: deriveIssueProcessName(activeValues.value),
            supplierId:
              linkedIssueDraft.value.supplierId ||
              normalizeInspectionIssueCanonicalId(
                activeValues.value.supplierId,
              ),
            reportDate: String(activeValues.value.inspectionDate || '')
              .trim()
              .slice(0, 10),
            reportedBy: String(activeValues.value.inspector || '').trim(),
            photos: normalizeIssuePhotoUrls(linkedIssueDraft.value.photos),
            enabled: true,
            generateNcNumber: linkedIssueDraft.value.generateNcNumber,
            quantity: unqualifiedQuantity,
          }
        : {
            enabled: false,
          },
    };
  },
  validate: async () => {
    const { valid } = await formApi.validate();
    if (!valid) throw new Error('Form validation failed');

    const totalQuantity = Math.max(1, Number(activeValues.value.quantity) || 1);
    const currentResult = String(activeValues.value.result || '')
      .trim()
      .toUpperCase();
    const unqualifiedQuantity = Math.max(
      0,
      Math.min(
        totalQuantity,
        Number(linkedIssueDraft.value.unqualifiedQuantity) || 0,
      ),
    );

    if (currentResult === 'PASS' && unqualifiedQuantity > 0) {
      message.warning('检验结论为合格时，不合格数量必须为 0');
      throw new Error('Result and unqualified quantity are inconsistent');
    }

    if (currentResult === 'FAIL' && unqualifiedQuantity <= 0) {
      message.warning('检验结论为不合格时，不合格数量必须大于 0');
      throw new Error('Unqualified quantity required for fail result');
    }
    if (shouldCreateLinkedIssue.value) {
      if (!linkedIssueDraft.value.description.trim()) {
        message.warning('请填写不合格描述');
        throw new Error('Issue description required');
      }
      if (!linkedIssueDraft.value.rootCause.trim()) {
        message.warning('请填写原因分析');
        throw new Error('Issue root cause required');
      }
      if (!linkedIssueDraft.value.solution.trim()) {
        message.warning('请填写解决方案');
        throw new Error('Issue solution required');
      }
      if (!linkedIssueDraft.value.responsibleDepartmentId.trim()) {
        message.warning('请选择责任部门');
        throw new Error('Issue responsible department ID required');
      }
      if (
        isLinkedIssueExternalResponsibility.value &&
        !linkedIssueDraft.value.supplierId.trim()
      ) {
        message.warning('请选择责任单位');
        throw new Error('Issue responsible supplier required');
      }
      if (
        linkedIssueDraft.value.processName.includes('焊') &&
        !String(linkedIssueDraft.value.responsibleWelder || '').trim()
      ) {
        message.warning('焊接工序必须选择责任焊工');
        throw new Error('Responsible welder required for welding process');
      }
      if (!linkedIssueDraft.value.defectCategoryId.trim()) {
        message.warning('请选择缺陷分类');
        throw new Error('Issue defect type required');
      }
      if (!linkedIssueDraft.value.defectSubcategoryId.trim()) {
        message.warning('请选择二级分类');
        throw new Error('Issue defect subtype required');
      }
      if (linkedIssueDraft.value.unqualifiedQuantity <= 0) {
        message.warning('不合格数量必须大于 0');
        throw new Error('Issue unqualified quantity required');
      }
    }
    return true;
  },
});
</script>

<template>
  <Form>
    <!-- Slot for WorkOrderSelect -->
    <template #workOrderNumber="slotProps">
      <WorkOrderSelect v-bind="slotProps" @change="handleWorkOrderChange" />
    </template>

    <!-- Slot for SupplierSelect -->
    <template #supplierId="slotProps">
      <SupplierSelect
        v-bind="slotProps"
        :legacy-name="String(activeValues.supplierName || '')"
        value-mode="id"
        @change="handleSupplierChange"
      />
    </template>

    <!-- Slot for BomItemSelect -->
    <template #level1Component="slotProps">
      <BomItemSelect
        v-bind="slotProps"
        :work-order-number="activeValues?.workOrderNumber"
        @change="
          (val) => {
            formApi.setFieldValue('level1Component', val);
            clearFieldValidator('level1Component');
          }
        "
      />
    </template>

    <!-- Slot for TeamSelect -->
    <template #teamId="slotProps">
      <TeamSelect
        v-bind="slotProps"
        :legacy-name="String(activeValues.team || '')"
        @change="handleTeamChange"
        @resolved="handleTeamChange"
      />
    </template>
  </Form>

  <div
    v-if="shouldCreateLinkedIssue"
    class="mt-4 rounded border border-orange-200 bg-orange-50 p-4"
  >
    <div class="mb-3 font-medium text-orange-700">
      当前判定为“不合格”，请补充不合格项信息（保存时自动建立关联）
    </div>
    <div class="mb-3 flex items-center gap-2 text-sm text-gray-700">
      <Switch v-model:checked="linkedIssueDraft.generateNcNumber" />
      <span>{{
        linkedIssueDraft.generateNcNumber
          ? 'Generate NC Number automatically on submission'
          : 'Unnumbered'
      }}</span>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <div class="mb-1 text-gray-600">部件名称</div>
        <Input
          v-model:value="linkedIssueDraft.partName"
          :disabled="Boolean(linkedIssueDraft.partName)"
          placeholder="自动沿用检验记录，可手动补充"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">工序</div>
        <Input
          v-model:value="linkedIssueDraft.processName"
          :disabled="Boolean(linkedIssueDraft.processName)"
          placeholder="自动沿用检验记录，可手动补充"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">责任归属类型</div>
        <Select
          v-model:value="linkedIssueDraft.responsibilityType"
          :disabled="props.type === 'incoming'"
          :options="[
            {
              label: '内部部门',
              value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
            },
            {
              label: '供应商',
              value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
            },
            {
              label: '外协单位',
              value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
            },
          ]"
          class="w-full"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">责任部门</div>
        <TreeSelect
          v-model:value="linkedIssueDraft.responsibleDepartmentId"
          :tree-data="departmentTreeData"
          :tree-default-expand-all="true"
          class="w-full"
          placeholder="请选择责任部门"
        />
      </div>
      <div v-if="linkedIssueDraft.processName.includes('焊')">
        <div class="mb-1 text-gray-600">责任焊工</div>
        <Select
          v-model:value="linkedIssueDraft.responsibleWelder"
          :loading="welderLoading"
          :options="welderOptions"
          allow-clear
          show-search
          class="w-full"
          placeholder="请选择责任焊工"
          @change="handleWelderChange"
        />
      </div>
      <div v-if="isLinkedIssueExternalResponsibility">
        <div class="mb-1 text-gray-600">责任单位（供应商）</div>
        <SupplierSelect
          :value="linkedIssueDraft.supplierId || undefined"
          :category="linkedIssueSupplierCategory"
          :legacy-name="linkedIssueDraft.supplierName"
          value-mode="id"
          @change="handleLinkedIssueSupplierChange"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">报告日期</div>
        <Input :value="linkedIssueDraft.reportDate" disabled />
      </div>
      <div>
        <div class="mb-1 text-gray-600">检验员</div>
        <Input :value="linkedIssueDraft.reportedBy" disabled />
      </div>
      <div>
        <div class="mb-1 text-gray-600">缺陷分类</div>
        <Select
          v-model:value="linkedIssueDraft.defectCategoryId"
          :options="defectOptions"
          class="w-full"
          @change="
            () => {
              linkedIssueDraft.defectSubcategoryId =
                linkedDefectSubtypeOptions[0]?.value || '';
            }
          "
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">二级分类</div>
        <Select
          v-model:value="linkedIssueDraft.defectSubcategoryId"
          :options="linkedDefectSubtypeOptions"
          class="w-full"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">合格数量</div>
        <InputNumber
          :value="linkedIssueDraft.qualifiedQuantity"
          :min="0"
          class="w-full"
          disabled
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">不合格数量</div>
        <InputNumber
          v-model:value="linkedIssueDraft.unqualifiedQuantity"
          :min="0"
          :max="Math.max(1, Number(activeValues.quantity) || 1)"
          class="w-full"
          @change="
            (value) => {
              const totalQuantity = Math.max(
                1,
                Number(activeValues.quantity) || 1,
              );
              const normalized = Math.max(
                0,
                Math.min(totalQuantity, Number(value) || 0),
              );
              linkedIssueDraft.unqualifiedQuantity = normalized;
              linkedIssueDraft.qualifiedQuantity = totalQuantity - normalized;
            }
          "
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">严重程度</div>
        <Select
          v-model:value="linkedIssueDraft.severity"
          :options="severityOptions"
          class="w-full"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">状态</div>
        <Select
          v-model:value="linkedIssueDraft.status"
          :options="[
            { label: '待处理', value: 'OPEN' },
            { label: '处理中', value: 'IN_PROGRESS' },
            { label: '已关闭', value: 'CLOSED' },
          ]"
          class="w-full"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">是否索赔</div>
        <Select
          v-model:value="linkedIssueDraft.claim"
          :options="claimOptions"
          class="w-full"
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">损失金额</div>
        <InputNumber
          v-model:value="linkedIssueDraft.lossAmount"
          :min="0"
          :step="0.01"
          class="w-full"
        />
      </div>
      <div class="sm:col-span-2 lg:col-span-3">
        <div class="mb-1 text-gray-600">不合格描述</div>
        <Input.TextArea
          v-model:value="linkedIssueDraft.description"
          :rows="3"
          placeholder="请填写不合格描述"
        />
      </div>
      <div class="sm:col-span-2 lg:col-span-3">
        <div class="mb-1 text-gray-600">原因分析</div>
        <Input.TextArea
          v-model:value="linkedIssueDraft.rootCause"
          :rows="2"
          placeholder="请填写原因分析"
        />
      </div>
      <div class="sm:col-span-2 lg:col-span-3">
        <div class="mb-1 text-gray-600">解决方案</div>
        <Input.TextArea
          v-model:value="linkedIssueDraft.solution"
          :rows="2"
          placeholder="请填写解决方案"
        />
      </div>
      <div class="sm:col-span-2 lg:col-span-3">
        <IssuePhotoUpload
          v-model:value="linkedIssueDraft.photos"
          :max-count="8"
        />
      </div>
    </div>
  </div>
</template>
