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

import { Form, Input, InputNumber, message, Select } from 'ant-design-vue';

import { QMS_UPLOAD_ACTIONS } from '#/api/qms/constants';
import {
  createPublicInspectionRequest,
  getPublicInspectionRequestBomParts,
  getPublicInspectionRequestProcessDictionaryOptions,
  getPublicInspectionRequestProcesses,
  getPublicInspectionRequestTeams,
  getPublicInspectionRequestWorkOrders,
} from '#/api/qms/inspection-request';
import { useImageCompress } from '#/composables/useImageCompress';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import { mapDictionaryOptionsToInspectionProcess } from '../../records/config';
import InspectionRequestEntryShell from './components/InspectionRequestEntryShell.vue';
import InspectionRequestEntrySubmitBar from './components/InspectionRequestEntrySubmitBar.vue';
import InspectionRequestEntryUploadActions from './components/InspectionRequestEntryUploadActions.vue';
import {
  buildInspectionRequestEntryProcessOptions,
  buildInspectionRequestEntryRequiredMessage,
  getInspectionRequestEntryCopy,
  INCOMING_INSPECTION_PROCESS_NAME,
  inspectionRequestEntryCheckResultOptions,
  isIncomingInspectionEntryPath,
  mapInspectionRequestEntryBomPartOptions,
  mapInspectionRequestEntryTeamOptions,
  mapInspectionRequestEntryWorkOrderOptions,
} from './entry-mode';

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
const workOrderOptions = ref<Array<{ label: string; value: string }>>([]);
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
  mutualCheckResult: 'PASS' as InspectionRequestCheckResult,
  partName: '',
  processName: '',
  quantity: 1,
  reporter: '',
  requestInfo: '',
  selfCheckResult: 'PASS' as InspectionRequestCheckResult,
  team: '',
  workOrderNumber: '',
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

function applyRoutePrefill() {
  requestForm.workOrderNumber = String(route.query.workOrderNumber || '');
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
  requestForm.partName = '';
  requestForm.processName = isIncomingEntry.value
    ? INCOMING_INSPECTION_PROCESS_NAME
    : '';
  requestForm.quantity = 1;
  requestForm.reporter = '';
  requestForm.requestInfo = '';
  requestForm.selfCheckResult = 'PASS';
  requestForm.mutualCheckResult = 'PASS';
  requestForm.team = '';
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
    !requestForm.partName ||
    !requestForm.processName ||
    (requiresComponentName.value && !requestForm.componentName) ||
    !requestForm.quantity ||
    !requestForm.team ||
    !requestForm.reporter ||
    requestForm.attachments.length === 0
  ) {
    message.warning(
      buildInspectionRequestEntryRequiredMessage(
        entryCopy.value,
        requiresComponentName.value,
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
  void loadTeamOptions(requestForm.team);
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
      <Form.Item label="工单号" required>
        <Select
          v-model:value="requestForm.workOrderNumber"
          :filter-option="false"
          :loading="workOrderLoading"
          :options="workOrderOptions"
          class="w-full"
          placeholder="请选择或搜索工单号"
          show-search
          allow-clear
          @search="loadWorkOrderOptions"
        />
      </Form.Item>
      <Form.Item :label="entryCopy.processLabel" required>
        <Select
          v-model:value="requestForm.processName"
          :options="processOptions"
          :loading="workOrderProcessesLoading"
          :disabled="isIncomingEntry"
          :allow-clear="!isIncomingEntry"
          class="w-full"
          :placeholder="isIncomingEntry ? '进货检验' : '请选择工序'"
          show-search
        />
      </Form.Item>
      <Form.Item :label="entryCopy.partLabel" required>
        <Select
          v-model:value="requestForm.partName"
          :options="bomPartOptions"
          :loading="bomPartsLoading"
          :disabled="!requestForm.workOrderNumber"
          class="w-full"
          :placeholder="entryCopy.partPlaceholder"
          show-search
          allow-clear
        />
      </Form.Item>
      <Form.Item
        v-if="requiresComponentName"
        :label="entryCopy.componentLabel"
        required
      >
        <Input
          v-model:value="requestForm.componentName"
          class="w-full"
          placeholder="请输入组件名称"
          allow-clear
        />
      </Form.Item>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Form.Item label="数量" required>
          <InputNumber
            v-model:value="requestForm.quantity"
            :min="1"
            :precision="0"
            class="w-full min-w-0"
          />
        </Form.Item>
        <Form.Item :label="entryCopy.teamLabel" required>
          <Select
            v-model:value="requestForm.team"
            :filter-option="false"
            :loading="teamLoading"
            :options="teamOptions"
            class="w-full"
            :placeholder="entryCopy.teamPlaceholder"
            show-search
            allow-clear
            @search="loadTeamOptions"
          />
        </Form.Item>
      </div>
      <Form.Item label="报检人" required>
        <Input
          v-model:value="requestForm.reporter"
          class="w-full"
          placeholder="请输入报检人"
          allow-clear
        />
      </Form.Item>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Form.Item label="自检结果">
          <Select
            v-model:value="requestForm.selfCheckResult"
            :options="inspectionRequestEntryCheckResultOptions"
            class="w-full"
          />
        </Form.Item>
        <Form.Item label="互检结果">
          <Select
            v-model:value="requestForm.mutualCheckResult"
            :options="inspectionRequestEntryCheckResultOptions"
            class="w-full"
          />
        </Form.Item>
      </div>
      <Form.Item label="报检信息">
        <Input.TextArea
          v-model:value="requestForm.requestInfo"
          :rows="4"
          class="w-full"
          placeholder="请输入补充说明"
        />
      </Form.Item>
      <Form.Item :label="entryCopy.attachmentLabel" required>
        <InspectionRequestEntryUploadActions
          v-model:file-list="attachmentFileList"
          :action="QMS_UPLOAD_ACTIONS.PUBLIC_UPLOAD"
          :before-upload="handleBeforeUpload"
          :disabled="submitting"
          @change="handleAttachmentUploadChange"
        />
      </Form.Item>
      <InspectionRequestEntrySubmitBar
        :submitting="submitting"
        @submit="submitRequest"
      />
    </Form>
  </InspectionRequestEntryShell>
</template>
