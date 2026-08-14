<script setup lang="ts">
import type {
  InspectionIssueResponsibilityType,
  InspectionRequest,
  InspectionRequestResponsibilityDepartmentOption,
  InspectionRequestResponsibilitySupplierOption,
  QualityClassificationCategory,
} from '@qgs/shared';
import type {
  SelectProps,
  UploadChangeParam,
  UploadProps,
} from 'ant-design-vue';
import type { UploadFile } from 'ant-design-vue/es/upload/interface';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  isExternalInspectionIssueResponsibility,
} from '@qgs/shared';
import {
  Button,
  Descriptions,
  DescriptionsItem,
  Form,
  FormItem,
  InputNumber,
  message,
  Segmented,
  Select,
  Spin,
  Switch,
  Textarea,
  Upload,
} from 'ant-design-vue';

import {
  closeInspectionRequest,
  getInspectionRequest,
  getPublicInspectionRequestResponsibilityOptions,
} from '#/api/qms/inspection-request';
import { getQualityClassificationOptionsApi } from '#/api/qms/quality-classification';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const loading = ref(false);
const submitting = ref(false);
const task = ref<InspectionRequest | null>(null);
const fileList = ref<UploadFile[]>([]);
const responsibilityLoading = ref(false);
const responsibilityDepartments = ref<
  InspectionRequestResponsibilityDepartmentOption[]
>([]);
const responsibilitySuppliers = ref<
  InspectionRequestResponsibilitySupplierOption[]
>([]);
const classificationCategories = ref<QualityClassificationCategory[]>([]);
let responsibilityOptionsRequestSequence = 0;
const form = reactive({
  closeRemark: '',
  defectCategoryId: '',
  defectSubcategoryId: '',
  description: '',
  generateNcNumber: false,
  hasDocuments: true,
  lossAmount: 0,
  result: 'PASS' as 'FAIL' | 'PASS',
  rootCause: '',
  severity: 'Minor',
  solution: '',
});
const responsibility = reactive<{
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
}>({
  responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
  responsibleDepartmentId: '',
  supplierId: '',
});

const resultOptions = [
  { label: 'Pass', value: 'PASS' },
  { label: 'Fail', value: 'FAIL' },
];
const requestId = computed(() => String(route.params.id || ''));
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));
const responsibilityTypeOptions = computed(() => {
  const options = [
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
  ];
  return task.value?.category === 'PROCESS'
    ? options.filter(
        (option) =>
          option.value !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
      )
    : options;
});
const hasLockedResponsibility = computed(() => {
  const responsibilityType = task.value?.responsibilityType;
  if (!responsibilityType) return false;
  if (!task.value?.responsibleDepartmentId) return false;
  return isExternalInspectionIssueResponsibility(responsibilityType)
    ? Boolean(task.value.supplierId)
    : !task.value.supplierId;
});
const isOutsourcingResponsibility = computed(
  () =>
    responsibility.responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
);
const requiresSupplier = computed(() =>
  isExternalInspectionIssueResponsibility(responsibility.responsibilityType),
);
const defectCategoryOptions = computed(() =>
  classificationCategories.value.map((category) => ({
    label: category.name,
    value: category.id,
  })),
);
const defectSubcategoryOptions = computed(() =>
  (
    classificationCategories.value.find(
      (category) => category.id === form.defectCategoryId,
    )?.subcategories || []
  ).map((subcategory) => ({
    label: subcategory.name,
    value: subcategory.id,
  })),
);
const severityOptions = [
  { label: 'Minor', value: 'Minor' },
  { label: 'Major', value: 'Major' },
  { label: 'Critical', value: 'Critical' },
];
const responsibilitySupplierLabel = computed(() =>
  responsibility.responsibilityType ===
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
    ? '外协单位'
    : '供应商',
);

const beforeUpload: UploadProps['beforeUpload'] = () => true;

function handleUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    if (applyUploadResponse(info.file)) {
      message.success(`${info.file.name} uploaded`);
    } else {
      message.warning('Photo uploaded without a valid file URL');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} upload failed`);
  }
  fileList.value = [...info.fileList];
}

async function loadDetail() {
  loading.value = true;
  try {
    task.value = await getInspectionRequest(requestId.value);
    if (hasLockedResponsibility.value && task.value.responsibilityType) {
      responsibility.responsibilityType = task.value.responsibilityType;
      responsibility.responsibleDepartmentId =
        task.value.responsibilityType ===
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
          ? ''
          : task.value.responsibleDepartmentId || '';
      responsibility.supplierId = task.value.supplierId || '';
      return;
    }
    if (
      task.value.responsibilityType &&
      responsibilityTypeOptions.value.some(
        (option) => option.value === task.value?.responsibilityType,
      )
    ) {
      responsibility.responsibilityType = task.value.responsibilityType;
    }
    responsibility.responsibleDepartmentId =
      responsibility.responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
        ? ''
        : task.value.responsibleDepartmentId || '';
    responsibility.supplierId = task.value.supplierId || '';
    await loadResponsibilityOptions();
  } finally {
    loading.value = false;
  }
}

async function loadClassificationOptions() {
  try {
    classificationCategories.value = await getQualityClassificationOptionsApi(
      'INSPECTION_ISSUE_DEFECT',
    );
  } catch {
    classificationCategories.value = [];
    message.error('Failed to load defect classifications');
  }
}

async function loadResponsibilityOptions() {
  if (hasLockedResponsibility.value) return;
  const requestedType = responsibility.responsibilityType;
  const requestedSequence = ++responsibilityOptionsRequestSequence;
  responsibilityLoading.value = true;
  try {
    const options = await getPublicInspectionRequestResponsibilityOptions({
      responsibilityType: requestedType,
    });
    if (requestedSequence !== responsibilityOptionsRequestSequence) return;
    if (options.responsibilityType !== requestedType) {
      throw new Error('Missing responsibility options');
    }
    responsibilityDepartments.value = options.departments;
    responsibilitySuppliers.value = options.suppliers;
    if (
      !isOutsourcingResponsibility.value &&
      responsibility.responsibleDepartmentId &&
      !options.departments.some(
        (option) => option.value === responsibility.responsibleDepartmentId,
      )
    ) {
      responsibility.responsibleDepartmentId = '';
    }
    if (
      !requiresSupplier.value ||
      !options.suppliers.some(
        (option) => option.value === responsibility.supplierId,
      )
    ) {
      responsibility.supplierId = '';
    }
  } catch {
    if (requestedSequence !== responsibilityOptionsRequestSequence) return;
    responsibilityDepartments.value = [];
    responsibilitySuppliers.value = [];
    message.error('Failed to load responsibility options');
  } finally {
    if (requestedSequence === responsibilityOptionsRequestSequence) {
      responsibilityLoading.value = false;
    }
  }
}

function isResponsibilityType(
  value: string,
): value is InspectionIssueResponsibilityType {
  return (
    value === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT ||
    value === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER ||
    value === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  );
}

function changeResponsibilityType(value: SelectProps['value']) {
  if (
    typeof value !== 'string' ||
    !isResponsibilityType(value) ||
    !responsibilityTypeOptions.value.some((option) => option.value === value)
  ) {
    return;
  }
  responsibility.responsibilityType = value;
  responsibility.responsibleDepartmentId = '';
  responsibility.supplierId = '';
  void loadResponsibilityOptions();
}

function changeDefectCategory(value: SelectProps['value']) {
  form.defectCategoryId = typeof value === 'string' ? value : '';
  form.defectSubcategoryId = '';
}

function buildCloseResponsibility() {
  const supplierId = responsibility.supplierId.trim();
  if (isOutsourcingResponsibility.value) {
    return supplierId
      ? {
          responsibilityType: responsibility.responsibilityType,
          supplierId,
        }
      : null;
  }
  const responsibleDepartmentId = responsibility.responsibleDepartmentId.trim();
  if (!responsibleDepartmentId) return null;
  if (!requiresSupplier.value) {
    return {
      responsibilityType: responsibility.responsibilityType,
      responsibleDepartmentId,
    };
  }
  return supplierId
    ? {
        responsibilityType: responsibility.responsibilityType,
        responsibleDepartmentId,
        supplierId,
      }
    : null;
}

function buildLinkedIssue(input: {
  attachments: Array<{ url: string }>;
  quantity: number;
  responsibility: NonNullable<ReturnType<typeof buildCloseResponsibility>>;
}) {
  const description = form.description.trim();
  const rootCause = form.rootCause.trim();
  const solution = form.solution.trim();
  if (
    input.attachments.length === 0 ||
    !form.defectCategoryId ||
    !form.defectSubcategoryId ||
    !description ||
    !rootCause ||
    !solution ||
    !task.value
  ) {
    return null;
  }
  return {
    ...input.responsibility,
    defectCategoryId: form.defectCategoryId,
    defectSubcategoryId: form.defectSubcategoryId,
    description,
    generateNcNumber: form.generateNcNumber,
    lossAmount: form.lossAmount,
    partName: task.value.partName,
    photos: input.attachments.map((attachment) => attachment.url),
    processName: task.value.processName,
    quantity: input.quantity,
    rootCause,
    severity: form.severity,
    solution,
    status: 'OPEN',
  };
}

async function submitResult() {
  if (!task.value) return;
  const issueResponsibility = buildCloseResponsibility();
  if (!issueResponsibility) {
    message.warning('Select a complete responsibility before submitting');
    return;
  }
  const closeResponsibility = hasLockedResponsibility.value
    ? undefined
    : issueResponsibility;
  submitting.value = true;
  try {
    const quantity = task.value.quantity || 1;
    const attachments = normalizeUploadFileList(
      fileList.value,
      'Inspection photo',
    ).filter(
      (attachment): attachment is NonNullable<typeof attachment> =>
        attachment !== null,
    );
    if (attachments.length === 0) {
      message.warning(
        form.result === 'PASS'
          ? 'Upload at least one inspection record before submitting'
          : 'Upload at least one nonconformance photo before submitting',
      );
      return;
    }
    const linkedIssue =
      form.result === 'FAIL'
        ? buildLinkedIssue({
            attachments,
            quantity,
            responsibility: issueResponsibility,
          })
        : undefined;
    if (form.result === 'FAIL' && !linkedIssue) {
      message.warning('Complete the nonconformance details before submitting');
      return;
    }
    await closeInspectionRequest(requestId.value, {
      attachments,
      closeRemark: form.closeRemark || undefined,
      hasDocuments: form.hasDocuments,
      qualifiedQuantity: form.result === 'PASS' ? quantity : 0,
      quantity,
      result: form.result,
      ...(closeResponsibility ? { responsibility: closeResponsibility } : {}),
      ...(linkedIssue ? { linkedIssue } : {}),
      unqualifiedQuantity: form.result === 'FAIL' ? quantity : 0,
    });
    message.success('Inspection submitted');
    await router.replace('/mobile/tasks');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadDetail();
  void loadClassificationOptions();
});
</script>

<template>
  <div class="mobile-inspect">
    <Spin :spinning="loading">
      <Descriptions
        v-if="task"
        class="task-detail"
        :column="1"
        bordered
        size="small"
      >
        <DescriptionsItem label="编号">
          {{ task.requestNo }}
        </DescriptionsItem>
        <DescriptionsItem label="工单号">
          {{ task.workOrderNumber }}
        </DescriptionsItem>
        <DescriptionsItem label="零件">
          {{ task.partName }}
        </DescriptionsItem>
        <DescriptionsItem label="工序">
          {{ task.processName }}
        </DescriptionsItem>
        <DescriptionsItem label="数量">
          {{ task.quantity }}
        </DescriptionsItem>
      </Descriptions>

      <Form class="inspect-form" layout="vertical">
        <FormItem label="检验结果" required>
          <Segmented
            v-model:value="form.result"
            block
            :options="resultOptions"
          />
        </FormItem>
        <template v-if="!hasLockedResponsibility">
          <FormItem label="责任归属类型" required>
            <Select
              :value="responsibility.responsibilityType"
              :options="responsibilityTypeOptions"
              :loading="responsibilityLoading"
              @update:value="changeResponsibilityType"
            />
          </FormItem>
          <FormItem
            v-if="!isOutsourcingResponsibility"
            label="责任部门"
            required
          >
            <Select
              v-model:value="responsibility.responsibleDepartmentId"
              :disabled="responsibilityLoading"
              :options="responsibilityDepartments"
              placeholder="请选择责任部门"
            />
          </FormItem>
          <FormItem
            v-if="requiresSupplier"
            :label="responsibilitySupplierLabel"
            required
          >
            <Select
              v-model:value="responsibility.supplierId"
              :disabled="responsibilityLoading"
              :options="responsibilitySuppliers"
              :placeholder="`请选择${responsibilitySupplierLabel}`"
            />
          </FormItem>
        </template>
        <FormItem label="是否有资料" required>
          <Switch
            v-model:checked="form.hasDocuments"
            checked-children="有"
            un-checked-children="无"
          />
        </FormItem>
        <FormItem label="备注">
          <Textarea
            v-model:value="form.closeRemark"
            :maxlength="300"
            placeholder="检验备注（选填）"
            :rows="4"
          />
        </FormItem>
        <FormItem
          :label="form.result === 'FAIL' ? '不合格项照片' : '检验记录'"
          required
        >
          <Upload
            v-model:file-list="fileList"
            accept="image/*"
            action="/api/upload"
            capture="environment"
            :headers="uploadHeaders"
            list-type="picture-card"
            :max-count="3"
            :multiple="false"
            :before-upload="beforeUpload"
            @change="handleUploadChange"
          >
            <div v-if="fileList.length < 3">拍照</div>
          </Upload>
        </FormItem>
        <template v-if="form.result === 'FAIL'">
          <FormItem label="缺陷分类" required>
            <Select
              :value="form.defectCategoryId"
              :options="defectCategoryOptions"
              placeholder="请选择缺陷分类"
              @update:value="changeDefectCategory"
            />
          </FormItem>
          <FormItem label="二级分类" required>
            <Select
              v-model:value="form.defectSubcategoryId"
              :disabled="!form.defectCategoryId"
              :options="defectSubcategoryOptions"
              placeholder="请选择二级分类"
            />
          </FormItem>
          <FormItem label="严重程度" required>
            <Select v-model:value="form.severity" :options="severityOptions" />
          </FormItem>
          <FormItem label="不合格描述" required>
            <Textarea
              v-model:value="form.description"
              :maxlength="500"
              placeholder="请描述不合格情况"
              :rows="3"
            />
          </FormItem>
          <FormItem label="原因分析" required>
            <Textarea
              v-model:value="form.rootCause"
              :maxlength="500"
              placeholder="请填写原因分析"
              :rows="3"
            />
          </FormItem>
          <FormItem label="解决措施" required>
            <Textarea
              v-model:value="form.solution"
              :maxlength="500"
              placeholder="请填写解决措施"
              :rows="3"
            />
          </FormItem>
          <FormItem label="损失金额">
            <InputNumber
              v-model:value="form.lossAmount"
              :min="0"
              class="full-width"
            />
          </FormItem>
          <FormItem label="生成不合格编号">
            <Switch v-model:checked="form.generateNcNumber" />
          </FormItem>
        </template>
        <Button
          block
          type="primary"
          :loading="submitting"
          @click="submitResult"
        >
          提交结果
        </Button>
      </Form>
    </Spin>
  </div>
</template>

<style scoped>
.mobile-inspect {
  display: grid;
  gap: 12px;
}

.task-detail,
.inspect-form {
  padding: 12px;
  background: #fff;
  border: 1px solid #ececec;
  border-radius: 8px;
}

.inspect-form {
  margin-top: 12px;
}

.full-width {
  width: 100%;
}
</style>
