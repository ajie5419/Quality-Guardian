<script setup lang="ts">
import type { UploadFile } from 'ant-design-vue';

import type {
  InspectionRequest,
  InspectionRequestAttachment,
} from '#/api/qms/inspection-request';
import type { TreeSelectNode } from '#/types';

import { computed, reactive, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  TreeSelect,
  Upload,
} from 'ant-design-vue';

import IssuePhotoUpload from '../../issues/components/IssuePhotoUpload.vue';

interface Props {
  open: boolean;
  submitting: boolean;
  closeForm: {
    attachments: InspectionRequestAttachment[];
    closeRemark: string;
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
  defectOptions: Array<{ label: string; value: string }>;
  linkedDefectSubtypeOptions: Array<{ label: string; value: string }>;
  severityOptions: Array<{ label: string; value: string }>;
  claimOptions: Array<{ label: string; value: string }>;
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

watch(
  () => props.open,
  (open) => {
    if (open) {
      syncFromProps();
    }
  },
  { immediate: true },
);

watch(
  () => localCloseForm.quantity,
  () => {
    if (shouldCreateLinkedIssue.value) {
      syncLocalLinkedIssueQuantities();
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

function handleSubmit() {
  emit('update:closeForm', cloneCloseForm(localCloseForm));
  emit('update:linkedIssueDraft', cloneLinkedIssueDraft(localLinkedIssueDraft));
  emit('submit');
}

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}
</script>

<template>
  <Modal
    :open="props.open"
    title="完成检验"
    :confirm-loading="props.submitting"
    :width="shouldCreateLinkedIssue ? 800 : 520"
    @ok="handleSubmit"
    @update:open="handleUpdateOpen"
  >
    <Form layout="vertical">
      <div class="mb-4 rounded border border-gray-100 bg-gray-50 px-3 py-2">
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
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
      <div class="grid grid-cols-2 gap-3">
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
      </div>
      <Form.Item label="检验记录">
        <Upload
          :file-list="props.closeAttachmentFileList"
          action="/api/upload"
          :headers="props.uploadHeaders"
          multiple
          @change="props.handleCloseAttachmentUploadChange"
        >
          <Button>
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
        <div class="grid grid-cols-3 gap-4">
          <div>
            <div class="mb-1 text-gray-600">部件名称</div>
            <Input
              v-model:value="localLinkedIssueDraft.partName"
              :disabled="
                Boolean(
                  props.currentRequest?.componentName ||
                    props.currentRequest?.partName,
                )
              "
              placeholder="自动沿用组件名称，可手动补充"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">工序</div>
            <Input
              v-model:value="localLinkedIssueDraft.processName"
              :disabled="Boolean(props.currentRequest?.processName)"
              placeholder="自动沿用，可手动补充"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">责任部门</div>
            <TreeSelect
              v-model:value="localLinkedIssueDraft.responsibleDepartment"
              :tree-data="props.deptTreeData"
              tree-default-expand-all
              show-search
              allow-clear
              class="w-full"
              placeholder="请选择责任部门"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">责任焊工</div>
            <Input
              v-model:value="localLinkedIssueDraft.responsibleWelder"
              placeholder="请填写责任焊工"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">责任单位（供应商）</div>
            <Input
              v-model:value="localLinkedIssueDraft.supplierName"
              placeholder="自动沿用供应商，可手动补充"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">报告日期</div>
            <Input :value="localLinkedIssueDraft.reportDate" disabled />
          </div>
          <div>
            <div class="mb-1 text-gray-600">检验员</div>
            <Input :value="localLinkedIssueDraft.reportedBy" disabled />
          </div>
          <div>
            <div class="mb-1 text-gray-600">缺陷分类</div>
            <Select
              v-model:value="localLinkedIssueDraft.defectType"
              :options="props.defectOptions"
              class="w-full"
              @change="
                () => {
                  localLinkedIssueDraft.defectSubtype =
                    props.linkedDefectSubtypeOptions[0]?.value || '';
                }
              "
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">二级分类</div>
            <Select
              v-model:value="localLinkedIssueDraft.defectSubtype"
              :options="props.linkedDefectSubtypeOptions"
              class="w-full"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">合格数量</div>
            <InputNumber
              :value="localLinkedIssueDraft.qualifiedQuantity"
              :min="0"
              class="w-full"
              disabled
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">不合格数量</div>
            <InputNumber
              v-model:value="localLinkedIssueDraft.unqualifiedQuantity"
              :min="0"
              :max="Math.max(1, Number(localCloseForm.quantity) || 1)"
              class="w-full"
              @change="syncLocalLinkedIssueQuantities"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">严重程度</div>
            <Select
              v-model:value="localLinkedIssueDraft.severity"
              :options="props.severityOptions"
              class="w-full"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">状态</div>
            <Select
              v-model:value="localLinkedIssueDraft.status"
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
              v-model:value="localLinkedIssueDraft.claim"
              :options="props.claimOptions"
              class="w-full"
            />
          </div>
          <div>
            <div class="mb-1 text-gray-600">损失金额</div>
            <InputNumber
              v-model:value="localLinkedIssueDraft.lossAmount"
              :min="0"
              :step="0.01"
              class="w-full"
            />
          </div>
          <div class="col-span-3">
            <div class="mb-1 text-gray-600">不合格描述</div>
            <Input.TextArea
              v-model:value="localLinkedIssueDraft.description"
              :rows="3"
              placeholder="请填写不合格描述"
            />
          </div>
          <div class="col-span-3">
            <div class="mb-1 text-gray-600">原因分析</div>
            <Input.TextArea
              v-model:value="localLinkedIssueDraft.rootCause"
              :rows="2"
              placeholder="请填写原因分析"
            />
          </div>
          <div class="col-span-3">
            <div class="mb-1 text-gray-600">解决方案</div>
            <Input.TextArea
              v-model:value="localLinkedIssueDraft.solution"
              :rows="2"
              placeholder="请填写解决方案"
            />
          </div>
          <div class="col-span-3">
            <IssuePhotoUpload
              v-model:value="localLinkedIssueDraft.photos"
              :max-count="8"
            />
          </div>
        </div>
      </div>
    </Form>
  </Modal>
</template>
