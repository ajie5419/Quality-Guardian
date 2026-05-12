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
import type { BomItem } from '#/api/qms/planning';
import type { WorkOrderItem } from '#/api/qms/work-order';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';

import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Select,
  Upload,
} from 'ant-design-vue';

import {
  createPublicInspectionRequest,
  getPublicInspectionRequestProcesses,
  getPublicInspectionRequestTeams,
  getPublicInspectionRequestWorkOrders,
} from '#/api/qms/inspection-request';
import { getBomList } from '#/api/qms/planning';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import { getProcessOptions } from '../../records/config';

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
const workOrderProcessOptions = ref<Array<{ label: string; value: string }>>(
  [],
);

const requestForm = reactive({
  attachments: [] as InspectionRequestAttachment[],
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

const checkResultOptions = [
  { label: '合格', value: 'PASS' },
  { label: '不合格', value: 'FAIL' },
  { label: '不适用', value: 'NA' },
];

const processOptions = computed(() => {
  const map = new Map<string, { label: string; value: string }>();
  for (const option of workOrderProcessOptions.value) {
    map.set(option.value, option);
  }
  for (const option of getProcessOptions($t)) {
    map.set(option.value, option);
  }
  return [...map.values()];
});

function applyRoutePrefill() {
  requestForm.workOrderNumber = String(route.query.workOrderNumber || '');
  requestForm.partName = String(route.query.partName || '');
  requestForm.processName = String(route.query.processName || '');
  requestForm.reporter = String(route.query.reporter || '');
  requestForm.team = String(route.query.team || '');
}

function resetRequestForm() {
  attachmentFileList.value = [];
  requestForm.attachments = [];
  requestForm.partName = '';
  requestForm.processName = '';
  requestForm.quantity = 1;
  requestForm.reporter = '';
  requestForm.requestInfo = '';
  requestForm.selfCheckResult = 'PASS';
  requestForm.mutualCheckResult = 'PASS';
  requestForm.team = '';
}

function mapWorkOrderOptions(items: WorkOrderItem[]) {
  return items.map((item) => ({
    label: item.projectName
      ? `${item.workOrderNumber} - ${item.projectName}`
      : item.workOrderNumber,
    value: item.workOrderNumber,
  }));
}

async function loadWorkOrderOptions(keyword = '') {
  workOrderLoading.value = true;
  try {
    const res = await getPublicInspectionRequestWorkOrders({
      keyword: keyword.trim() || undefined,
      page: 1,
      pageSize: 30,
    });
    workOrderOptions.value = mapWorkOrderOptions(res.items || []);
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
    const internalOptions = list
      .filter((item) => item.group === 'internal')
      .map((item) => ({ label: item.label, value: item.value }));
    const externalOptions = list
      .filter((item) => item.group === 'external')
      .map((item) => ({ label: item.label, value: item.value }));
    teamOptions.value = [
      { label: '内部生产车间', options: internalOptions },
      { label: '外协加工单位', options: externalOptions },
    ].filter((group) => group.options.length > 0);
  } catch {
    teamOptions.value = [];
  } finally {
    teamLoading.value = false;
  }
}

function syncAttachmentsFromFiles(files: UploadFile[]) {
  requestForm.attachments =
    normalizeUploadFileList<InspectionRequestAttachment>(files, '报检单');
}

function handleAttachmentUploadChange(info: UploadChangeParam<UploadFile>) {
  if (info.file.status === 'done') {
    if (applyUploadResponse(info.file)) {
      message.success(`${info.file.name} 上传成功`);
    } else {
      message.warning('报检单上传完成，但未返回有效地址');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} 上传失败`);
  }

  attachmentFileList.value = [...info.fileList];
  syncAttachmentsFromFiles(attachmentFileList.value);
}

async function loadBomPartOptions(workOrderNumber: string) {
  const normalized = workOrderNumber.trim();
  if (!normalized) {
    bomPartOptions.value = [];
    requestForm.partName = '';
    return;
  }

  bomPartsLoading.value = true;
  try {
    const list = await getBomList({ projectId: normalized });
    if (requestForm.workOrderNumber.trim() !== normalized) return;

    const parts = new Map<string, BomItem>();
    for (const item of list || []) {
      const partName = String(item.partName || '').trim();
      if (partName) parts.set(partName, item);
    }
    bomPartOptions.value = [...parts.values()].map((item) => ({
      label: item.partNumber
        ? `${item.partName} (${item.partNumber})`
        : item.partName,
      value: item.partName,
    }));

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

async function submitRequest() {
  if (
    !requestForm.workOrderNumber ||
    !requestForm.partName ||
    !requestForm.processName ||
    !requestForm.quantity ||
    !requestForm.team ||
    !requestForm.reporter ||
    requestForm.attachments.length === 0
  ) {
    message.warning(
      '工单号、部件名称、工序、数量、班组、报检人、报检单不能为空',
    );
    return;
  }

  submitting.value = true;
  try {
    const created = await createPublicInspectionRequest({ ...requestForm });
    message.success(`报检任务已提交：${created.requestNo}`);
    resetRequestForm();
    const nextQuery = { ...route.query };
    delete nextQuery.partName;
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
</script>

<template>
  <div
    class="inspection-entry-page min-h-[100dvh] overflow-x-hidden bg-gray-100 px-2 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-3 sm:px-6 sm:py-8"
  >
    <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 sm:gap-4">
      <header
        class="rounded-lg bg-white px-4 py-3 shadow-sm sm:rounded-xl sm:px-6 sm:py-4"
      >
        <h1 class="text-lg font-semibold text-gray-900 sm:text-xl">扫码报检</h1>
        <p class="mt-1 text-sm text-gray-500">
          填写车间报检信息后，调度可在报检任务中派单。
        </p>
      </header>

      <main
        class="min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:rounded-xl sm:p-6"
      >
        <Alert
          class="mb-4"
          message="该入口无需登录账号，适合车间扫码填报。"
          type="info"
          show-icon
        />

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
          <Form.Item label="部件名称" required>
            <Select
              v-model:value="requestForm.partName"
              :options="bomPartOptions"
              :loading="bomPartsLoading"
              :disabled="!requestForm.workOrderNumber"
              class="w-full"
              placeholder="请选择BOM部件"
              show-search
              allow-clear
            />
          </Form.Item>
          <Form.Item label="工序" required>
            <Select
              v-model:value="requestForm.processName"
              :options="processOptions"
              :loading="workOrderProcessesLoading"
              class="w-full"
              placeholder="请选择工序"
              show-search
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
            <Form.Item label="班组" required>
              <Select
                v-model:value="requestForm.team"
                :filter-option="false"
                :loading="teamLoading"
                :options="teamOptions"
                class="w-full"
                placeholder="请选择或搜索班组/外协单位"
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
                :options="checkResultOptions"
                class="w-full"
              />
            </Form.Item>
            <Form.Item label="互检结果">
              <Select
                v-model:value="requestForm.mutualCheckResult"
                :options="checkResultOptions"
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
          <Form.Item label="报检单" required>
            <Upload
              v-model:file-list="attachmentFileList"
              action="/api/upload"
              multiple
              @change="handleAttachmentUploadChange"
            >
              <Button class="w-full sm:w-auto">
                <template #icon>
                  <IconifyIcon icon="lucide:upload" />
                </template>
                上传报检单
              </Button>
            </Upload>
          </Form.Item>
          <div
            class="inspection-entry-submit fixed inset-x-0 bottom-0 z-20 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:inset-auto sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none"
          >
            <Button
              type="primary"
              block
              size="large"
              :loading="submitting"
              @click="submitRequest"
            >
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              提交报检
            </Button>
          </div>
        </Form>
      </main>
    </div>
  </div>
</template>

<style scoped>
.inspection-entry-page {
  text-size-adjust: 100%;
}

.inspection-entry-form :deep(.ant-form-item) {
  margin-bottom: 14px;
}

.inspection-entry-form :deep(.ant-form-item-label > label) {
  font-size: 13px;
  font-weight: 600;
}

.inspection-entry-form :deep(.ant-input),
.inspection-entry-form :deep(.ant-input-number),
.inspection-entry-form :deep(.ant-select-selector) {
  min-height: 42px;
}

.inspection-entry-form :deep(.ant-input-number-input) {
  height: 40px;
}

.inspection-entry-form :deep(.ant-select-selection-item),
.inspection-entry-form :deep(.ant-select-selection-placeholder) {
  line-height: 40px;
  white-space: normal;
}

.inspection-entry-form :deep(.ant-upload) {
  width: 100%;
}

.inspection-entry-form :deep(.ant-upload-list-item-name) {
  word-break: break-all;
  white-space: normal;
}

@media (min-width: 640px) {
  .inspection-entry-form :deep(.ant-upload) {
    width: auto;
  }

  .inspection-entry-form :deep(.ant-form-item) {
    margin-bottom: 16px;
  }
}
</style>
