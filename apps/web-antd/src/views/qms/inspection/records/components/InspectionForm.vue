<script lang="ts" setup>
import type { UploadFileWithResponse } from '../../issues/types';

import type { QmsInspectionApi } from '#/api/qms/inspection';

import { computed, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import { Input, InputNumber, message, Select } from 'ant-design-vue';
import dayjs from 'dayjs';

import { useVbenForm } from '#/adapter/form';
import { getWelderListPage } from '#/api/qms/welder';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import SupplierSelect from '../../../shared/components/SupplierSelect.vue';
import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';
import IssuePhotoUpload from '../../issues/components/IssuePhotoUpload.vue';
import {
  DEFAULT_VALUES,
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
} from '../../issues/constants';
import BomItemSelect from './form/BomItemSelect.vue';
import TeamSelect from './form/TeamSelect.vue';
import { getFormSchema } from './formData';
import {
  deriveIssuePartName,
  deriveIssueProcessName,
  deriveResponsibleDepartment,
  normalizeIssuePhotoUrls,
} from './inspection-form.utils';

const props = defineProps<{
  record?: QmsInspectionApi.InspectionRecord;
  type: string;
}>();

interface LinkedIssueDraft {
  claim: string;
  defectSubtype: string;
  defectType: string;
  description: string;
  lossAmount: number;
  partName: string;
  processName: string;
  qualifiedQuantity: number;
  reportDate: string;
  reportedBy: string;
  responsibleWelder: string;
  rootCause: string;
  solution: string;
  status: string;
  supplierName: string;
  photos: UploadFileWithResponse[];
  unqualifiedQuantity: number;
  responsibleDepartment: string;
  severity: string;
}

const userStore = useUserStore();
const { handleApiError } = useErrorHandler();
const { defectOptions, defectSubtypes } = useDefectOptions();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();

const linkedIssueDraft = ref<LinkedIssueDraft>({
  claim: DEFAULT_VALUES.DEFAULT_CLAIM,
  defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
  defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
  description: '',
  lossAmount: 0,
  partName: '',
  processName: '',
  qualifiedQuantity: 1,
  reportDate: dayjs().format('YYYY-MM-DD'),
  reportedBy: '',
  responsibleWelder: '',
  rootCause: '',
  solution: '',
  status: 'OPEN',
  supplierName: '',
  photos: [],
  unqualifiedQuantity: 0,
  responsibleDepartment: '',
  severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
});
const linkedDefectSubtypeOptions = computed(() => {
  const defectType = linkedIssueDraft.value.defectType;
  return defectSubtypes.value[defectType] || [];
});
const shouldCreateLinkedIssue = computed(
  () => String(activeValues.value.result || '').toUpperCase() === 'FAIL',
);

// Local reactive state for form values to ensure filtering logic is reactive
const activeValues = ref<Record<string, unknown>>({});
const welderOptions = ref<Array<{ label: string; value: string }>>([]);
const welderLoading = ref(false);

const [Form, formApi] = useVbenForm({
  handleSubmit: () => {}, // Handled by parent
  schema: getFormSchema(props.type),
  showDefaultActions: false,
  wrapperClass: 'grid grid-cols-3 gap-x-4 gap-y-1',
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
          value: name,
        };
      })
      .filter(Boolean) as Array<{ label: string; value: string }>;
  } catch (error) {
    handleApiError(error, 'Load Welder Options');
  } finally {
    welderLoading.value = false;
  }
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
    if (!String(linkedIssueDraft.value.responsibleDepartment || '').trim()) {
      linkedIssueDraft.value.responsibleDepartment =
        deriveResponsibleDepartment(props.type, values);
    }
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

async function handleSupplierChange(val: string | undefined) {
  formApi.setFieldValue('supplierName', val);
  setTimeout(() => {
    formApi.validateField('supplierName');
  }, 200);
}

function clearFieldValidator(fieldName: string) {
  setTimeout(() => {
    formApi.validateField(fieldName);
  }, 200);
}

watch(
  () => props.type,
  (newType) => {
    formApi.setState({ schema: getFormSchema(newType) });
  },
  { immediate: true },
);

// Watch for incomingType changes to switch Supplier/Outsourcing
watch(
  () => activeValues.value.incomingType,
  (newVal, oldVal) => {
    if (props.type === 'incoming') {
      const isMachined = newVal === '机加成品件';
      formApi.updateSchema([
        {
          fieldName: 'supplierName',
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
        formApi.setFieldValue('supplierName', undefined);
      }
    }
  },
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
      defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
      defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
      description: '',
      lossAmount: 0,
      partName: deriveIssuePartName(activeValues.value),
      processName: deriveIssueProcessName(activeValues.value),
      qualifiedQuantity: Math.max(1, Number(activeValues.value.quantity) || 1),
      reportDate: String(activeValues.value.inspectionDate || '').slice(0, 10),
      reportedBy: String(activeValues.value.inspector || ''),
      responsibleWelder: '',
      rootCause: '',
      solution: '',
      status: 'OPEN',
      supplierName: String(activeValues.value.supplierName || ''),
      photos: [],
      unqualifiedQuantity: 0,
      responsibleDepartment: deriveResponsibleDepartment(
        props.type,
        activeValues.value,
      ),
      severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
    };
  },
  { immediate: true },
);

void loadWelderOptions();

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
      qualifiedQuantity,
      unqualifiedQuantity,
      linkedIssue: shouldCreateLinkedIssue.value
        ? {
            ...linkedIssueDraft.value,
            partName: deriveIssuePartName(activeValues.value),
            processName: deriveIssueProcessName(activeValues.value),
            responsibleDepartment: deriveResponsibleDepartment(
              props.type,
              activeValues.value,
            ),
            supplierName: String(activeValues.value.supplierName || '').trim(),
            reportDate: String(activeValues.value.inspectionDate || '')
              .trim()
              .slice(0, 10),
            reportedBy: String(activeValues.value.inspector || '').trim(),
            photos: normalizeIssuePhotoUrls(linkedIssueDraft.value.photos),
            enabled: true,
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
      if (!linkedIssueDraft.value.responsibleDepartment.trim()) {
        message.warning('请填写责任部门');
        throw new Error('Issue responsible department required');
      }
      if (!linkedIssueDraft.value.defectType.trim()) {
        message.warning('请选择缺陷分类');
        throw new Error('Issue defect type required');
      }
      if (!linkedIssueDraft.value.defectSubtype.trim()) {
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
    <template #supplierName="slotProps">
      <SupplierSelect v-bind="slotProps" @change="handleSupplierChange" />
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
    <template #team="slotProps">
      <TeamSelect
        v-bind="slotProps"
        @change="
          (val) => {
            formApi.setFieldValue('team', val);
            clearFieldValidator('team');
          }
        "
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
    <div class="grid grid-cols-3 gap-4">
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
        <div class="mb-1 text-gray-600">责任部门</div>
        <Input
          v-model:value="linkedIssueDraft.responsibleDepartment"
          :disabled="Boolean(linkedIssueDraft.responsibleDepartment)"
          placeholder="自动沿用班组，可手动补充"
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
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">责任单位（供应商）</div>
        <Input
          v-model:value="linkedIssueDraft.supplierName"
          :disabled="Boolean(linkedIssueDraft.supplierName)"
          placeholder="自动沿用供应商，可手动补充"
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
          v-model:value="linkedIssueDraft.defectType"
          :options="defectOptions"
          class="w-full"
          @change="
            () => {
              linkedIssueDraft.defectSubtype =
                linkedDefectSubtypeOptions[0]?.value || '';
            }
          "
        />
      </div>
      <div>
        <div class="mb-1 text-gray-600">二级分类</div>
        <Select
          v-model:value="linkedIssueDraft.defectSubtype"
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
      <div class="col-span-3">
        <div class="mb-1 text-gray-600">不合格描述</div>
        <Input.TextArea
          v-model:value="linkedIssueDraft.description"
          :rows="3"
          placeholder="请填写不合格描述"
        />
      </div>
      <div class="col-span-3">
        <div class="mb-1 text-gray-600">原因分析</div>
        <Input.TextArea
          v-model:value="linkedIssueDraft.rootCause"
          :rows="2"
          placeholder="请填写原因分析"
        />
      </div>
      <div class="col-span-3">
        <div class="mb-1 text-gray-600">解决方案</div>
        <Input.TextArea
          v-model:value="linkedIssueDraft.solution"
          :rows="2"
          placeholder="请填写解决方案"
        />
      </div>
      <div class="col-span-3">
        <IssuePhotoUpload
          v-model:value="linkedIssueDraft.photos"
          :max-count="8"
        />
      </div>
    </div>
  </div>
</template>
