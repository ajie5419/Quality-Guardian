<script setup lang="ts">
import type {
  InspectionIssueResponsibilityType,
  InspectionRequest,
  InspectionRequestAttachment,
  InspectionRequestResponsibilityDepartmentOption,
  InspectionRequestResponsibilitySupplierOption,
} from '@qgs/shared';
import type { SelectProps, UploadFile } from 'ant-design-vue';

import type { TreeSelectNode } from '#/types';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
  Upload,
} from 'ant-design-vue';

import { getPublicInspectionRequestResponsibilityOptions } from '#/api/qms/inspection-request';
import { getWorkOrderListPage } from '#/api/qms/work-order';
import { useImageCompress } from '#/composables/useImageCompress';
import { useAdaptivePopup } from '#/hooks/useAdaptivePopup';

import IssueFormFields from '../../issues/components/IssueFormFields.vue';
import {
  buildInspectionIssuePayload,
  isExternalInspectionIssueResponsibility,
  normalizeInspectionIssueText,
} from '../../issues/components/issueFormPayload';
import { useStatusOptions } from '../../issues/constants';
import { resolveDivisionIdentity } from '../composables/useInspectionRequestTaskActions';
import { resolveTreeDepartmentIdentity } from '../inspection-request-responsibility';

interface Props {
  open: boolean;
  submitting: boolean;
  closeForm: {
    attachments: InspectionRequestAttachment[];
    closeRemark: string;
    hasDocuments: boolean;
    inspectionId: string;
    inspector: string;
    quantity: number;
    result: 'FAIL' | 'PASS';
  };
  linkedIssueDraft: {
    claim: string;
    defectCategoryId: string;
    defectSubcategoryId: string;
    description: string;
    division: string;
    divisionId: string;
    lossAmount: number;
    ncNumber: string;
    partName: string;
    photos: UploadFile[];
    processName: string;
    qualifiedQuantity: number;
    reportDate: string;
    reportedBy: string;
    responsibilityType: InspectionIssueResponsibilityType;
    responsibleDepartment: string;
    responsibleDepartmentId: string;
    responsibleWelder: string;
    rootCause: string;
    severity: string;
    solution: string;
    status: string;
    supplierId: string;
    supplierName: string;
    unqualifiedQuantity: number;
  };
  closeAttachmentFileList: UploadFile[];
  uploadHeaders: Record<string, string>;
  currentRequest?: InspectionRequest;
  deptTreeData: TreeSelectNode[];
  displayCloseReadonlyValue: (value?: null | string) => string;
  handleCloseAttachmentUploadChange: (info: {
    file: UploadFile;
    fileList: UploadFile[];
  }) => void;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  submit: [];
  'update:closeForm': [value: Props['closeForm']];
  'update:linkedIssueDraft': [value: Props['linkedIssueDraft']];
  'update:open': [value: boolean];
}>();

const { isMobile, modalWidth, modalWrapClassName } = useAdaptivePopup();
const { compressImage, isImage } = useImageCompress();
const { statusOptions } = useStatusOptions();

function cloneCloseForm(source: Props['closeForm']): Props['closeForm'] {
  return {
    ...source,
    attachments: [...source.attachments],
  };
}

function cloneLinkedIssueDraft(
  source: Props['linkedIssueDraft'],
): Props['linkedIssueDraft'] {
  return {
    ...source,
    photos: [...source.photos],
  };
}

function normalizeQuantity(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

const localCloseForm = reactive(cloneCloseForm(props.closeForm));
const localLinkedIssueDraft = reactive(
  cloneLinkedIssueDraft(props.linkedIssueDraft),
);
const shouldCreateLinkedIssue = computed(
  () => localCloseForm.result === 'FAIL',
);
const formFieldsRef = ref<InstanceType<typeof IssueFormFields> | null>(null);
const legacyResponsibilityLoading = ref(false);
const legacyResponsibilityError = ref('');
const legacyDepartments = ref<
  InspectionRequestResponsibilityDepartmentOption[]
>([]);
const legacySuppliers = ref<InspectionRequestResponsibilitySupplierOption[]>(
  [],
);

const hasLockedResponsibility = computed(() => {
  const responsibility = props.currentRequest?.issueResponsibility;
  if (!responsibility?.responsibleDepartmentId) return false;
  return (
    !isExternalInspectionIssueResponsibility(
      responsibility.responsibilityType,
    ) || Boolean(responsibility.supplierId)
  );
});

const responsibilityTypeOptions = [
  {
    label: '内部部门',
    value: 'INTERNAL_DEPARTMENT' as const,
  },
  { label: '供应商', value: 'SUPPLIER' as const },
  { label: '外协单位', value: 'OUTSOURCING_UNIT' as const },
];

function syncLocalLinkedIssueQuantities(unqualifiedValue?: unknown) {
  const totalQuantity = normalizeQuantity(localCloseForm.quantity);
  const rawUnqualified =
    unqualifiedValue === undefined
      ? localLinkedIssueDraft.unqualifiedQuantity
      : unqualifiedValue;
  const unqualifiedQuantity = Math.max(
    0,
    Math.min(totalQuantity, Number(rawUnqualified) || 0),
  );
  localLinkedIssueDraft.unqualifiedQuantity = unqualifiedQuantity;
  localLinkedIssueDraft.qualifiedQuantity = totalQuantity - unqualifiedQuantity;
}

function syncFromProps() {
  Object.assign(localCloseForm, cloneCloseForm(props.closeForm));
  Object.assign(
    localLinkedIssueDraft,
    cloneLinkedIssueDraft(props.linkedIssueDraft),
  );
}

async function loadLegacyResponsibilityOptions() {
  if (hasLockedResponsibility.value) return;
  legacyResponsibilityLoading.value = true;
  legacyResponsibilityError.value = '';
  try {
    const result = await getPublicInspectionRequestResponsibilityOptions({
      responsibilityType: localLinkedIssueDraft.responsibilityType,
    });
    if (
      result.responsibilityType !== localLinkedIssueDraft.responsibilityType
    ) {
      return;
    }
    legacyDepartments.value = result.departments;
    legacySuppliers.value = result.suppliers;
    if (
      isExternalInspectionIssueResponsibility(
        localLinkedIssueDraft.responsibilityType,
      )
    ) {
      localLinkedIssueDraft.responsibleDepartmentId =
        result.departments[0]?.value || '';
      localLinkedIssueDraft.responsibleDepartment =
        result.departments[0]?.label || '';
      localLinkedIssueDraft.supplierId = '';
      localLinkedIssueDraft.supplierName = '';
      return;
    }
    if (
      localLinkedIssueDraft.responsibleDepartmentId &&
      !result.departments.some(
        (department) =>
          department.value === localLinkedIssueDraft.responsibleDepartmentId,
      )
    ) {
      localLinkedIssueDraft.responsibleDepartmentId = '';
      localLinkedIssueDraft.responsibleDepartment = '';
    }
    localLinkedIssueDraft.supplierId = '';
    localLinkedIssueDraft.supplierName = '';
  } catch {
    legacyResponsibilityError.value =
      '责任归属选项加载失败，无法提交不合格项。';
    legacyDepartments.value = [];
    legacySuppliers.value = [];
    localLinkedIssueDraft.responsibleDepartmentId = '';
    localLinkedIssueDraft.supplierId = '';
  } finally {
    legacyResponsibilityLoading.value = false;
  }
}

async function changeLegacyResponsibilityType(value: SelectProps['value']) {
  if (
    value !== 'INTERNAL_DEPARTMENT' &&
    value !== 'SUPPLIER' &&
    value !== 'OUTSOURCING_UNIT'
  ) {
    return;
  }
  localLinkedIssueDraft.responsibilityType = value;
  await loadLegacyResponsibilityOptions();
  await applyEmbeddedValues();
}

async function selectLegacyInternalDepartment(value: SelectProps['value']) {
  const departmentId = typeof value === 'string' ? value : '';
  const department = legacyDepartments.value.find(
    (item) => item.value === departmentId,
  );
  localLinkedIssueDraft.responsibleDepartmentId = department?.value || '';
  localLinkedIssueDraft.responsibleDepartment = department?.label || '';
  await applyEmbeddedValues();
}

async function selectLegacySupplier(value: SelectProps['value']) {
  const supplierId = typeof value === 'string' ? value : '';
  const supplier = legacySuppliers.value.find(
    (item) => item.value === supplierId,
  );
  localLinkedIssueDraft.supplierId = supplier?.value || '';
  localLinkedIssueDraft.supplierName = supplier?.label || '';
  await applyEmbeddedValues();
}

function buildEmbeddedIssueValues() {
  const total = normalizeQuantity(localCloseForm.quantity);
  const responsibleDepartment = resolveTreeDepartmentIdentity(
    props.deptTreeData,
    {
      department: localLinkedIssueDraft.responsibleDepartment,
      departmentId: localLinkedIssueDraft.responsibleDepartmentId,
    },
  );
  return {
    workOrderNumber: props.currentRequest?.workOrderNumber || '',
    projectName: '',
    division: localLinkedIssueDraft.division,
    partName: localLinkedIssueDraft.partName,
    processName: localLinkedIssueDraft.processName,
    quantity: total,
    inspector: localLinkedIssueDraft.reportedBy,
    reportDate: localLinkedIssueDraft.reportDate,
    responsibilityType: localLinkedIssueDraft.responsibilityType,
    responsibleDepartmentId: responsibleDepartment.id,
    responsibleWelder: localLinkedIssueDraft.responsibleWelder,
    supplierId: localLinkedIssueDraft.supplierId,
    supplierName: localLinkedIssueDraft.supplierName,
    status: localLinkedIssueDraft.status,
    severity: localLinkedIssueDraft.severity,
    defectCategoryId: localLinkedIssueDraft.defectCategoryId,
    defectSubcategoryId: localLinkedIssueDraft.defectSubcategoryId,
    lossAmount: localLinkedIssueDraft.lossAmount,
    claim: localLinkedIssueDraft.claim,
    description: localLinkedIssueDraft.description,
    rootCause: localLinkedIssueDraft.rootCause,
    solution: localLinkedIssueDraft.solution,
    photos: localLinkedIssueDraft.photos,
  };
}

async function applyEmbeddedValues() {
  await nextTick();
  const fields = formFieldsRef.value;
  if (!fields) return;
  await fields.setValues(buildEmbeddedIssueValues());
  await fillWorkOrderInfo();
}

async function fillWorkOrderInfo() {
  const workOrderNumber = props.currentRequest?.workOrderNumber;
  const fields = formFieldsRef.value;
  if (!workOrderNumber || !fields) return;
  try {
    const result = await getWorkOrderListPage({
      ignoreYearFilter: true,
      workOrderNumber,
      pageSize: 1,
    });
    const matched = result.items.find(
      (item) => item.workOrderNumber === workOrderNumber,
    );
    if (!matched) return;
    const divisionIdentity = resolveDivisionIdentity(props.deptTreeData, {
      division: matched.division,
      divisionId: matched.divisionId,
    });
    Object.assign(localLinkedIssueDraft, divisionIdentity);
    await fields.setValues({
      projectName: matched.projectName || '',
      division: divisionIdentity.division,
    });
  } catch (error) {
    console.warn('[close-inspection] failed to load work order info', error);
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      syncFromProps();
      if (shouldCreateLinkedIssue.value) {
        if (!hasLockedResponsibility.value) {
          await loadLegacyResponsibilityOptions();
        }
        await applyEmbeddedValues();
      }
    }
  },
  { immediate: true },
);

watch(shouldCreateLinkedIssue, async (val) => {
  if (val) {
    if (!hasLockedResponsibility.value) {
      await loadLegacyResponsibilityOptions();
    }
    await applyEmbeddedValues();
  }
});

watch(
  () => props.deptTreeData,
  async () => {
    if (props.open && shouldCreateLinkedIssue.value) {
      await applyEmbeddedValues();
    }
  },
);

watch(
  () => localCloseForm.quantity,
  () => {
    if (shouldCreateLinkedIssue.value) {
      syncLocalLinkedIssueQuantities();
      const fields = formFieldsRef.value;
      if (fields) {
        void fields.setValues({
          quantity: normalizeQuantity(localCloseForm.quantity),
        });
      }
    }
  },
);

watch(
  localCloseForm,
  (value) => {
    emit('update:closeForm', cloneCloseForm(value));
  },
  { deep: true },
);

watch(
  localLinkedIssueDraft,
  (value) => {
    emit('update:linkedIssueDraft', cloneLinkedIssueDraft(value));
  },
  { deep: true },
);

async function collectIssueFromForm() {
  const fields = formFieldsRef.value;
  if (!fields) return false;
  const { valid } = await fields.validate();
  if (!valid) return false;
  const values = (await fields.getValues()) as Record<string, unknown>;
  const responsibilityPayload = buildInspectionIssuePayload({
    ...values,
    responsibilityType: localLinkedIssueDraft.responsibilityType,
  });
  const responsibleDepartment = resolveTreeDepartmentIdentity(
    props.deptTreeData,
    {
      department: localLinkedIssueDraft.responsibleDepartment,
      departmentId: responsibilityPayload.responsibleDepartmentId,
    },
  );
  const responsibilityType =
    responsibilityPayload.responsibilityType ||
    localLinkedIssueDraft.responsibilityType;
  const isExternal =
    isExternalInspectionIssueResponsibility(responsibilityType);
  const divisionIdentity = resolveDivisionIdentity(props.deptTreeData, {
    division: String(values.division || localLinkedIssueDraft.division || ''),
    divisionId: localLinkedIssueDraft.divisionId,
  });
  Object.assign(localLinkedIssueDraft, {
    ...divisionIdentity,
    responsibilityType,
    responsibleDepartment: responsibleDepartment.name,
    responsibleDepartmentId: responsibilityPayload.responsibleDepartmentId,
    supplierId: responsibilityPayload.supplierId || '',
    supplierName: isExternal
      ? normalizeInspectionIssueText(values.supplierName)
      : '',
    partName: normalizeInspectionIssueText(values.partName),
    processName: normalizeInspectionIssueText(values.processName),
    responsibleWelder: normalizeInspectionIssueText(values.responsibleWelder),
    status: normalizeInspectionIssueText(values.status) || 'OPEN',
    severity: normalizeInspectionIssueText(values.severity),
    defectCategoryId: normalizeInspectionIssueText(values.defectCategoryId),
    defectSubcategoryId: normalizeInspectionIssueText(
      values.defectSubcategoryId,
    ),
    lossAmount: Number(values.lossAmount) || 0,
    claim: normalizeInspectionIssueText(values.claim),
    description: normalizeInspectionIssueText(values.description),
    rootCause: normalizeInspectionIssueText(values.rootCause),
    solution: normalizeInspectionIssueText(values.solution),
    photos: Array.isArray(values.photos) ? (values.photos as UploadFile[]) : [],
  });
  return true;
}

async function handleSubmit() {
  if (props.submitting) return;
  if (shouldCreateLinkedIssue.value) {
    if (!hasLockedResponsibility.value && legacyResponsibilityError.value) {
      message.error('责任归属选项加载失败，无法提交不合格项');
      return;
    }
    const ok = await collectIssueFromForm();
    if (!ok) {
      message.error('请补全不合格项必填信息');
      return;
    }
  }
  localCloseForm.attachments = [...props.closeForm.attachments];
  emit('update:closeForm', cloneCloseForm(localCloseForm));
  emit('update:linkedIssueDraft', cloneLinkedIssueDraft(localLinkedIssueDraft));
  emit('submit');
}

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

async function handleBeforeUpload(file: File) {
  if (!isImage(file)) return true;
  return compressImage(file);
}
</script>

<template>
  <Modal
    :open="props.open"
    title="完成检验"
    :confirm-loading="props.submitting"
    :width="isMobile ? modalWidth : shouldCreateLinkedIssue ? 900 : 520"
    :wrap-class-name="modalWrapClassName"
    @ok="handleSubmit"
    @update:open="handleUpdateOpen"
  >
    <Form layout="vertical">
      <div class="mb-4 rounded border border-gray-100 bg-gray-50 px-3 py-2">
        <div
          class="grid gap-3 text-xs"
          :class="shouldCreateLinkedIssue ? 'grid-cols-1' : 'grid-cols-2'"
        >
          <div v-if="!shouldCreateLinkedIssue">
            <div class="mb-1 text-gray-500">已有检验记录 ID</div>
            <div class="truncate text-gray-400">
              {{ props.displayCloseReadonlyValue(localCloseForm.inspectionId) }}
            </div>
          </div>
          <div>
            <div class="mb-1 text-gray-500">检验员</div>
            <div class="truncate text-gray-500">
              {{ localCloseForm.inspector || '当前登录用户' }}
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Form.Item label="检验结果">
          <Select
            v-model:value="localCloseForm.result"
            :options="[
              { label: '合格', value: 'PASS' },
              { label: '不合格', value: 'FAIL' },
            ]"
          />
        </Form.Item>
        <Form.Item label="数量">
          <InputNumber
            v-model:value="localCloseForm.quantity"
            :min="1"
            class="w-full"
          />
        </Form.Item>
        <Form.Item v-if="!shouldCreateLinkedIssue" label="是否有资料">
          <Switch
            v-model:checked="localCloseForm.hasDocuments"
            checked-children="有"
            un-checked-children="无"
          />
        </Form.Item>
      </div>
      <Form.Item v-if="!shouldCreateLinkedIssue" label="检验记录">
        <Upload
          :file-list="props.closeAttachmentFileList"
          action="/api/upload"
          :headers="props.uploadHeaders"
          :before-upload="handleBeforeUpload"
          :disabled="props.submitting"
          multiple
          @change="props.handleCloseAttachmentUploadChange"
        >
          <Button :disabled="props.submitting">
            <template #icon>
              <IconifyIcon icon="lucide:upload" />
            </template>
            上传检验记录
          </Button>
        </Upload>
      </Form.Item>
      <Form.Item label="关闭备注">
        <Input.TextArea v-model:value="localCloseForm.closeRemark" />
      </Form.Item>

      <div
        v-if="shouldCreateLinkedIssue"
        class="mt-4 rounded border border-orange-200 bg-orange-50 p-4"
      >
        <div class="mb-3 font-medium text-orange-700">
          当前判定为“不合格”，请补充不合格项信息（保存时自动建立关联）
        </div>
        <div
          v-if="!hasLockedResponsibility"
          class="mb-4 rounded border border-orange-200 bg-white p-3"
        >
          <div class="mb-3 text-sm font-medium text-gray-700">
            历史报检任务未保存责任归属，请补充后提交
          </div>
          <div
            v-if="legacyResponsibilityError"
            class="mb-3 text-sm text-red-600"
          >
            {{ legacyResponsibilityError }}
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Form.Item label="责任归属类型" required>
              <Select
                :value="localLinkedIssueDraft.responsibilityType"
                :disabled="legacyResponsibilityLoading"
                :options="responsibilityTypeOptions"
                @change="changeLegacyResponsibilityType"
              />
            </Form.Item>
            <Form.Item
              v-if="
                localLinkedIssueDraft.responsibilityType ===
                'INTERNAL_DEPARTMENT'
              "
              label="责任部门"
              required
            >
              <Select
                :value="localLinkedIssueDraft.responsibleDepartmentId"
                :disabled="legacyResponsibilityLoading"
                :loading="legacyResponsibilityLoading"
                :options="legacyDepartments"
                placeholder="请选择责任部门"
                show-search
                @change="selectLegacyInternalDepartment"
              />
            </Form.Item>
            <template v-else>
              <Form.Item label="责任部门" required>
                <Input
                  :value="
                    legacyDepartments.find(
                      (department) =>
                        department.value ===
                        localLinkedIssueDraft.responsibleDepartmentId,
                    )?.label || '责任部门策略加载中'
                  "
                  readonly
                />
              </Form.Item>
              <Form.Item
                :label="
                  localLinkedIssueDraft.responsibilityType ===
                  'OUTSOURCING_UNIT'
                    ? '外协单位'
                    : '供应商'
                "
                required
              >
                <Select
                  :value="localLinkedIssueDraft.supplierId"
                  :disabled="legacyResponsibilityLoading"
                  :loading="legacyResponsibilityLoading"
                  :options="legacySuppliers"
                  :placeholder="
                    localLinkedIssueDraft.responsibilityType ===
                    'OUTSOURCING_UNIT'
                      ? '请选择外协单位'
                      : '请选择供应商'
                  "
                  show-search
                  @change="selectLegacySupplier"
                />
              </Form.Item>
            </template>
          </div>
        </div>
        <IssueFormFields
          ref="formFieldsRef"
          mode="embedded"
          :is-edit-mode="false"
          :dept-tree-data="props.deptTreeData"
          :responsibility-type="localLinkedIssueDraft.responsibilityType"
          :status-options="statusOptions"
        />
      </div>
    </Form>
  </Modal>
</template>
