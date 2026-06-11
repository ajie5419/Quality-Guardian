<script lang="ts" setup>
import type {
  SelectProps,
  UploadChangeParam,
  UploadFile,
} from 'ant-design-vue';

import type {
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
} from '#/api/qms/inspection-request';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { SUPPLIER_CATEGORY } from '@qgs/shared';
import { Form, message } from 'ant-design-vue';

import { QMS_UPLOAD_ACTIONS } from '#/api/qms/constants';
import {
  createPublicInspectionRequest,
  getPublicInspectionRequestBomParts,
  getPublicInspectionRequestProcessDictionaryOptions,
  getPublicInspectionRequestProcesses,
  getPublicInspectionRequestSuppliers,
  getPublicInspectionRequestTeams,
  getPublicInspectionRequestWorkOrders,
} from '#/api/qms/inspection-request';
import { useImageCompress } from '#/composables/useImageCompress';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import { mapDictionaryOptionsToInspectionProcess } from '../../records/config';
import InspectionRequestEntryFormFields from './components/InspectionRequestEntryFormFields.vue';
import InspectionRequestEntryShell from './components/InspectionRequestEntryShell.vue';
import InspectionRequestEntrySubmitBar from './components/InspectionRequestEntrySubmitBar.vue';
import {
  buildIncomingInspectionRequestInfo,
  buildInspectionRequestEntryProcessOptions,
  buildInspectionRequestEntryRequiredMessage,
  getInspectionRequestEntryCopy,
  INCOMING_INSPECTION_PROCESS_NAME,
  inspectionRequestEntryCheckResultOptions,
  isIncomingInspectionEntryPath,
  MACHINED_INCOMING_INSPECTION_TYPE,
  mapInspectionRequestEntryBomPartOptions,
  mapInspectionRequestEntryTeamOptions,
  mapInspectionRequestEntryWorkOrderOptions,
} from './entry-mode';
import { useInspectionRequestStationSelection } from './useInspectionRequestStationSelection';

import './index.css';

defineOptions({ name: 'PublicInspectionRequestEntry' });

const route = useRoute();
const router = useRouter();
const submitting = ref(false);
const attachmentFileList = ref<UploadFile[]>([]);
const bomPartsLoading = ref(false);
const bomPartOptions = ref<Array<{ label: string; value: string }>>([]);
const teamLoading = ref(false);
const teamOptions = ref<SelectProps['options']>([]);
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
const workOrderProcessOptions = ref<Array<{ label: string; value: string }>>(
  [],
);
const dictionaryProcessOptions = ref<Array<{ label: string; value: string }>>(
  [],
);

const requestForm = reactive({
  attachments: [] as InspectionRequestAttachment[],
  componentName: '',
  incomingType: '',
  mutualCheckResult: 'PASS' as InspectionRequestCheckResult,
  partName: '',
  processName: '',
  quantity: 1,
  reporter: '',
  requestInfo: '',
  selfCheckResult: 'PASS' as InspectionRequestCheckResult,
  stationSelection: null as null | {
    indexes: number[];
    mode: 'ALL' | 'PARTIAL';
  },
  team: '',
  workOrderNumber: '',
  workOrderNumbers: [] as string[],
});

const isIncomingEntry = computed(() =>
  isIncomingInspectionEntryPath(String(route.path || '')),
);

const processOptions = computed(() =>
  buildInspectionRequestEntryProcessOptions(
    dictionaryProcessOptions.value,
    workOrderProcessOptions.value,
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
  requestForm.partName = String(route.query.partName || '');
  requestForm.componentName = String(route.query.componentName || '');
  requestForm.processName = isIncomingEntry.value
    ? INCOMING_INSPECTION_PROCESS_NAME
    : String(route.query.processName || '');
  requestForm.reporter = String(route.query.reporter || '');
  requestForm.team = String(route.query.team || '');
}

function resetRequestForm() {
  attachmentFileList.value = [];
  requestForm.attachments = [];
  requestForm.componentName = '';
  requestForm.incomingType = '';
  requestForm.partName = '';
  requestForm.processName = isIncomingEntry.value
    ? INCOMING_INSPECTION_PROCESS_NAME
    : '';
  requestForm.quantity = 1;
  requestForm.reporter = '';
  requestForm.requestInfo = '';
  requestForm.selfCheckResult = 'PASS';
  requestForm.mutualCheckResult = 'PASS';
  requestForm.stationSelection = null;
  requestForm.team = '';
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

async function loadTeamOptions(keyword = '') {
  teamLoading.value = true;
  try {
    const list = await getPublicInspectionRequestTeams({
      keyword: keyword.trim() || undefined,
    });
    teamOptions.value = mapInspectionRequestEntryTeamOptions(list);
  } catch {
    teamOptions.value = [];
  } finally {
    teamLoading.value = false;
  }
}

async function loadSupplierOptions(keyword = '') {
  teamLoading.value = true;
  try {
    teamOptions.value = await getPublicInspectionRequestSuppliers({
      category:
        requestForm.incomingType === MACHINED_INCOMING_INSPECTION_TYPE
          ? SUPPLIER_CATEGORY.OUTSOURCING
          : SUPPLIER_CATEGORY.SUPPLIER,
      keyword: keyword.trim() || undefined,
    });
  } catch {
    teamOptions.value = [];
  } finally {
    teamLoading.value = false;
  }
}

async function loadResponsibleUnitOptions(keyword = '') {
  if (isIncomingEntry.value) {
    await loadSupplierOptions(keyword);
    return;
  }
  await loadTeamOptions(keyword);
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
  if (isIncomingEntry.value) {
    bomPartOptions.value = [];
    bomPartsLoading.value = false;
    return;
  }

  const normalized = (workOrderNumber || '').trim();
  if (!normalized) {
    bomPartOptions.value = [];
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
      requestForm.partName &&
      !bomPartOptions.value.some((item) => item.value === requestForm.partName)
    ) {
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
  if (isIncomingEntry.value) {
    workOrderProcessOptions.value = [
      {
        label: INCOMING_INSPECTION_PROCESS_NAME,
        value: INCOMING_INSPECTION_PROCESS_NAME,
      },
    ];
    return;
  }

  const normalized = workOrderNumber.trim();
  if (!normalized) {
    workOrderProcessOptions.value = [];
    return;
  }

  workOrderProcessesLoading.value = true;
  try {
    const list = await getPublicInspectionRequestProcesses({
      workOrderNumber: normalized,
    });
    if (requestForm.workOrderNumber.trim() !== normalized) return;

    const processNames = new Set<string>();
    for (const item of list || []) {
      const processName = String(item.processName || '').trim();
      if (processName) processNames.add(processName);
    }
    workOrderProcessOptions.value = [...processNames].map((processName) => ({
      label: processName,
      value: processName,
    }));
  } catch {
    workOrderProcessOptions.value = [];
  } finally {
    if (requestForm.workOrderNumber.trim() === normalized) {
      workOrderProcessesLoading.value = false;
    }
  }
}

async function loadPublicInspectionProcessDictionaryOptions() {
  try {
    const options = await getPublicInspectionRequestProcessDictionaryOptions();
    dictionaryProcessOptions.value = mapDictionaryOptionsToInspectionProcess(
      options,
      [],
    );
  } catch {
    dictionaryProcessOptions.value = [];
  }
}

async function submitRequest() {
  if (submitting.value) return;

  if (
    !requestForm.workOrderNumber ||
    requestForm.workOrderNumbers.length === 0 ||
    (isIncomingEntry.value && !requestForm.incomingType) ||
    !requestForm.partName ||
    !requestForm.processName ||
    (requiresComponentName.value && !requestForm.componentName) ||
    !requestForm.quantity ||
    (requiresStationSelection.value && !requestForm.stationSelection) ||
    !requestForm.team ||
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
      ...requestForm,
      componentName: requiresComponentName.value
        ? requestForm.componentName
        : '',
      processName: isIncomingEntry.value
        ? INCOMING_INSPECTION_PROCESS_NAME
        : requestForm.processName,
      requestInfo: isIncomingEntry.value
        ? buildIncomingInspectionRequestInfo({
            incomingType: requestForm.incomingType,
            notes: requestForm.requestInfo,
          })
        : requestForm.requestInfo,
      stationSelection: requestForm.stationSelection || undefined,
      workOrderNumber: requestForm.workOrderNumber,
      workOrderNumbers: isIncomingEntry.value
        ? requestForm.workOrderNumbers
        : [requestForm.workOrderNumber],
    });
    message.success(
      `${entryCopy.value.submitSuccessPrefix}：${created.requestNo}`,
    );
    resetRequestForm();
    const nextQuery = { ...route.query };
    delete nextQuery.partName;
    delete nextQuery.componentName;
    delete nextQuery.processName;
    delete nextQuery.reporter;
    delete nextQuery.team;
    void router.replace({ path: route.path, query: nextQuery });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  applyRoutePrefill();
  void loadPublicInspectionProcessDictionaryOptions();
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
    if (isIncomingEntry.value) {
      void loadWorkOrderProcessOptions(workOrderNumber);
      return;
    }
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

watch(
  () => requestForm.incomingType,
  (nextValue, previousValue) => {
    if (!isIncomingEntry.value) return;
    if (nextValue !== previousValue && previousValue !== undefined) {
      requestForm.team = '';
    }
    void loadSupplierOptions(requestForm.team);
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
