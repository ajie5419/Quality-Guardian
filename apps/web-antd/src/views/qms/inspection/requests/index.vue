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
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Menu,
  message,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
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
  getInspectionRequestStats,
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
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const loading = ref(false);
const submitting = ref(false);
const requests = ref<InspectionRequest[]>([]);
const requestStats = ref({
  byInspector: [] as Array<{ count: number; inspector: string }>,
  byTeam: [] as Array<{ count: number; team: string }>,
  inspectorStatus: [] as Array<{
    activeTaskCount: number;
    averageTaskMinutes: number;
    completedTaskCount: number;
    currentTaskMinutes: number;
    inspector: string;
    status: 'BUSY' | 'IDLE';
  }>,
  pendingDispatchCount: 0,
  pendingInspectionCount: 0,
  todayClosedCount: 0,
  todaySubmittedCount: 0,
});
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
const activeView = ref('current');
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
];

const viewOptions = [
  { label: '当前任务', value: 'current' },
  { label: '待派单', value: 'submitted' },
  { label: '已派单', value: 'dispatched' },
  { label: '我的检验', value: 'inspecting' },
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
const routeDispatchRequestId = computed(() =>
  String(
    route.query.dispatchRequestId || route.query.closeRequestId || '',
  ).trim(),
);
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Requests:Delete']),
);
const topTeamStats = computed(() => requestStats.value.byTeam.slice(0, 4));
const topInspectorStatus = computed(() =>
  requestStats.value.inspectorStatus.slice(0, 4),
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

function minutesText(value?: number) {
  const totalMinutes = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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

function isDirectClosed(record: InspectionRequest) {
  return record.status === 'CLOSED' && !record.dispatchedAt;
}

function isClosed(record: InspectionRequest) {
  return record.status === 'CLOSED';
}

function isDispatchable(record: InspectionRequest) {
  return record.status === 'SUBMITTED';
}

function isCompletable(record: InspectionRequest) {
  return record.status === 'DISPATCHED' || record.status === 'INSPECTING';
}

function isSelfDispatched(record: InspectionRequest) {
  return isDirectClosed(record) && Boolean(record.inspectorName);
}

function displayInspector(record: InspectionRequest) {
  return record.inspectorName || (record.status === 'CLOSED' ? '未记录' : '-');
}

function displayDispatcher(record: InspectionRequest) {
  if (record.dispatcherName) return record.dispatcherName;
  if (isSelfDispatched(record)) return '自派单';
  if (isDirectClosed(record)) return '未派单';
  return '-';
}

function displayDispatchTime(record: InspectionRequest) {
  if (record.dispatchedAt) return formatDateTime(record.dispatchedAt);
  if (isDirectClosed(record)) return '未派单';
  return '-';
}

function executionDurationLabel(record: InspectionRequest) {
  if (record.dispatchedAt) return '执行';
  if (isDirectClosed(record)) return '总耗时';
  return '执行';
}

function displayExecutionDuration(record: InspectionRequest) {
  if (record.dispatchedAt) return executeDuration(record);
  return isDirectClosed(record)
    ? durationText(record.submittedAt, record.closedAt)
    : '-';
}

function missingValueClass(value?: null | string) {
  return value ? '' : 'text-gray-400';
}

function directClosedClass(record: InspectionRequest) {
  return isDirectClosed(record) ? 'text-gray-400' : '';
}

function rowClassName(record: InspectionRequest) {
  return isClosed(record) ? 'inspection-request-row-closed' : '';
}

function actionMenuKeys(record: InspectionRequest) {
  const keys = [];
  if (!isClosed(record)) {
    keys.push('qr');
  }
  if (record.inspectionId) {
    keys.push('record');
  }
  if (canDelete.value) {
    keys.push('delete');
  }
  return keys;
}

function hasActionMenu(record: InspectionRequest) {
  return actionMenuKeys(record).length > 0;
}

function handleActionMenuClick(record: InspectionRequest, key: unknown) {
  const action = String(key);
  if (action === 'delete') {
    confirmDelete(record);
    return;
  }
  if (action === 'qr') {
    void openCloseQr(record);
    return;
  }
  if (action === 'record') {
    openInspectionRecord(record);
  }
}

function currentUserName() {
  return (
    normalizeCloseText(userStore.userInfo?.realName) ||
    normalizeCloseText(userStore.userInfo?.username)
  );
}

function displayCloseReadonlyValue(value?: null | string) {
  return normalizeCloseText(value) || '系统自动创建';
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

async function handleStatusFilterChange() {
  switch (query.status) {
    case 'DISPATCHED': {
      activeView.value = 'dispatched';
      break;
    }
    case 'SUBMITTED': {
      activeView.value = 'submitted';
      break;
    }
    default: {
      activeView.value = 'current';
    }
  }
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
      current: !query.status,
      includeClosed: shouldUseMineFilter(),
      keyword: query.keyword || undefined,
      mine: shouldUseMineFilter(),
      page: page.value,
      pageSize: pageSize.value,
      status: query.status,
    });
    requests.value = res.items || [];
    total.value = res.total || 0;
    openDispatchDetailFromRoute();
  } finally {
    loading.value = false;
  }
}

async function loadRequestStats() {
  requestStats.value = await getInspectionRequestStats();
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
    await Promise.all([loadRequests(), loadRequestStats()]);
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

function openCloseFromDispatchDetail() {
  if (!currentRequest.value) return;
  openClose(currentRequest.value);
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
    await Promise.all([loadRequests(), loadRequestStats()]);
  } finally {
    submitting.value = false;
  }
}

function deleteDisabledReason(record: InspectionRequest) {
  void record;
  if (!canDelete.value) return '无删除权限';
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
      await Promise.all([loadRequests(), loadRequestStats()]);
    },
  });
}

function openClose(record: InspectionRequest) {
  currentRequest.value = record;
  closeAttachmentFileList.value = [];
  closeForm.attachments = [];
  closeForm.closeRemark = '';
  closeForm.inspectionId = record.inspectionId || '';
  closeForm.inspector = record.inspectorName || currentUserName();
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
    reportedBy: record.inspectorName || currentUserName() || '',
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
  closeQr.value = await makeQr(
    buildRequestUrl({ dispatchRequestId: record.id }),
  );
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
    await Promise.all([loadRequests(), loadRequestStats()]);
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
  if (routeDispatchRequestId.value) {
    query.keyword = routeDispatchRequestId.value;
  }
}

function openDispatchDetailFromRoute() {
  if (!routeDispatchRequestId.value || dispatchDetailOpen.value) return;
  const matched = requests.value.find(
    (item) => item.id === routeDispatchRequestId.value,
  );
  if (matched) {
    openDispatchDetail(matched);
  }
}

onMounted(async () => {
  applyRoutePrefill();
  requestEntryQr.value = await makeQr(requestEntryUrl.value);
  await Promise.all([loadUsers(), loadRequests(), loadRequestStats()]);
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
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div class="rounded border border-blue-100 bg-blue-50 px-4 py-3">
              <div class="text-xs text-blue-700">今日报检</div>
              <div class="mt-1 flex items-end gap-2">
                <span class="text-3xl font-semibold text-blue-900">
                  {{ requestStats.todaySubmittedCount }}
                </span>
                <span class="pb-1 text-xs text-blue-600">
                  完成 {{ requestStats.todayClosedCount }}
                </span>
              </div>
              <div class="mt-2 flex gap-3 text-xs text-blue-700">
                <span>待派 {{ requestStats.pendingDispatchCount }}</span>
                <span>待检 {{ requestStats.pendingInspectionCount }}</span>
              </div>
            </div>

            <div class="rounded border border-amber-100 bg-amber-50 px-4 py-3">
              <div class="flex items-center justify-between">
                <div class="text-xs text-amber-700">今日班组报检</div>
                <div class="text-xs text-amber-600">
                  {{ requestStats.byTeam.length }} 个班组
                </div>
              </div>
              <div v-if="topTeamStats.length > 0" class="mt-2 space-y-1">
                <div
                  v-for="item in topTeamStats"
                  :key="item.team"
                  class="flex items-center justify-between text-xs"
                >
                  <span class="truncate text-amber-900">{{ item.team }}</span>
                  <span class="font-semibold text-amber-900">
                    {{ item.count }}
                  </span>
                </div>
              </div>
              <div v-else class="mt-2 text-xs text-amber-600">
                今日暂无班组报检
              </div>
            </div>

            <div
              class="rounded border border-emerald-100 bg-emerald-50 px-4 py-3"
            >
              <div class="flex items-center justify-between">
                <div class="text-xs text-emerald-700">检验员状态</div>
                <div class="text-xs text-emerald-600">
                  {{ requestStats.inspectorStatus.length }} 人
                </div>
              </div>
              <div v-if="topInspectorStatus.length > 0" class="mt-2 space-y-1">
                <div
                  v-for="item in topInspectorStatus"
                  :key="item.inspector"
                  class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-xs"
                >
                  <div class="min-w-0">
                    <div class="truncate text-emerald-900">
                      {{ item.inspector }}
                      <Tag
                        class="ml-1"
                        :color="
                          item.status === 'BUSY' ? 'processing' : 'default'
                        "
                      >
                        {{ item.status === 'BUSY' ? '有任务' : '空闲' }}
                      </Tag>
                    </div>
                    <div class="truncate text-emerald-700">
                      当前 {{ item.activeTaskCount }} · 已用
                      {{ minutesText(item.currentTaskMinutes) }}
                    </div>
                  </div>
                  <div class="text-right text-emerald-900">
                    <div class="font-semibold">
                      完成 {{ item.completedTaskCount }}
                    </div>
                    <div class="text-emerald-700">
                      均 {{ minutesText(item.averageTaskMinutes) }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="mt-2 text-xs text-emerald-600">
                暂无检验员任务
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
                @change="handleStatusFilterChange"
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
          :row-class-name="rowClassName"
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
          size="small"
        >
          <Table.Column title="任务" :min-width="280">
            <template #default="{ record }">
              <div class="min-w-0 space-y-0.5">
                <div class="truncate font-medium text-gray-900">
                  {{ record.partName }}
                </div>
                <div class="truncate text-xs text-gray-500">
                  {{ record.processName }} · {{ record.quantity || 1 }}
                </div>
                <div class="truncate text-xs text-gray-400">
                  {{ record.requestNo }} / {{ record.workOrderNumber }}
                </div>
              </div>
            </template>
          </Table.Column>
          <Table.Column title="报检" width="210">
            <template #default="{ record }">
              <div class="space-y-0.5 text-xs">
                <div class="truncate text-gray-700">
                  {{ record.reporter }}
                  <span class="text-gray-400">/ {{ record.team || '-' }}</span>
                </div>
                <div class="truncate text-gray-500">
                  {{ formatDateTime(record.submittedAt) }}
                </div>
                <div class="truncate text-gray-400">
                  自检 {{ checkResultLabel(record.selfCheckResult) }} / 互检
                  {{ checkResultLabel(record.mutualCheckResult) }}
                </div>
              </div>
            </template>
          </Table.Column>
          <Table.Column title="状态" width="110">
            <template #default="{ record }">
              <Tag :color="statusColor(record.status)">
                {{ statusLabel(record.status) }}
              </Tag>
            </template>
          </Table.Column>
          <Table.Column title="执行" width="260">
            <template #default="{ record }">
              <div class="space-y-0.5 text-xs">
                <div class="truncate">
                  <span class="text-gray-500">检：</span>
                  <span :class="missingValueClass(record.inspectorName)">
                    {{ displayInspector(record) }}
                  </span>
                  <span class="mx-1 text-gray-300">/</span>
                  <span class="text-gray-500">调：</span>
                  <span :class="missingValueClass(record.dispatcherName)">
                    {{ displayDispatcher(record) }}
                  </span>
                </div>
                <div class="truncate">
                  <span class="text-gray-500">等待：</span>
                  <span>{{ waitDuration(record) }}</span>
                  <span class="mx-1 text-gray-300">/</span>
                  <span class="text-gray-500"
                    >{{ executionDurationLabel(record) }}：</span
                  >
                  <span :class="directClosedClass(record)">
                    {{ displayExecutionDuration(record) }}
                  </span>
                </div>
                <div class="truncate text-gray-400">
                  派单：<span :class="directClosedClass(record)">
                    {{ displayDispatchTime(record) }}
                  </span>
                </div>
              </div>
            </template>
          </Table.Column>
          <Table.Column title="操作" width="180" fixed="right">
            <template #default="{ record }">
              <Space size="small">
                <Button size="small" @click="openDispatchDetail(record)">
                  <template #icon>
                    <IconifyIcon icon="lucide:list-checks" />
                  </template>
                  详情
                </Button>
                <Button
                  v-if="isDispatchable(record)"
                  size="small"
                  @click="openDispatch(record)"
                >
                  <template #icon><IconifyIcon icon="lucide:send" /></template>
                  派单
                </Button>
                <Button
                  v-if="isCompletable(record)"
                  size="small"
                  type="primary"
                  @click="openClose(record)"
                >
                  <template #icon>
                    <IconifyIcon icon="lucide:check-circle" />
                  </template>
                  完成
                </Button>
                <Dropdown v-if="hasActionMenu(record)" trigger="click">
                  <Tooltip title="更多操作">
                    <Button size="small">
                      <template #icon>
                        <IconifyIcon icon="lucide:more-horizontal" />
                      </template>
                    </Button>
                  </Tooltip>
                  <template #overlay>
                    <Menu
                      @click="({ key }) => handleActionMenuClick(record, key)"
                    >
                      <Menu.Item v-if="!isClosed(record)" key="qr">
                        <template #icon>
                          <IconifyIcon icon="lucide:qr-code" />
                        </template>
                        二维码
                      </Menu.Item>
                      <Menu.Item v-if="record.inspectionId" key="record">
                        <template #icon>
                          <IconifyIcon icon="lucide:file-check-2" />
                        </template>
                        查看记录
                      </Menu.Item>
                      <Menu.Item v-if="canDelete" key="delete" danger>
                        <template #icon>
                          <IconifyIcon icon="lucide:trash-2" />
                        </template>
                        删除
                      </Menu.Item>
                    </Menu>
                  </template>
                </Dropdown>
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
        <Descriptions.Item label="报检时间">
          {{ formatDateTime(currentRequest.submittedAt) }}
        </Descriptions.Item>
        <Descriptions.Item label="班组">
          {{ currentRequest.team || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="调度人">
          <span :class="missingValueClass(currentRequest.dispatcherName)">
            {{ displayDispatcher(currentRequest) }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="检验员">
          <span :class="missingValueClass(currentRequest.inspectorName)">
            {{ displayInspector(currentRequest) }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="派单任务 ID">
          <span :class="missingValueClass(currentRequest.dispatchTaskId)">
            {{ currentRequest.dispatchTaskId || '-' }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="派单时间">
          <span :class="directClosedClass(currentRequest)">
            {{ displayDispatchTime(currentRequest) }}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="等待派单时长">
          {{ waitDuration(currentRequest) }}
        </Descriptions.Item>
        <Descriptions.Item
          :label="`${executionDurationLabel(currentRequest)}时长`"
        >
          <span :class="directClosedClass(currentRequest)">
            {{ displayExecutionDuration(currentRequest) }}
          </span>
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
      <div
        v-if="currentRequest"
        class="mt-4 flex justify-end border-t border-gray-100 pt-4"
      >
        <Button
          type="primary"
          :disabled="currentRequest.status === 'CLOSED'"
          @click="openCloseFromDispatchDetail"
        >
          <template #icon>
            <IconifyIcon icon="lucide:check-circle" />
          </template>
          完成检验
        </Button>
      </div>
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
          检验员扫码后会打开派单详情，可在详情中完成检验
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
        <div class="mb-4 rounded border border-gray-100 bg-gray-50 px-3 py-2">
          <div class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div class="mb-1 text-gray-500">已有检验记录 ID</div>
              <div class="truncate text-gray-400">
                {{ displayCloseReadonlyValue(closeForm.inspectionId) }}
              </div>
            </div>
            <div>
              <div class="mb-1 text-gray-500">检验员</div>
              <div class="truncate text-gray-500">
                {{ closeForm.inspector || '当前登录用户' }}
              </div>
            </div>
          </div>
        </div>
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

<style scoped>
:deep(.inspection-request-row-closed) td {
  background: #fafafa;
}

:deep(.inspection-request-row-closed .text-gray-900) {
  color: #6b7280;
}
</style>
