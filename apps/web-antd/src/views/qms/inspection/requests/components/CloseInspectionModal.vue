<script setup lang="ts">
import type {
  InspectionRequest,
  InspectionRequestAttachment,
} from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';

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

import { getWorkOrderListPage } from '#/api/qms/work-order';
import { useImageCompress } from '#/composables/useImageCompress';
import { useAdaptivePopup } from '#/hooks/useAdaptivePopup';

import IssueFormFields from '../../issues/components/IssueFormFields.vue';
import { useStatusOptions } from '../../issues/constants';

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
    defectSubtype: string;
    defectType: string;
    description: string;
    lossAmount: number;
    ncNumber: string;
    partName: string;
    photos: UploadFile[];
    processName: string;
    qualifiedQuantity: number;
    reportDate: string;
    reportedBy: string;
    responsibleDepartment: string;
    responsibleWelder: string;
    rootCause: string;
    severity: string;
    solution: string;
    status: string;
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

function buildEmbeddedIssueValues() {
  const total = normalizeQuantity(localCloseForm.quantity);
  return {
    workOrderNumber: props.currentRequest?.workOrderNumber || '',
    projectName: '',
    division: '',
    partName: localLinkedIssueDraft.partName,
    processName: localLinkedIssueDraft.processName,
    quantity: total,
    inspector: localLinkedIssueDraft.reportedBy,
    reportDate: localLinkedIssueDraft.reportDate,
    responsibleDepartment: localLinkedIssueDraft.responsibleDepartment,
    responsibleDepartments: localLinkedIssueDraft.responsibleDepartment
      ? [localLinkedIssueDraft.responsibleDepartment]
      : [],
    responsibleWelder: localLinkedIssueDraft.responsibleWelder,
    supplierName: localLinkedIssueDraft.supplierName,
    status: localLinkedIssueDraft.status,
    severity: localLinkedIssueDraft.severity,
    defectType: localLinkedIssueDraft.defectType,
    defectSubtype: localLinkedIssueDraft.defectSubtype,
    lossAmount: localLinkedIssueDraft.lossAmount,
    ncNumber: localLinkedIssueDraft.ncNumber,
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
  fields.resetAutoNc();
  await fields.setValues(buildEmbeddedIssueValues());
  await fillWorkOrderInfo();
}

async function fillWorkOrderInfo() {
  const workOrderNumber = props.currentRequest?.workOrderNumber;
  const fields = formFieldsRef.value;
  if (!workOrderNumber || !fields) return;
  try {
    const result = await getWorkOrderListPage({
      workOrderNumber,
      pageSize: 1,
    });
    const matched = result.items.find(
      (item) => item.workOrderNumber === workOrderNumber,
    );
    if (!matched) return;
    await fields.setValues({
      projectName: matched.projectName || '',
      division: matched.division || '',
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
        await applyEmbeddedValues();
      }
    }
  },
  { immediate: true },
);

watch(shouldCreateLinkedIssue, async (val) => {
  if (val) {
    await applyEmbeddedValues();
  }
});

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
  const responsibleDepartments = Array.isArray(values.responsibleDepartments)
    ? (values.responsibleDepartments as string[])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    : [];
  const responsibleDepartment =
    responsibleDepartments[0] ||
    String(values.responsibleDepartment || '') ||
    localLinkedIssueDraft.responsibleDepartment ||
    '';
  Object.assign(localLinkedIssueDraft, {
    partName: String(values.partName || ''),
    processName: String(values.processName || ''),
    responsibleDepartment,
    responsibleWelder: String(values.responsibleWelder || ''),
    supplierName: String(values.supplierName || ''),
    status: String(values.status || 'OPEN'),
    severity: String(values.severity || ''),
    defectType: String(values.defectType || ''),
    defectSubtype: String(values.defectSubtype || ''),
    lossAmount: Number(values.lossAmount) || 0,
    ncNumber: String(values.ncNumber || ''),
    claim: String(values.claim || ''),
    description: String(values.description || ''),
    rootCause: String(values.rootCause || ''),
    solution: String(values.solution || ''),
    photos: Array.isArray(values.photos) ? (values.photos as UploadFile[]) : [],
  });
  return true;
}

async function handleSubmit() {
  if (props.submitting) return;
  if (shouldCreateLinkedIssue.value) {
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
        <IssueFormFields
          ref="formFieldsRef"
          mode="embedded"
          :is-edit-mode="false"
          :dept-tree-data="props.deptTreeData"
          :status-options="statusOptions"
        />
      </div>
    </Form>
  </Modal>
</template>
