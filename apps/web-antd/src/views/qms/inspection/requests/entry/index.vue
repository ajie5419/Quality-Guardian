<script lang="ts" setup>
import type {
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
} from '@qgs/shared';
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Form, message } from 'ant-design-vue';

import { QMS_UPLOAD_ACTIONS } from '#/api/qms/constants';
import {
  createPublicInspectionRequest,
  getPublicInspectionRequestBomParts,
  getPublicInspectionRequestProcesses,
  getPublicInspectionRequestWorkOrders,
} from '#/api/qms/inspection-request';
import { useImageCompress } from '#/composables/useImageCompress';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import InspectionRequestEntryFormFields from './components/InspectionRequestEntryFormFields.vue';
import InspectionRequestEntryShell from './components/InspectionRequestEntryShell.vue';
import InspectionRequestEntrySubmitBar from './components/InspectionRequestEntrySubmitBar.vue';
import {
  buildIncomingInspectionRequestInfo,
  buildInspectionRequestEntryProcessOptions,
  buildInspectionRequestEntryRequiredMessage,
  buildInspectionRequestPostSubmitQuery,
  getInspectionRequestEntryCopy,
  INCOMING_INSPECTION_PROCESS_NAME,
  inspectionRequestEntryCheckResultOptions,
  isIncomingInspectionEntryPath,
  mapInspectionRequestEntryBomPartOptions,
  mapInspectionRequestEntryWorkOrderOptions,
} from './entry-mode';
import { useInspectionRequestIdentityOptions } from './useInspectionRequestIdentityOptions';
import { useInspectionRequestStationSelection } from './useInspectionRequestStationSelection';

import './index.css';

defineOptions({ name: 'PublicInspectionRequestEntry' });

const route = useRoute();
const router = useRouter();
const submitting = ref(false);
const attachmentFileList = ref<UploadFile[]>([]);
const bomPartsLoading = ref(false);
const bomPartOptions = ref<
  Array<{ label: string; partName: string; value: string }>
>([]);
const workOrderLoading = ref(false);
const workOrderOptions = ref<
  Array<{
    division?: null | string;
    label: string;
    multiStationEnabled?: boolean;
    quantity?: number;
    value: string;
  }>
>([]);
const workOrderProcessesLoading = ref(false);
const { compressImage } = useImageCompress();
const { handleApiError } = useErrorHandler();
const workOrderProcesses = ref<
  Array<{
    category: 'INCOMING' | 'PROCESS';
    processId: string;
    processName: string;
  }>
>([]);

const requestForm = reactive({
  attachments: [] as InspectionRequestAttachment[],
  componentName: '',
  incomingType: '',
  mutualCheckResult: 'PASS' as InspectionRequestCheckResult,
  partId: '',
  partName: '',
  processId: '',
  processName: '',
  quantity: 1,
  reporter: '',
  requestInfo: '',
  selfCheckResult: 'PASS' as InspectionRequestCheckResult,
  stationSelection: null as null | {
    indexes: number[];
    mode: 'ALL' | 'PARTIAL';
  },
  supplierId: '',
  team: '',
  teamId: '',
  workOrderNumber: '',
  workOrderNumbers: [] as string[],
});

const isIncomingEntry = computed(() =>
  isIncomingInspectionEntryPath(String(route.path || '')),
);

const {
  clearResponsibleUnitIdentity,
  loadResponsibleUnitOptions,
  teamLoading,
  teamOptions,
} = useInspectionRequestIdentityOptions({ isIncomingEntry, requestForm });

const processOptions = computed(() =>
  buildInspectionRequestEntryProcessOptions(
    workOrderProcesses.value,
    isIncomingEntry.value ? 'INCOMING' : 'PROCESS',
  ),
);

const isAssemblyProcess = computed(() =>
  String(requestForm.processName || '').includes('组装'),
);

const requiresComponentName = computed(
  () => !isIncomingEntry.value && !isAssemblyProcess.value,
);

const entryCopy = computed(() =>
  getInspectionRequestEntryCopy(isIncomingEntry.value),
);

const { requiresStationSelection, stationQuantity } =
  useInspectionRequestStationSelection({ requestForm, workOrderOptions });

function applyRoutePrefill() {
  const workOrderNumber = String(route.query.workOrderNumber || '');
  requestForm.workOrderNumber = workOrderNumber;
  requestForm.workOrderNumbers = workOrderNumber ? [workOrderNumber] : [];
  requestForm.partId = String(route.query.partId || '');
  requestForm.partName = String(route.query.partName || '');
  requestForm.processId = String(route.query.processId || '');
  requestForm.componentName = String(route.query.componentName || '');
  requestForm.processName = isIncomingEntry.value
    ? INCOMING_INSPECTION_PROCESS_NAME
    : String(route.query.processName || '');
  requestForm.reporter = String(route.query.reporter || '');
  requestForm.team = String(route.query.team || '');
  clearResponsibleUnitIdentity();
}

function resetRequestForm() {
  attachmentFileList.value = [];
  requestForm.attachments = [];
  requestForm.componentName = '';
  requestForm.incomingType = '';
  requestForm.partId = '';
  requestForm.partName = '';
  requestForm.processId = '';
  requestForm.processName = isIncomingEntry.value
    ? INCOMING_INSPECTION_PROCESS_NAME
    : '';
  requestForm.quantity = 1;
  requestForm.reporter = '';
  requestForm.requestInfo = '';
  requestForm.selfCheckResult = 'PASS';
  requestForm.mutualCheckResult = 'PASS';
  requestForm.stationSelection = null;
  clearResponsibleUnitIdentity(true);
  requestForm.workOrderNumber = '';
  requestForm.workOrderNumbers = [];
}

async function loadWorkOrderOptions(keyword = '') {
  workOrderLoading.value = true;
  try {
    const res = await getPublicInspectionRequestWorkOrders({
      keyword: keyword.trim() || undefined,
      page: 1,
      pageSize: 30,
    });
    workOrderOptions.value = mapInspectionRequestEntryWorkOrderOptions(
      res.items || [],
    );
  } catch {
    workOrderOptions.value = [];
  } finally {
    workOrderLoading.value = false;
  }
}

function syncAttachmentsFromFiles(files: UploadFile[]) {
  requestForm.attachments =
    normalizeUploadFileList<InspectionRequestAttachment>(
      files,
      entryCopy.value.attachmentUploadName,
    );
}

function hasBlockingAttachmentState() {
  return attachmentFileList.value.some((file) =>
    ['error', 'uploading'].includes(String(file.status || '')),
  );
}

function handleAttachmentUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    if (applyUploadResponse(info.file)) {
      message.success(`${info.file.name} 上传成功`);
    } else {
      message.warning('自检记录上传完成，但未返回有效地址');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} 上传失败`);
  }

  attachmentFileList.value = [...info.fileList];
  syncAttachmentsFromFiles(attachmentFileList.value);
}

async function handleBeforeUpload(file: File) {
  return compressImage(file);
}

async function loadBomPartOptions(workOrderNumber: string) {
  const normalized = (workOrderNumber || '').trim();
  if (!normalized) {
    bomPartOptions.value = [];
    requestForm.partId = '';
    requestForm.partName = '';
    return;
  }

  bomPartsLoading.value = true;
  try {
    const list = await getPublicInspectionRequestBomParts({
      workOrderNumber: normalized,
    });
    if (requestForm.workOrderNumber.trim() !== normalized) return;

    bomPartOptions.value = mapInspectionRequestEntryBomPartOptions(list || []);

    if (
      requestForm.partId &&
      !bomPartOptions.value.some((item) => item.value === requestForm.partId)
    ) {
      requestForm.partId = '';
      requestForm.partName = '';
    }
  } catch {
    bomPartOptions.value = [];
  } finally {
    if (requestForm.workOrderNumber.trim() === normalized) {
      bomPartsLoading.value = false;
    }
  }
}

async function loadWorkOrderProcessOptions(workOrderNumber: string) {
  const normalized = workOrderNumber.trim();
  if (!normalized) {
    workOrderProcesses.value = [];
    requestForm.processId = '';
    requestForm.processName = isIncomingEntry.value
      ? INCOMING_INSPECTION_PROCESS_NAME
      : '';
    return;
  }

  workOrderProcessesLoading.value = true;
  try {
    const list = await getPublicInspectionRequestProcesses({
      workOrderNumber: normalized,
    });
    if (requestForm.workOrderNumber.trim() !== normalized) return;

    workOrderProcesses.value = list || [];
    const selected = isIncomingEntry.value
      ? workOrderProcesses.value.find((item) => item.category === 'INCOMING')
      : workOrderProcesses.value.find(
          (item) => item.processId === requestForm.processId,
        );
    if (selected) {
      requestForm.processId = selected.processId;
      requestForm.processName = selected.processName;
    } else {
      requestForm.processId = '';
      requestForm.processName = isIncomingEntry.value
        ? INCOMING_INSPECTION_PROCESS_NAME
        : '';
    }
  } catch (error: unknown) {
    if (requestForm.workOrderNumber.trim() !== normalized) return;

    handleApiError(error, 'Load Inspection Request Processes');
    workOrderProcesses.value = [];
    requestForm.processId = '';
    requestForm.processName = isIncomingEntry.value
      ? INCOMING_INSPECTION_PROCESS_NAME
      : '';
    message.error('工序加载失败，请稍后重试');
  } finally {
    if (requestForm.workOrderNumber.trim() === normalized) {
      workOrderProcessesLoading.value = false;
    }
  }
}

async function submitRequest() {
  if (submitting.value) return;

  if (
    !requestForm.workOrderNumber ||
    requestForm.workOrderNumbers.length === 0 ||
    (isIncomingEntry.value && !requestForm.incomingType) ||
    !requestForm.partId ||
    !requestForm.partName ||
    !requestForm.processId ||
    !requestForm.processName ||
    (requiresComponentName.value && !requestForm.componentName) ||
    !requestForm.quantity ||
    (requiresStationSelection.value && !requestForm.stationSelection) ||
    !requestForm.team ||
    (isIncomingEntry.value ? !requestForm.supplierId : !requestForm.teamId) ||
    !requestForm.reporter ||
    requestForm.attachments.length === 0
  ) {
    message.warning(
      buildInspectionRequestEntryRequiredMessage(
        entryCopy.value,
        requiresComponentName.value,
        isIncomingEntry.value,
        requiresStationSelection.value,
      ),
    );
    return;
  }

  if (hasBlockingAttachmentState()) {
    message.warning('自检记录仍在上传或上传失败，请处理后再提交');
    return;
  }

  submitting.value = true;
  try {
    const created = await createPublicInspectionRequest({
      attachments: requestForm.attachments,
      category: isIncomingEntry.value ? 'INCOMING' : 'PROCESS',
      componentName: requiresComponentName.value
        ? requestForm.componentName
        : '',
      mutualCheckResult: requestForm.mutualCheckResult,
      partId: requestForm.partId,
      processId: requestForm.processId,
      quantity: requestForm.quantity,
      reporter: requestForm.reporter,
      requestInfo: isIncomingEntry.value
        ? buildIncomingInspectionRequestInfo({
            incomingType: requestForm.incomingType,
            notes: requestForm.requestInfo,
          })
        : requestForm.requestInfo,
      selfCheckResult: requestForm.selfCheckResult,
      stationSelection: requestForm.stationSelection || undefined,
      supplierId: requestForm.supplierId || undefined,
      team: requestForm.team,
      teamId: requestForm.teamId || undefined,
      workOrderNumber: requestForm.workOrderNumber,
      workOrderNumbers: isIncomingEntry.value
        ? requestForm.workOrderNumbers
        : [requestForm.workOrderNumber],
    });
    message.success(
      `${entryCopy.value.submitSuccessPrefix}：${created.requestNo}`,
    );
    resetRequestForm();
    const nextQuery = buildInspectionRequestPostSubmitQuery(route.query);
    void router.replace({ path: route.path, query: nextQuery });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  applyRoutePrefill();
  void loadWorkOrderOptions(requestForm.workOrderNumber);
  void loadResponsibleUnitOptions(requestForm.team);
});

watch(
  () => route.query,
  () => {
    applyRoutePrefill();
  },
);

watch(
  () => requestForm.workOrderNumber,
  (workOrderNumber) => {
    void Promise.all([
      loadBomPartOptions(workOrderNumber),
      loadWorkOrderProcessOptions(workOrderNumber),
    ]);
  },
  { immediate: true },
);

watch(
  () => requestForm.processName,
  () => {
    if (isAssemblyProcess.value) {
      requestForm.componentName = '';
    }
  },
);
</script>
<template>
  <InspectionRequestEntryShell :title="entryCopy.shellTitle">
    <Form class="inspection-entry-form" layout="vertical">
      <InspectionRequestEntryFormFields
        v-model:form="requestForm"
        v-model:attachment-file-list="attachmentFileList"
        :upload-action="QMS_UPLOAD_ACTIONS.PUBLIC_UPLOAD"
        :before-upload="handleBeforeUpload"
        :bom-part-options="bomPartOptions"
        :bom-parts-loading="bomPartsLoading"
        :check-result-options="inspectionRequestEntryCheckResultOptions"
        :entry-copy="entryCopy"
        :is-incoming-entry="isIncomingEntry"
        :process-options="processOptions"
        :requires-component-name="requiresComponentName"
        :requires-station-selection="requiresStationSelection"
        :station-quantity="stationQuantity"
        :submitting="submitting"
        :team-loading="teamLoading"
        :team-options="teamOptions"
        :work-order-loading="workOrderLoading"
        :work-order-options="workOrderOptions"
        :work-order-processes-loading="workOrderProcessesLoading"
        @attachment-change="handleAttachmentUploadChange"
        @responsible-unit-search="loadResponsibleUnitOptions"
        @work-order-search="loadWorkOrderOptions"
      />
      <InspectionRequestEntrySubmitBar
        :submitting="submitting"
        @submit="submitRequest"
      />
    </Form>
  </InspectionRequestEntryShell>
</template>
