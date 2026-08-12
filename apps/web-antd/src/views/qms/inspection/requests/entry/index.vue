<script lang="ts" setup>
import type {
  InspectionIssueResponsibilityType,
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
} from '@qgs/shared';
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';
import { Form, message } from 'ant-design-vue';

import { QMS_UPLOAD_ACTIONS } from '#/api/qms/constants';
import {
  createPublicInspectionRequest,
  getPublicInspectionRequestProcesses,
  getPublicInspectionRequestWorkOrders,
} from '#/api/qms/inspection-request';
import { getPublicIncomingMaterialInputSettingApi } from '#/api/system/inspection-settings';
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
  buildInspectionRequestEntryResponsibilityPayload,
  buildInspectionRequestPostSubmitQuery,
  getInspectionRequestEntryCopy,
  INCOMING_INSPECTION_PROCESS_NAME,
  inspectionRequestEntryCheckResultOptions,
  inspectionRequestResponsibilityTypeOptions,
  isIncomingInspectionEntryPath,
  mapInspectionRequestEntryWorkOrderOptions,
} from './entry-mode';
import { useInspectionRequestEntryFormState } from './useInspectionRequestEntryFormState';
import { useInspectionRequestIdentityOptions } from './useInspectionRequestIdentityOptions';
import { useInspectionRequestPartOptions } from './useInspectionRequestPartOptions';
import { useInspectionRequestStationSelection } from './useInspectionRequestStationSelection';

import './index.css';

defineOptions({ name: 'PublicInspectionRequestEntry' });

const route = useRoute();
const router = useRouter();
const submitting = ref(false);
const attachmentFileList = ref<UploadFile[]>([]);
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
    supplierSource: null | string;
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
  responsibilityType:
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT as InspectionIssueResponsibilityType,
  responsibleDepartmentId: '',
  requestedPartName: '',
  requestNewPart: false,
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
const incomingMaterialFreeInputEnabled = ref(false);

const isIncomingEntry = computed(() =>
  isIncomingInspectionEntryPath(String(route.path || '')),
);

const {
  bomPartOptions,
  bomPartsLoading,
  loadBomPartOptions,
  partOptions,
  partSearchLoading,
  searchCanonicalPartOptions,
} = useInspectionRequestPartOptions({
  handleApiError,
  isIncomingEntry,
  requestForm,
  showError: message.error,
});

const processOptions = computed(() =>
  buildInspectionRequestEntryProcessOptions(
    workOrderProcesses.value,
    isIncomingEntry.value ? 'INCOMING' : 'PROCESS',
  ),
);

const {
  changeResponsibilityType,
  clearResponsibilityIdentity,
  internalTeamOptions,
  loadInternalTeamOptions,
  loadResponsibilityOptions,
  responsibilityDepartmentOptions,
  responsibilityLoading,
  supplierOptions,
} = useInspectionRequestIdentityOptions({ requestForm });

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

const { applyRoutePrefill, resetRequestForm } =
  useInspectionRequestEntryFormState({
    attachmentFileList,
    clearResponsibilityIdentity,
    incomingMaterialFreeInputEnabled,
    isIncomingEntry,
    requestForm,
    route,
  });

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
      ? (requestForm.incomingType
          ? workOrderProcesses.value.find(
              (item) =>
                item.category === 'INCOMING' &&
                item.processId === requestForm.incomingType,
            )
          : undefined) ||
        workOrderProcesses.value.find((item) => item.category === 'INCOMING')
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
    (isIncomingEntry.value
      ? !requestForm.partId && !requestForm.requestedPartName.trim()
      : !requestForm.partId || !requestForm.partName) ||
    !requestForm.processId ||
    !requestForm.processName ||
    (requiresComponentName.value && !requestForm.componentName) ||
    !requestForm.quantity ||
    (requiresStationSelection.value && !requestForm.stationSelection) ||
    !requestForm.responsibleDepartmentId ||
    (requestForm.responsibilityType !==
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT &&
      !requestForm.supplierId) ||
    !requestForm.reporter ||
    requestForm.attachments.length === 0
  ) {
    message.warning(
      buildInspectionRequestEntryRequiredMessage(
        entryCopy.value,
        requiresComponentName.value,
        isIncomingEntry.value,
        requiresStationSelection.value,
        requestForm.responsibilityType,
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
    const responsibilityPayload =
      buildInspectionRequestEntryResponsibilityPayload({
        ...requestForm,
        teamResponsibleDepartmentId: internalTeamOptions.value.find(
          (team) => team.value === requestForm.teamId,
        )?.responsibleDepartmentId,
      });
    if (!responsibilityPayload) {
      message.warning('请选择完整的责任归属信息');
      return;
    }
    const created = await createPublicInspectionRequest({
      attachments: requestForm.attachments,
      category: isIncomingEntry.value ? 'INCOMING' : 'PROCESS',
      componentName: requiresComponentName.value
        ? requestForm.componentName
        : '',
      mutualCheckResult: requestForm.mutualCheckResult,
      partId: requestForm.partId || undefined,
      processId: requestForm.processId,
      quantity: requestForm.quantity,
      reporter: requestForm.reporter,
      requestedPartName:
        isIncomingEntry.value && !requestForm.partId
          ? requestForm.requestedPartName.trim()
          : undefined,
      requestInfo: isIncomingEntry.value
        ? buildIncomingInspectionRequestInfo({
            incomingType: requestForm.processName,
            notes: requestForm.requestInfo,
          })
        : requestForm.requestInfo,
      selfCheckResult: requestForm.selfCheckResult,
      stationSelection: requestForm.stationSelection || undefined,
      ...responsibilityPayload,
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

async function loadIncomingMaterialInputSetting() {
  try {
    const setting = await getPublicIncomingMaterialInputSettingApi();
    incomingMaterialFreeInputEnabled.value =
      setting.incomingMaterialFreeInputEnabled;
    requestForm.requestNewPart = incomingMaterialFreeInputEnabled.value;
    if (requestForm.requestNewPart) {
      requestForm.partId = '';
      requestForm.partName = '';
    } else {
      requestForm.requestedPartName = '';
    }
  } catch {
    requestForm.requestNewPart = false;
  }
}

onMounted(() => {
  applyRoutePrefill();
  // Responsibility choices must not wait for the optional incoming-material
  // setting; otherwise a delayed settings request leaves the form unusable.
  void loadResponsibilityOptions();
  void loadWorkOrderOptions(requestForm.workOrderNumber);
  if (isIncomingEntry.value) {
    void loadIncomingMaterialInputSetting();
  }
});

watch(
  () => route.query,
  () => {
    applyRoutePrefill();
    void loadResponsibilityOptions();
  },
);

watch(
  () => isIncomingEntry.value,
  () => {
    requestForm.responsibilityType = isIncomingEntry.value
      ? INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
      : INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
    clearResponsibilityIdentity();
    void loadResponsibilityOptions();
  },
);

watch(
  () => requestForm.workOrderNumbers.join('\0'),
  () => {
    void loadBomPartOptions(requestForm.workOrderNumbers);
  },
  { immediate: true },
);

watch(
  () => requestForm.workOrderNumber,
  (workOrderNumber) => {
    void loadWorkOrderProcessOptions(workOrderNumber);
  },
  { immediate: true },
);

watch(
  () => requestForm.incomingType,
  (incomingType) => {
    if (!isIncomingEntry.value || !incomingType) return;
    const matched = workOrderProcesses.value.find(
      (item) => item.category === 'INCOMING' && item.processId === incomingType,
    );
    if (matched) {
      requestForm.processId = matched.processId;
      requestForm.processName = matched.processName;
    }
  },
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
        :bom-part-options="isIncomingEntry ? partOptions : bomPartOptions"
        :bom-parts-loading="bomPartsLoading"
        :check-result-options="inspectionRequestEntryCheckResultOptions"
        :entry-copy="entryCopy"
        :is-incoming-entry="isIncomingEntry"
        :internal-team-options="internalTeamOptions"
        :part-search-loading="partSearchLoading"
        :process-options="processOptions"
        :requires-component-name="requiresComponentName"
        :requires-station-selection="requiresStationSelection"
        :station-quantity="stationQuantity"
        :submitting="submitting"
        :responsibility-department-options="responsibilityDepartmentOptions"
        :responsibility-loading="responsibilityLoading"
        :responsibility-type-options="
          inspectionRequestResponsibilityTypeOptions
        "
        :supplier-options="supplierOptions"
        :work-order-loading="workOrderLoading"
        :work-order-options="workOrderOptions"
        :work-order-processes-loading="workOrderProcessesLoading"
        @attachment-change="handleAttachmentUploadChange"
        @internal-team-search="loadInternalTeamOptions"
        @part-search="searchCanonicalPartOptions"
        @responsibility-type-change="changeResponsibilityType"
        @responsibility-options-search="loadResponsibilityOptions"
        @work-order-search="loadWorkOrderOptions"
      />
      <InspectionRequestEntrySubmitBar
        :submitting="submitting"
        @submit="submitRequest"
      />
    </Form>
  </InspectionRequestEntryShell>
</template>
