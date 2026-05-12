<script lang="ts" setup>
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { UploadFileWithResponse } from '../issues/types';

import type {
  InspectionRequest,
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
  InspectionRequestStatus,
} from '#/api/qms/inspection-request';
import type { BomItem } from '#/api/qms/planning';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { $t } from '@vben/locales';
import { useAccessStore } from '@vben/stores';

import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';
import dayjs from 'dayjs';
import QRCode from 'qrcode';

import {
  closeInspectionRequest,
  createInspectionRequest,
  deleteInspectionRequest,
  dispatchInspectionRequest,
  getInspectionRequests,
} from '#/api/qms/inspection-request';
import { getBomList } from '#/api/qms/planning';
import { getWorkOrderRequirements } from '#/api/qms/work-order';
import { getUserList } from '#/api/system/user';
import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import IssuePhotoUpload from '../issues/components/IssuePhotoUpload.vue';
import {
  DEFAULT_VALUES,
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
} from '../issues/constants';
import TeamSelect from '../records/components/form/TeamSelect.vue';
import { getProcessOptions } from '../records/config';

defineOptions({ name: 'QMSInspectionRequests' });

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const { hasAccessByCodes } = useAccess();
const loading = ref(false);
const submitting = ref(false);
const requests = ref<InspectionRequest[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const users = ref<SystemUserApi.User[]>([]);
const dispatchOpen = ref(false);
const closeOpen = ref(false);
const dispatchDetailOpen = ref(false);
const closeQrOpen = ref(false);
const currentRequest = ref<InspectionRequest>();
const requestEntryQr = ref('');
const closeQr = ref('');
const activeView = ref('all');
const attachmentFileList = ref<UploadFile[]>([]);
const closeAttachmentFileList = ref<UploadFile[]>([]);
const bomPartsLoading = ref(false);
const bomPartOptions = ref<Array<{ label: string; value: string }>>([]);
const workOrderRequirementsLoading = ref(false);
const requirementProcessOptions = ref<Array<{ label: string; value: string }>>(
  [],
);

const { defectOptions, defectSubtypes } = useDefectOptions();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();

const query = reactive({
  keyword: '',
  status: undefined as InspectionRequestStatus | undefined,
});

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

const dispatchForm = reactive({
  dispatchRemark: '',
  inspectorId: '',
  priority: 3,
});

const closeForm = reactive({
  attachments: [] as InspectionRequestAttachment[],
  closeRemark: '',
  inspectionId: '',
  inspector: '',
  quantity: 1,
  result: 'PASS' as 'FAIL' | 'PASS',
});

const linkedIssueDraft = ref({
  claim: DEFAULT_VALUES.DEFAULT_CLAIM as string,
  defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE as string,
  defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE as string,
  description: '',
  lossAmount: 0,
  partName: '',
  processName: '',
  qualifiedQuantity: 1,
  reportDate: dayjs().format('YYYY-MM-DD'),
  reportedBy: '',
  responsibleWelder: '',
  rootCause: '',
  solution: '',
  status: 'OPEN',
  supplierName: '',
  photos: [] as UploadFileWithResponse[],
  unqualifiedQuantity: 0,
  responsibleDepartment: '',
  severity: DEFAULT_VALUES.DEFAULT_SEVERITY as string,
});

const linkedDefectSubtypeOptions = computed(() => {
  const defectType = linkedIssueDraft.value.defectType;
  return defectSubtypes.value[defectType] || [];
});

const shouldCreateLinkedIssue = computed(() => closeForm.result === 'FAIL');

function normalizeCloseText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeCloseQuantity(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function syncLinkedIssueQuantities(unqualifiedValue?: unknown) {
  const totalQuantity = normalizeCloseQuantity(closeForm.quantity);
  const rawUnqualified =
    unqualifiedValue === undefined
      ? linkedIssueDraft.value.unqualifiedQuantity
      : unqualifiedValue;
  const unqualifiedQuantity = Math.max(
    0,
    Math.min(totalQuantity, Number(rawUnqualified) || 0),
  );

  linkedIssueDraft.value.unqualifiedQuantity = unqualifiedQuantity;
  linkedIssueDraft.value.qualifiedQuantity =
    totalQuantity - unqualifiedQuantity;
}

function hasBlockingCloseAttachmentState() {
  return closeAttachmentFileList.value.some((file) =>
    ['error', 'uploading'].includes(String(file.status || '')),
  );
}

function validateCloseForm() {
  if (!normalizeCloseText(closeForm.inspector)) {
    message.warning('检验员不能为空');
    return false;
  }

  if (closeForm.attachments.length === 0) {
    message.warning('检验记录不能为空');
    return false;
  }

  if (hasBlockingCloseAttachmentState()) {
    message.warning('检验记录仍在上传或上传失败，请处理后再完成检验');
    return false;
  }

  if (!shouldCreateLinkedIssue.value) return true;

  syncLinkedIssueQuantities();

  const requiredFields = [
    [linkedIssueDraft.value.partName, '部件名称'],
    [linkedIssueDraft.value.processName, '工序'],
    [linkedIssueDraft.value.responsibleDepartment, '责任部门'],
    [linkedIssueDraft.value.defectType, '缺陷分类'],
    [linkedIssueDraft.value.defectSubtype, '二级分类'],
    [linkedIssueDraft.value.severity, '严重程度'],
    [linkedIssueDraft.value.status, '状态'],
    [linkedIssueDraft.value.description, '不合格描述'],
    [linkedIssueDraft.value.rootCause, '原因分析'],
    [linkedIssueDraft.value.solution, '解决方案'],
  ] as const;
  const missingField = requiredFields.find(
    ([value]) => !normalizeCloseText(value),
  );
  if (missingField) {
    message.warning(`不合格项${missingField[1]}不能为空`);
    return false;
  }

  if (linkedIssueDraft.value.unqualifiedQuantity <= 0) {
    message.warning('不合格数量必须大于 0');
    return false;
  }

  return true;
}

const statusOptions = [
  { label: '已报检', value: 'SUBMITTED' },
  { label: '已派单', value: 'DISPATCHED' },
  { label: '检验中', value: 'INSPECTING' },
  { label: '检验完成', value: 'CLOSED' },
  { label: '已取消', value: 'CANCELLED' },
];

const viewOptions = [
  { label: '全部任务', value: 'all' },
  { label: '待派单', value: 'submitted' },
  { label: '已派单', value: 'dispatched' },
  { label: '我的检验', value: 'inspecting' },
  { label: '检验完成', value: 'closed' },
];

const checkResultOptions = [
  { label: '合格', value: 'PASS' },
  { label: '不合格', value: 'FAIL' },
  { label: '不适用', value: 'NA' },
];

const userOptions = computed(() =>
  users.value.map((user) => ({
    label: user.realName || user.username,
    value: user.id,
  })),
);

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));

const processOptions = computed(() => {
  const map = new Map<string, { label: string; value: string }>();
  for (const option of requirementProcessOptions.value) {
    map.set(option.value, option);
  }
  for (const option of getProcessOptions($t)) {
    map.set(option.value, option);
  }
  return [...map.values()];
});

const requestEntryUrl = computed(() =>
  buildRequestUrl({ entry: 'submit' }, '/qms/inspection/requests/entry'),
);
const pendingDispatchCount = computed(
  () => requests.value.filter((item) => item.status === 'SUBMITTED').length,
);
const pendingInspectionCount = computed(
  () => requests.value.filter((item) => item.status === 'DISPATCHED').length,
);
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Requests:Delete']),
);

function statusColor(status: InspectionRequestStatus) {
  if (status === 'CLOSED') return 'success';
  if (status === 'DISPATCHED' || status === 'INSPECTING') return 'processing';
  if (status === 'CANCELLED') return 'default';
  return 'warning';
}

function statusLabel(status: InspectionRequestStatus) {
  return statusOptions.find((item) => item.value === status)?.label || status;
}

function checkResultLabel(result: InspectionRequestCheckResult) {
  return (
    checkResultOptions.find((item) => item.value === result)?.label || result
  );
}

function formatDateTime(value?: null | string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  })
    .format(date)
    .replaceAll('/', '-');
}

function durationText(start?: null | string, end?: null | string) {
  if (!start) return '-';
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return '-';
  }

  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function waitDuration(record: InspectionRequest) {
  return durationText(
    record.submittedAt,
    record.dispatchedAt || record.closedAt,
  );
}

function executeDuration(record: InspectionRequest) {
  return durationText(record.dispatchedAt, record.closedAt);
}

function buildRequestUrl(
  params: Record<string, string>,
  path = '/qms/inspection/requests',
) {
  const origin =
    typeof window === 'undefined'
      ? 'http://localhost:5666'
      : window.location.origin;
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function makeQr(url: string) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 180,
  });
}

function applyViewStatus(value: string) {
  switch (value) {
    case 'closed': {
      query.status = 'CLOSED';

      break;
    }
    case 'dispatched':
    case 'inspecting': {
      query.status = 'DISPATCHED';

      break;
    }
    case 'submitted': {
      query.status = 'SUBMITTED';

      break;
    }
    default: {
      query.status = undefined;
    }
  }
}

function shouldUseMineFilter() {
  return activeView.value === 'inspecting';
}

async function handleViewChange(value: number | string) {
  activeView.value = String(value);
  applyViewStatus(activeView.value);
  page.value = 1;
  await loadRequests();
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

function syncAttachmentsFromFiles(files: UploadFile[]) {
  requestForm.attachments =
    normalizeUploadFileList<InspectionRequestAttachment>(files, '自检记录');
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

function handleCloseAttachmentUploadChange(
  info: UploadChangeParam<UploadFile>,
) {
  if (info.file.status === 'done') {
    if (applyUploadResponse(info.file)) {
      message.success(`${info.file.name} 上传成功`);
    } else {
      message.warning('检验记录上传完成，但未返回有效地址');
    }
  } else if (info.file.status === 'error') {
    message.error(`${info.file.name} 上传失败`);
  }

  closeAttachmentFileList.value = [...info.fileList];
  closeForm.attachments = normalizeUploadFileList<InspectionRequestAttachment>(
    closeAttachmentFileList.value,
    '检验记录',
  );
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
    if (requestForm.workOrderNumber !== normalized) return;

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
    if (requestForm.workOrderNumber === normalized) {
      bomPartsLoading.value = false;
    }
  }
}

async function loadWorkOrderRequirementOptions(workOrderNumber: string) {
  const normalized = workOrderNumber.trim();
  if (!normalized) {
    requirementProcessOptions.value = [];
    return;
  }

  workOrderRequirementsLoading.value = true;
  try {
    const list = await getWorkOrderRequirements({
      workOrderNumber: normalized,
    });
    if (requestForm.workOrderNumber !== normalized) return;

    const processNames = new Set<string>();
    for (const item of list || []) {
      const processName = String(item.processName || '').trim();
      if (processName) processNames.add(processName);
    }
    requirementProcessOptions.value = [...processNames].map((processName) => ({
      label: processName,
      value: processName,
    }));
  } catch {
    requirementProcessOptions.value = [];
  } finally {
    if (requestForm.workOrderNumber === normalized) {
      workOrderRequirementsLoading.value = false;
    }
  }
}

async function loadRequests() {
  loading.value = true;
  try {
    const res = await getInspectionRequests({
      keyword: query.keyword || undefined,
      mine: shouldUseMineFilter(),
      page: page.value,
      pageSize: pageSize.value,
      status: query.status,
    });
    requests.value = res.items || [];
    total.value = res.total || 0;
    openCloseFromRoute();
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  const res = await getUserList({ page: 1, pageSize: 200 });
  users.value = res.items || [];
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
      '工单号、部件名称、工序、数量、班组、报检人、自检记录不能为空',
    );
    return;
  }

  submitting.value = true;
  try {
    await createInspectionRequest({ ...requestForm });
    message.success('报检任务已报检');
    resetRequestForm();
    page.value = 1;
    await loadRequests();
  } finally {
    submitting.value = false;
  }
}

function openInspectionRecord(record: InspectionRequest) {
  if (!record.inspectionId) return;
  void router.push({
    path: '/qms/inspection/records',
    query: {
      sourceInspectionId: record.inspectionId,
      type: 'process',
    },
  });
}

function openDispatch(record: InspectionRequest) {
  currentRequest.value = record;
  dispatchForm.dispatchRemark = '';
  dispatchForm.inspectorId = record.inspectorId || '';
  dispatchForm.priority = record.priority || 3;
  dispatchOpen.value = true;
}

function openDispatchDetail(record: InspectionRequest) {
  currentRequest.value = record;
  dispatchDetailOpen.value = true;
}

async function submitDispatch() {
  if (!currentRequest.value || !dispatchForm.inspectorId) {
    message.warning('请选择检验员');
    return;
  }

  submitting.value = true;
  try {
    await dispatchInspectionRequest(currentRequest.value.id, {
      dispatchRemark: dispatchForm.dispatchRemark,
      inspectorId: dispatchForm.inspectorId,
      priority: dispatchForm.priority,
    });
    message.success('报检任务已派单');
    dispatchOpen.value = false;
    await loadRequests();
  } finally {
    submitting.value = false;
  }
}

function deleteDisabledReason(record: InspectionRequest) {
  if (!canDelete.value) return '无删除权限';
  if (record.status === 'CLOSED') return '检验完成的任务不能删除';
  return '';
}

function confirmDelete(record: InspectionRequest) {
  const disabledReason = deleteDisabledReason(record);
  if (disabledReason) {
    message.warning(disabledReason);
    return;
  }

  Modal.confirm({
    content: `删除后任务会从列表隐藏，关联派单任务会同步取消：${record.requestNo}`,
    okText: '删除',
    okType: 'danger',
    title: '删除报检任务',
    async onOk() {
      await deleteInspectionRequest(record.id);
      message.success('报检任务已删除');
      await loadRequests();
    },
  });
}

function openClose(record: InspectionRequest) {
  currentRequest.value = record;
  closeAttachmentFileList.value = [];
  closeForm.attachments = [];
  closeForm.closeRemark = '';
  closeForm.inspectionId = record.inspectionId || '';
  closeForm.inspector = record.inspectorName || record.reporter;
  closeForm.quantity = record.quantity || 1;
  closeForm.result = 'PASS';

  linkedIssueDraft.value = {
    claim: DEFAULT_VALUES.DEFAULT_CLAIM,
    defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
    defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
    description: '',
    lossAmount: 0,
    partName: record.partName || '',
    processName: record.processName || '',
    qualifiedQuantity: 0,
    reportDate: dayjs().format('YYYY-MM-DD'),
    reportedBy: record.inspectorName || record.reporter || '',
    responsibleWelder: '',
    rootCause: '',
    solution: '',
    status: 'OPEN',
    supplierName: '',
    photos: [] as UploadFileWithResponse[],
    unqualifiedQuantity: record.quantity || 1,
    responsibleDepartment: record.team || '',
    severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
  };

  closeOpen.value = true;
}

async function openCloseQr(record: InspectionRequest) {
  currentRequest.value = record;
  closeQr.value = await makeQr(buildRequestUrl({ closeRequestId: record.id }));
  closeQrOpen.value = true;
}

async function submitClose() {
  if (!currentRequest.value) return;
  if (!validateCloseForm()) return;

  submitting.value = true;
  try {
    syncLinkedIssueQuantities();
    const payloadLinkedIssue = shouldCreateLinkedIssue.value
      ? {
          ...linkedIssueDraft.value,
          photos: linkedIssueDraft.value.photos
            .map((p) => p.url)
            .filter(Boolean) as string[],
          quantity: linkedIssueDraft.value.unqualifiedQuantity,
        }
      : undefined;

    await closeInspectionRequest(currentRequest.value.id, {
      attachments: closeForm.attachments,
      closeRemark: closeForm.closeRemark,
      inspectionId: closeForm.inspectionId || undefined,
      inspector: closeForm.inspector,
      linkedIssue: payloadLinkedIssue,
      qualifiedQuantity: shouldCreateLinkedIssue.value
        ? linkedIssueDraft.value.qualifiedQuantity
        : closeForm.quantity,
      quantity: closeForm.quantity,
      result: closeForm.result,
      unqualifiedQuantity: shouldCreateLinkedIssue.value
        ? linkedIssueDraft.value.unqualifiedQuantity
        : 0,
    });
    message.success('报检任务检验完成');
    closeOpen.value = false;
    await loadRequests();
  } finally {
    submitting.value = false;
  }
}

function applyRoutePrefill() {
  requestForm.workOrderNumber = String(route.query.workOrderNumber || '');
  requestForm.partName = String(route.query.partName || '');
  requestForm.processName = String(route.query.processName || '');
  requestForm.reporter = String(route.query.reporter || '');
  requestForm.team = String(route.query.team || '');
  const closeRequestId = String(route.query.closeRequestId || '').trim();
  if (closeRequestId) {
    query.keyword = closeRequestId;
  }
}

function openCloseFromRoute() {
  const closeRequestId = String(route.query.closeRequestId || '').trim();
  if (!closeRequestId || closeOpen.value) return;
  const matched = requests.value.find((item) => item.id === closeRequestId);
  if (matched) {
    openClose(matched);
  }
}

onMounted(async () => {
  applyRoutePrefill();
  requestEntryQr.value = await makeQr(requestEntryUrl.value);
  await Promise.all([loadUsers(), loadRequests()]);
});

watch(
  () => route.query,
  async () => {
    applyRoutePrefill();
    await loadRequests();
  },
);

watch(
  () => closeForm.quantity,
  () => {
    if (shouldCreateLinkedIssue.value) {
      syncLinkedIssueQuantities();
    }
  },
);

watch(
  () => requestForm.workOrderNumber,
  (workOrderNumber) => {
    void Promise.all([
      loadBomPartOptions(workOrderNumber),
      loadWorkOrderRequirementOptions(workOrderNumber),
    ]);
  },
);
</script>

<template>
  <Page content-class="p-4">
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card title="扫码报检入口">
        <div
          class="mb-4 flex flex-col items-center rounded border bg-gray-50 p-3"
        >
          <img
            v-if="requestEntryQr"
            :src="requestEntryQr"
            alt="扫码报检二维码"
            class="size-[180px]"
          />
          <div class="mt-2 text-center text-xs text-gray-500">
            车间扫码进入报检填报
          </div>
        </div>
        <Form layout="vertical">
          <Form.Item label="工单号" required>
            <WorkOrderSelect v-model:value="requestForm.workOrderNumber" />
          </Form.Item>
          <Form.Item label="部件名称" required>
            <Select
              v-model:value="requestForm.partName"
              :options="bomPartOptions"
              :loading="bomPartsLoading"
              :disabled="!requestForm.workOrderNumber"
              placeholder="请选择BOM部件"
              show-search
              allow-clear
            />
          </Form.Item>
          <Form.Item label="工序" required>
            <Select
              v-model:value="requestForm.processName"
              :options="processOptions"
              :loading="workOrderRequirementsLoading"
              placeholder="请选择工序"
              show-search
              allow-clear
            />
          </Form.Item>
          <Form.Item label="数量" required>
            <InputNumber
              v-model:value="requestForm.quantity"
              :min="1"
              :precision="0"
              class="w-full"
            />
          </Form.Item>
          <Form.Item label="班组" required>
            <TeamSelect v-model:value="requestForm.team" />
          </Form.Item>
          <Form.Item label="报检人" required>
            <Input v-model:value="requestForm.reporter" />
          </Form.Item>
          <div class="grid grid-cols-2 gap-3">
            <Form.Item label="自检结果">
              <Select
                v-model:value="requestForm.selfCheckResult"
                :options="checkResultOptions"
              />
            </Form.Item>
            <Form.Item label="互检结果">
              <Select
                v-model:value="requestForm.mutualCheckResult"
                :options="checkResultOptions"
              />
            </Form.Item>
          </div>
          <Form.Item label="报检信息">
            <Input.TextArea v-model:value="requestForm.requestInfo" :rows="4" />
          </Form.Item>
          <Form.Item label="自检记录" required>
            <Upload
              v-model:file-list="attachmentFileList"
              action="/api/upload"
              :headers="uploadHeaders"
              multiple
              @change="handleAttachmentUploadChange"
            >
              <Button>
                <template #icon>
                  <IconifyIcon icon="lucide:upload" />
                </template>
                上传自检记录
              </Button>
            </Upload>
          </Form.Item>
          <Button
            type="primary"
            block
            :loading="submitting"
            @click="submitRequest"
          >
            <template #icon><IconifyIcon icon="lucide:plus" /></template>
            提交报检
          </Button>
        </Form>
      </Card>

      <Card>
        <div class="mb-4 space-y-4">
          <div
            class="grid grid-cols-1 gap-3 lg:grid-cols-[160px_180px_minmax(0,1fr)]"
          >
            <div class="rounded border border-amber-100 bg-amber-50 px-4 py-3">
              <div class="text-xs text-amber-700">调度待办</div>
              <div class="mt-1 text-2xl font-semibold text-amber-900">
                {{ pendingDispatchCount }}
              </div>
            </div>
            <div class="rounded border border-blue-100 bg-blue-50 px-4 py-3">
              <div class="text-xs text-blue-700">检验员待执行</div>
              <div class="mt-1 text-2xl font-semibold text-blue-900">
                {{ pendingInspectionCount }}
              </div>
            </div>
            <div
              class="flex min-w-0 items-center rounded border border-gray-100 bg-gray-50 px-4 py-3"
            >
              <div class="min-w-0">
                <div class="text-xs text-gray-600">通知方式</div>
                <div class="mt-1 truncate text-xs text-gray-700">
                  派单后进入检验员“我的检验”视图；也可扫码关闭处理
                </div>
              </div>
            </div>
          </div>

          <div
            class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
          >
            <div class="flex flex-wrap items-center gap-3">
              <span class="text-base font-semibold text-gray-900"
                >报检任务</span
              >
              <Segmented
                v-model:value="activeView"
                :options="viewOptions"
                @change="handleViewChange"
              />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Input
                v-model:value="query.keyword"
                allow-clear
                class="w-60"
                placeholder="搜索报检任务"
                @press-enter="loadRequests"
              />
              <Select
                v-model:value="query.status"
                allow-clear
                class="w-36"
                :options="statusOptions"
                placeholder="状态"
                @change="loadRequests"
              />
              <Button @click="loadRequests">
                <template #icon>
                  <IconifyIcon icon="lucide:refresh-cw" />
                </template>
                刷新
              </Button>
            </div>
          </div>
        </div>

        <Table
          row-key="id"
          :data-source="requests"
          :loading="loading"
          :pagination="{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage: number, nextPageSize: number) => {
              page = nextPage;
              pageSize = nextPageSize;
              loadRequests();
            },
          }"
          :scroll="{ x: 1180 }"
          size="small"
        >
          <Table.Column title="任务信息" width="300">
            <template #default="{ record }">
              <div class="space-y-1">
                <div class="font-medium text-gray-900">
                  {{ record.partName }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ record.processName }} · 数量 {{ record.quantity || 1 }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ record.requestNo }} / {{ record.workOrderNumber }}
                </div>
              </div>
            </template>
          </Table.Column>
          <Table.Column title="报检信息" width="210">
            <template #default="{ record }">
              <div class="space-y-1 text-xs">
                <div>
                  <span class="text-gray-500">报检人：</span
                  >{{ record.reporter }}
                </div>
                <div>
                  <span class="text-gray-500">班组：</span
                  >{{ record.team || '-' }}
                </div>
                <div>
                  自检 {{ checkResultLabel(record.selfCheckResult) }} / 互检
                  {{ checkResultLabel(record.mutualCheckResult) }}
                </div>
              </div>
            </template>
          </Table.Column>
          <Table.Column title="状态" width="120">
            <template #default="{ record }">
              <Tag :color="statusColor(record.status)">
                {{ statusLabel(record.status) }}
              </Tag>
            </template>
          </Table.Column>
          <Table.Column title="执行信息" width="260">
            <template #default="{ record }">
              <div class="space-y-1 text-xs">
                <div>
                  <span class="text-gray-500">检验员：</span>
                  {{ record.inspectorName || '-' }}
                </div>
                <div>
                  <span class="text-gray-500">调度：</span>
                  {{ record.dispatcherName || '-' }}
                </div>
                <div>
                  <span class="text-gray-500">等待：</span>
                  {{ waitDuration(record) }}
                  <span class="ml-2 text-gray-500">执行：</span>
                  {{ executeDuration(record) }}
                </div>
              </div>
            </template>
          </Table.Column>
          <Table.Column title="检验记录" width="110">
            <template #default="{ record }">
              <Button
                v-if="record.inspectionId"
                size="small"
                type="link"
                @click="openInspectionRecord(record)"
              >
                查看记录
              </Button>
              <span v-else class="text-xs text-gray-400">未关联</span>
            </template>
          </Table.Column>
          <Table.Column title="操作" width="220" fixed="right">
            <template #default="{ record }">
              <Space wrap size="small">
                <Button size="small" @click="openDispatchDetail(record)">
                  <template #icon>
                    <IconifyIcon icon="lucide:list-checks" />
                  </template>
                  详情
                </Button>
                <Button
                  size="small"
                  :disabled="record.status === 'CLOSED'"
                  @click="openDispatch(record)"
                >
                  <template #icon><IconifyIcon icon="lucide:send" /></template>
                  派单
                </Button>
                <Button
                  size="small"
                  :disabled="record.status === 'CLOSED'"
                  @click="openCloseQr(record)"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:qr-code" />
                  </template>
                  二维码
                </Button>
                <Button
                  size="small"
                  type="primary"
                  :disabled="record.status === 'CLOSED'"
                  @click="openClose(record)"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:check-circle" />
                  </template>
                  完成
                </Button>
                <Button
                  v-if="canDelete"
                  danger
                  size="small"
                  :disabled="Boolean(deleteDisabledReason(record))"
                  @click="confirmDelete(record)"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:trash-2" />
                  </template>
                  删除
                </Button>
              </Space>
            </template>
          </Table.Column>
        </Table>
      </Card>
    </div>

    <Modal
      v-model:open="dispatchOpen"
      title="派发检验任务"
      :confirm-loading="submitting"
      @ok="submitDispatch"
    >
      <Form layout="vertical">
        <Form.Item label="检验员" required>
          <Select
            v-model:value="dispatchForm.inspectorId"
            show-search
            :options="userOptions"
          />
        </Form.Item>
        <Form.Item label="优先级">
          <InputNumber
            v-model:value="dispatchForm.priority"
            :min="1"
            :max="5"
            class="w-full"
          />
        </Form.Item>
        <Form.Item label="派单备注">
          <Input.TextArea v-model:value="dispatchForm.dispatchRemark" />
        </Form.Item>
      </Form>
    </Modal>

    <Drawer
      v-model:open="dispatchDetailOpen"
      title="派单详情"
      :width="620"
      placement="right"
    >
      <Descriptions v-if="currentRequest" bordered :column="1" size="small">
        <Descriptions.Item label="报检单号">
          {{ currentRequest.requestNo }}
        </Descriptions.Item>
        <Descriptions.Item label="工单号">
          {{ currentRequest.workOrderNumber }}
        </Descriptions.Item>
        <Descriptions.Item label="部件 / 工序">
          {{ currentRequest.partName }} / {{ currentRequest.processName }}
        </Descriptions.Item>
        <Descriptions.Item label="数量">
          {{ currentRequest.quantity || 1 }}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag :color="statusColor(currentRequest.status)">
            {{ statusLabel(currentRequest.status) }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="报检人">
          {{ currentRequest.reporter }}
        </Descriptions.Item>
        <Descriptions.Item label="班组">
          {{ currentRequest.team || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="调度人">
          {{ currentRequest.dispatcherName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="检验员">
          {{ currentRequest.inspectorName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="派单任务 ID">
          {{ currentRequest.dispatchTaskId || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="派单时间">
          {{ formatDateTime(currentRequest.dispatchedAt) }}
        </Descriptions.Item>
        <Descriptions.Item label="等待派单时长">
          {{ waitDuration(currentRequest) }}
        </Descriptions.Item>
        <Descriptions.Item label="检验执行时长">
          {{ executeDuration(currentRequest) }}
        </Descriptions.Item>
        <Descriptions.Item label="关联检验记录">
          <Button
            v-if="currentRequest.inspectionId"
            type="link"
            @click="openInspectionRecord(currentRequest)"
          >
            查看检验记录
          </Button>
          <span v-else>-</span>
        </Descriptions.Item>
        <Descriptions.Item label="自检记录">
          <div
            v-if="currentRequest.attachments?.length"
            class="flex flex-col gap-1"
          >
            <a
              v-for="file in currentRequest.attachments"
              :key="file.url"
              :href="file.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ file.name }}
            </a>
          </div>
          <span v-else>-</span>
        </Descriptions.Item>
        <Descriptions.Item label="检验记录">
          <div
            v-if="currentRequest.closeAttachments?.length"
            class="flex flex-col gap-1"
          >
            <a
              v-for="file in currentRequest.closeAttachments"
              :key="file.url"
              :href="file.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ file.name }}
            </a>
          </div>
          <span v-else>-</span>
        </Descriptions.Item>
        <Descriptions.Item label="派单备注">
          {{ currentRequest.dispatchRemark || '-' }}
        </Descriptions.Item>
      </Descriptions>
    </Drawer>

    <Modal
      v-model:open="closeQrOpen"
      title="扫码关闭二维码"
      :footer="null"
      width="360px"
    >
      <div v-if="currentRequest" class="flex flex-col items-center gap-3">
        <img
          v-if="closeQr"
          :src="closeQr"
          alt="扫码关闭二维码"
          class="size-[180px]"
        />
        <div class="text-center text-sm font-medium">
          {{ currentRequest.requestNo }}
        </div>
        <div class="text-center text-xs text-gray-500">
          检验员扫码后会打开该任务的关闭窗口
        </div>
      </div>
    </Modal>

    <Modal
      v-model:open="closeOpen"
      title="完成检验"
      :confirm-loading="submitting"
      :width="shouldCreateLinkedIssue ? 800 : 520"
      @ok="submitClose"
    >
      <Form layout="vertical">
        <Form.Item label="已有检验记录 ID">
          <Input v-model:value="closeForm.inspectionId" allow-clear />
        </Form.Item>
        <Form.Item label="检验员">
          <Input v-model:value="closeForm.inspector" />
        </Form.Item>
        <div class="grid grid-cols-2 gap-3">
          <Form.Item label="检验结果">
            <Select
              v-model:value="closeForm.result"
              :options="[
                { label: '合格', value: 'PASS' },
                { label: '不合格', value: 'FAIL' },
              ]"
            />
          </Form.Item>
          <Form.Item label="数量">
            <InputNumber
              v-model:value="closeForm.quantity"
              :min="1"
              class="w-full"
            />
          </Form.Item>
        </div>
        <Form.Item label="检验记录">
          <Upload
            v-model:file-list="closeAttachmentFileList"
            action="/api/upload"
            :headers="uploadHeaders"
            multiple
            @change="handleCloseAttachmentUploadChange"
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
          <Input.TextArea v-model:value="closeForm.closeRemark" />
        </Form.Item>

        <!-- 不合格项填写区域 -->
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
                v-model:value="linkedIssueDraft.partName"
                :disabled="Boolean(currentRequest?.partName)"
                placeholder="自动沿用，可手动补充"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">工序</div>
              <Input
                v-model:value="linkedIssueDraft.processName"
                :disabled="Boolean(currentRequest?.processName)"
                placeholder="自动沿用，可手动补充"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">责任部门</div>
              <Input
                v-model:value="linkedIssueDraft.responsibleDepartment"
                placeholder="自动沿用班组，可手动补充"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">责任焊工</div>
              <Input
                v-model:value="linkedIssueDraft.responsibleWelder"
                placeholder="请填写责任焊工"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">责任单位（供应商）</div>
              <Input
                v-model:value="linkedIssueDraft.supplierName"
                placeholder="自动沿用供应商，可手动补充"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">报告日期</div>
              <Input :value="linkedIssueDraft.reportDate" disabled />
            </div>
            <div>
              <div class="mb-1 text-gray-600">检验员</div>
              <Input :value="linkedIssueDraft.reportedBy" disabled />
            </div>
            <div>
              <div class="mb-1 text-gray-600">缺陷分类</div>
              <Select
                v-model:value="linkedIssueDraft.defectType"
                :options="defectOptions"
                class="w-full"
                @change="
                  () => {
                    linkedIssueDraft.defectSubtype =
                      linkedDefectSubtypeOptions[0]?.value || '';
                  }
                "
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">二级分类</div>
              <Select
                v-model:value="linkedIssueDraft.defectSubtype"
                :options="linkedDefectSubtypeOptions"
                class="w-full"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">合格数量</div>
              <InputNumber
                :value="linkedIssueDraft.qualifiedQuantity"
                :min="0"
                class="w-full"
                disabled
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">不合格数量</div>
              <InputNumber
                v-model:value="linkedIssueDraft.unqualifiedQuantity"
                :min="0"
                :max="Math.max(1, Number(closeForm.quantity) || 1)"
                class="w-full"
                @change="syncLinkedIssueQuantities"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">严重程度</div>
              <Select
                v-model:value="linkedIssueDraft.severity"
                :options="severityOptions"
                class="w-full"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">状态</div>
              <Select
                v-model:value="linkedIssueDraft.status"
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
                v-model:value="linkedIssueDraft.claim"
                :options="claimOptions"
                class="w-full"
              />
            </div>
            <div>
              <div class="mb-1 text-gray-600">损失金额</div>
              <InputNumber
                v-model:value="linkedIssueDraft.lossAmount"
                :min="0"
                :step="0.01"
                class="w-full"
              />
            </div>
            <div class="col-span-3">
              <div class="mb-1 text-gray-600">不合格描述</div>
              <Input.TextArea
                v-model:value="linkedIssueDraft.description"
                :rows="3"
                placeholder="请填写不合格描述"
              />
            </div>
            <div class="col-span-3">
              <div class="mb-1 text-gray-600">原因分析</div>
              <Input.TextArea
                v-model:value="linkedIssueDraft.rootCause"
                :rows="2"
                placeholder="请填写原因分析"
              />
            </div>
            <div class="col-span-3">
              <div class="mb-1 text-gray-600">解决方案</div>
              <Input.TextArea
                v-model:value="linkedIssueDraft.solution"
                :rows="2"
                placeholder="请填写解决方案"
              />
            </div>
            <div class="col-span-3">
              <IssuePhotoUpload
                v-model:value="linkedIssueDraft.photos"
                :max-count="8"
              />
            </div>
          </div>
        </div>
      </Form>
    </Modal>
  </Page>
</template>
