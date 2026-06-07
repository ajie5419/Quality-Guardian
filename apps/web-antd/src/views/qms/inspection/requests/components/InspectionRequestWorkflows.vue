<script setup lang="ts">
import type { UploadFile } from 'ant-design-vue';

import type { DispatchDetailDrawerProps } from './DispatchDetailDrawer.vue';

import type {
  InspectionRequest,
  InspectionRequestAttachment,
} from '#/api/qms/inspection-request';
import type { TreeSelectNode } from '#/types';

import CloseInspectionModal from './CloseInspectionModal.vue';
import CloseQrModal from './CloseQrModal.vue';
import DispatchDetailDrawer from './DispatchDetailDrawer.vue';
import DispatchTaskModal from './DispatchTaskModal.vue';
import InspectorStatusDrawer from './InspectorStatusDrawer.vue';

type DispatchForm = {
  dispatchRemark: string;
  inspectorId: string;
  priority: number;
};

type CloseForm = {
  attachments: InspectionRequestAttachment[];
  closeRemark: string;
  hasDocuments: boolean;
  inspectionId: string;
  inspector: string;
  quantity: number;
  result: 'FAIL' | 'PASS';
};

type LinkedIssueDraft = {
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

type InspectorStatusItem = {
  activeTaskCount: number;
  averageTaskMinutes: number;
  completedTaskCount: number;
  currentTaskMinutes: number;
  inspector: string;
  status: 'BUSY' | 'IDLE';
};

interface Props {
  claimOptions: Array<{ label: string; value: string }>;
  closeAttachmentFileList: UploadFile[];
  closeForm: CloseForm;
  closeOpen: boolean;
  closeQr: string;
  closeQrOpen: boolean;
  currentRequest?: InspectionRequest;
  defectOptions: Array<{ label: string; value: string }>;
  deptTreeData: TreeSelectNode[];
  detailDrawerProps: Omit<DispatchDetailDrawerProps, 'open'>;
  dispatchDetailOpen: boolean;
  dispatchForm: DispatchForm;
  dispatchOpen: boolean;
  displayCloseReadonlyValue: (value?: null | string) => string;
  handleCloseAttachmentUploadChange: (info: {
    file: UploadFile;
    fileList: UploadFile[];
  }) => void;
  inspectorStatusItems: InspectorStatusItem[];
  inspectorStatusOpen: boolean;
  linkedDefectSubtypeOptions: Array<{ label: string; value: string }>;
  linkedIssueDraft: LinkedIssueDraft;
  minutesText: (value?: number) => string;
  severityOptions: Array<{ label: string; value: string }>;
  submitting: boolean;
  uploadHeaders: Record<string, string>;
  userOptions: Array<{ label: string; value: string }>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  openClose: [];
  openInspectionRecord: [record: InspectionRequest];
  submitClose: [];
  submitDispatch: [];
  updateCloseForm: [value: CloseForm];
  updateCloseOpen: [value: boolean];
  updateCloseQrOpen: [value: boolean];
  updateDispatchDetailOpen: [value: boolean];
  updateDispatchForm: [value: DispatchForm];
  updateDispatchOpen: [value: boolean];
  updateInspectorStatusOpen: [value: boolean];
  updateLinkedIssueDraft: [value: LinkedIssueDraft];
}>();
</script>

<template>
  <DispatchTaskModal
    :open="props.dispatchOpen"
    :submitting="props.submitting"
    :user-options="props.userOptions"
    :form="props.dispatchForm"
    @update:open="(value) => emit('updateDispatchOpen', value)"
    @update:form="(value) => emit('updateDispatchForm', value)"
    @submit="emit('submitDispatch')"
  />

  <DispatchDetailDrawer
    v-bind="props.detailDrawerProps"
    :open="props.dispatchDetailOpen"
    @update:open="(value) => emit('updateDispatchDetailOpen', value)"
    @open-close="emit('openClose')"
    @open-inspection-record="(record) => emit('openInspectionRecord', record)"
  />

  <CloseQrModal
    :open="props.closeQrOpen"
    :qr-code="props.closeQr"
    :request="props.currentRequest"
    @update:open="(value) => emit('updateCloseQrOpen', value)"
  />

  <InspectorStatusDrawer
    :open="props.inspectorStatusOpen"
    :items="props.inspectorStatusItems"
    :minutes-text="props.minutesText"
    @update:open="(value) => emit('updateInspectorStatusOpen', value)"
  />

  <CloseInspectionModal
    :open="props.closeOpen"
    :submitting="props.submitting"
    :close-form="props.closeForm"
    :linked-issue-draft="props.linkedIssueDraft"
    :close-attachment-file-list="props.closeAttachmentFileList"
    :upload-headers="props.uploadHeaders"
    :current-request="props.currentRequest"
    :dept-tree-data="props.deptTreeData"
    :display-close-readonly-value="props.displayCloseReadonlyValue"
    :handle-close-attachment-upload-change="
      props.handleCloseAttachmentUploadChange
    "
    @update:open="(value) => emit('updateCloseOpen', value)"
    @update:close-form="(value) => emit('updateCloseForm', value)"
    @update:linked-issue-draft="
      (value) => emit('updateLinkedIssueDraft', value)
    "
    @submit="emit('submitClose')"
  />
</template>
