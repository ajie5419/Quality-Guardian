<script lang="ts" setup>
import type {
  InspectionRequest,
  InspectionRequestStatus,
} from '#/api/qms/inspection-request';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemUserApi } from '#/api/system/user';
import type { TreeSelectNode } from '#/types';

import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Drawer,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Menu,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  TreeSelect,
  Upload,
} from 'ant-design-vue';
import QRCode from 'qrcode';

import {
  getInspectionRequests,
  getInspectionRequestStats,
} from '#/api/qms/inspection-request';
import { getDeptList } from '#/api/system/dept';
import { getUserList } from '#/api/system/user';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { convertToTreeSelectData } from '#/types';
import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';

import IssuePhotoUpload from '../issues/components/IssuePhotoUpload.vue';
import {
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
} from '../issues/constants';
import TeamSelect from '../records/components/form/TeamSelect.vue';
import { useInspectionRequestEntryForm } from './composables/useInspectionRequestEntryForm';
import { useInspectionRequestPresentation } from './composables/useInspectionRequestPresentation';
import { useInspectionRequestTaskActions } from './composables/useInspectionRequestTaskActions';

defineOptions({ name: 'QMSInspectionRequests' });

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const { handleApiError } = useErrorHandler();
const loading = ref(false);
const requests = ref<InspectionRequest[]>([]);
const requestStats = ref({
  byInspector: [] as Array<{ count: number; inspector: string }>,
  byTeam: [] as Array<{ count: number; team: string }>,
  historyByInspector: [] as Array<{
    averageTaskMinutes: number;
    completedTaskCount: number;
    inspector: string;
  }>,
  historyByTeam: [] as Array<{ count: number; team: string }>,
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
const inspectorStatusOpen = ref(false);
const requestEntryQr = ref('');
const activeView = ref('current');
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);

const { defectOptions, defectSubtypes } = useDefectOptions();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();

const query = reactive({
  keyword: '',
  status: undefined as InspectionRequestStatus | undefined,
});

const {
  attachmentFileList,
  bomPartOptions,
  bomPartsLoading,
  checkResultOptions,
  isRequestAssemblyProcess,
  processOptions,
  requestForm,
  submitting: entrySubmitting,
  workOrderRequirementsLoading,
  applyRoutePrefill: applyEntryRoutePrefill,
  handleAttachmentUploadChange,
  submitRequest: submitEntryRequest,
} = useInspectionRequestEntryForm({
  async onSubmitted() {
    page.value = 1;
    await Promise.all([loadRequests(), loadRequestStats()]);
  },
});
const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Requests:Delete']),
);

const viewOptions = [
  { label: '当前任务', value: 'current' },
  { label: '待派单', value: 'submitted' },
  { label: '已派单', value: 'dispatched' },
  { label: '我的检验', value: 'inspecting' },
  { label: '扫码报检入口', value: 'entry' },
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

const requestEntryUrl = computed(() =>
  buildRequestUrl({ entry: 'submit' }, '/qms/inspection/requests/entry'),
);
const isEntryView = computed(() => activeView.value === 'entry');
const {
  busyInspectorCount,
  idleInspectorCount,
  sortedInspectorStatus,
  statusOptions,
  visibleInspectorStatus,
  checkResultLabel,
  directClosedClass,
  displayDispatcher,
  displayDispatchTime,
  displayExecutionDuration,
  displayInspector,
  executionDurationLabel,
  formatDateTime,
  hasActionMenu,
  hasLinkedIssue,
  inspectionQuantityText,
  inspectionResultColor,
  inspectionResultLabel,
  isClosed,
  isCompletable,
  isDispatchable,
  issueStatusColor,
  issueStatusLabel,
  minutesText,
  missingValueClass,
  rowClassName,
  statusColor,
  statusLabel,
  waitDuration,
} = useInspectionRequestPresentation({
  canDelete,
  checkResultOptions,
  requestStats,
});

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
    String(userStore.userInfo?.realName || '').trim() ||
    String(userStore.userInfo?.username || '').trim()
  );
}

function buildRequestUrl(
  params: Record<string, string>,
  path = '/qms/inspection/requests',
) {
  const origin =
    typeof window === 'undefined'
      ? 'http://localhost:5666'
      : window.location.origin;
  const routePath = path.startsWith('/') ? path : `/${path}`;
  const routeUrl = new URL(routePath, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) routeUrl.searchParams.set(key, value);
  }

  if (import.meta.env.VITE_ROUTER_HISTORY === 'hash') {
    return `${origin}/#${routeUrl.pathname}${routeUrl.search}`;
  }

  return routeUrl.toString();
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
    case 'dispatched': {
      query.status = 'DISPATCHED';

      break;
    }
    case 'inspecting': {
      query.status = undefined;

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
  closeRouteDispatchDetail();
  applyViewStatus(activeView.value);
  page.value = 1;
  if (isEntryView.value) return;
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

async function refreshInspectionRequestPage() {
  if (isEntryView.value) return;
  page.value = 1;
  await Promise.all([loadRequests(), loadRequestStats()]);
}

const {
  closeAttachmentFileList,
  closeForm,
  closeOpen,
  closeQr,
  closeQrOpen,
  currentRequest,
  dispatchDetailOpen,
  dispatchForm,
  dispatchOpen,
  linkedDefectSubtypeOptions,
  linkedIssueDraft,
  shouldCreateLinkedIssue,
  submitting,
  applyRouteDispatchDetail,
  closeRouteDispatchDetail,
  confirmDelete,
  displayCloseReadonlyValue,
  handleCloseAttachmentUploadChange,
  openClose,
  openCloseFromDispatchDetail,
  openCloseQr,
  openDispatch,
  openDispatchDetail,
  openDispatchDetailFromRoute,
  submitClose,
  submitDispatch,
  syncLinkedIssueQuantities,
} = useInspectionRequestTaskActions({
  canDelete,
  defectSubtypes,
  deptRawData,
  async onAfterMutation() {
    await Promise.all([loadRequests(), loadRequestStats()]);
  },
  buildRequestUrl,
  getCurrentUserName: currentUserName,
  handleApiError,
  makeQr,
  query,
  requests,
  route,
  router,
});

async function loadUsers() {
  const res = await getUserList({ page: 1, pageSize: 200 });
  users.value = res.items || [];
}

async function loadDeptData() {
  const data = await getDeptList();
  deptRawData.value = data;
  deptTreeData.value = convertToTreeSelectData(data);
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

function handleInspectionRequestCreated() {
  void refreshInspectionRequestPage();
}

onMounted(async () => {
  applyEntryRoutePrefill(route.query);
  applyRouteDispatchDetail();
  requestEntryQr.value = await makeQr(requestEntryUrl.value);
  await Promise.all([
    loadDeptData(),
    loadUsers(),
    loadRequests(),
    loadRequestStats(),
  ]);
  window.addEventListener(
    'qms:inspection-request-created',
    handleInspectionRequestCreated,
  );
});

onUnmounted(() => {
  window.removeEventListener(
    'qms:inspection-request-created',
    handleInspectionRequestCreated,
  );
});

watch(
  () => route.query,
  async () => {
    applyEntryRoutePrefill(route.query);
    applyRouteDispatchDetail();
    await loadRequests();
  },
);
</script>

<template>
  <Page content-class="p-4">
    <div class="space-y-4">
      <Card>
        <div class="mb-4 space-y-4">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="rounded border border-blue-100 bg-blue-50 px-4 py-3">
              <div class="text-xs text-blue-700">待派单</div>
              <div class="mt-1 text-2xl font-semibold text-blue-900">
                {{ requestStats.pendingDispatchCount }}
              </div>
              <div class="mt-1 text-xs text-blue-600">
                今日报检 {{ requestStats.todaySubmittedCount }}
              </div>
            </div>

            <div class="rounded border border-amber-100 bg-amber-50 px-4 py-3">
              <div class="text-xs text-amber-700">待检验</div>
              <div class="mt-1 text-2xl font-semibold text-amber-900">
                {{ requestStats.pendingInspectionCount }}
              </div>
              <div class="mt-1 text-xs text-amber-600">含待复检任务</div>
            </div>

            <div
              class="rounded border border-emerald-100 bg-emerald-50 px-4 py-3"
            >
              <div class="text-xs text-emerald-700">今日完成</div>
              <div class="mt-1 text-2xl font-semibold text-emerald-900">
                {{ requestStats.todayClosedCount }}
              </div>
              <div class="mt-1 text-xs text-emerald-600">看板中查看趋势</div>
            </div>
          </div>

          <div v-if="!isEntryView" class="rounded border bg-gray-50 p-3">
            <div class="mb-2 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-900">
                  检验员状态
                </span>
                <Tag color="success">空闲 {{ idleInspectorCount }}</Tag>
                <Tag color="processing">忙碌 {{ busyInspectorCount }}</Tag>
              </div>
              <Button
                v-if="requestStats.inspectorStatus.length > 0"
                type="link"
                size="small"
                @click="inspectorStatusOpen = true"
              >
                查看全部
              </Button>
            </div>
            <div
              v-if="visibleInspectorStatus.length > 0"
              class="flex gap-2 overflow-x-auto pb-1"
            >
              <button
                v-for="item in visibleInspectorStatus"
                :key="item.inspector"
                class="min-w-[180px] rounded border bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:shadow-sm"
                type="button"
                @click="inspectorStatusOpen = true"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm font-medium text-gray-900">
                    {{ item.inspector || '未记录' }}
                  </span>
                  <Tag
                    :color="item.status === 'BUSY' ? 'processing' : 'success'"
                  >
                    {{ item.status === 'BUSY' ? '有任务' : '空闲' }}
                  </Tag>
                </div>
                <div class="mt-1 text-xs text-gray-500">
                  当前 {{ item.activeTaskCount }} 项 · 已用
                  {{ minutesText(item.currentTaskMinutes) }}
                </div>
                <div class="mt-0.5 text-xs text-gray-400">
                  完成 {{ item.completedTaskCount }} · 均
                  {{ minutesText(item.averageTaskMinutes) }}
                </div>
              </button>
            </div>
            <div v-else class="py-3 text-sm text-gray-400">
              暂无检验员状态数据
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
            <div v-if="!isEntryView" class="flex flex-wrap items-center gap-2">
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

        <div
          v-if="isEntryView"
          class="max-w-[460px] rounded border bg-white p-4"
        >
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
            <Form.Item label="一级部件名称" required>
              <Select
                v-model:value="requestForm.partName"
                :options="bomPartOptions"
                :loading="bomPartsLoading"
                :disabled="!requestForm.workOrderNumber"
                placeholder="请选择BOM一级部件"
                show-search
                allow-clear
              />
            </Form.Item>
            <Form.Item
              v-if="!isRequestAssemblyProcess"
              label="组件名称"
              required
            >
              <Input
                v-model:value="requestForm.componentName"
                placeholder="请输入组件名称"
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
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Input.TextArea
                v-model:value="requestForm.requestInfo"
                :rows="4"
              />
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
              :loading="entrySubmitting"
              @click="submitEntryRequest"
            >
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              提交报检
            </Button>
          </Form>
        </div>

        <Table
          v-else
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
                  <span v-if="record.componentName">
                    / {{ record.componentName }}
                  </span>
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
              <div class="space-y-1">
                <Tag :color="statusColor(record.status)">
                  {{ statusLabel(record.status) }}
                </Tag>
                <Tag
                  v-if="
                    record.status === 'CLOSED' ||
                    record.inspectionResult === 'FAIL'
                  "
                  :color="inspectionResultColor(record)"
                >
                  {{ inspectionResultLabel(record) }}
                </Tag>
                <div
                  v-if="
                    record.status === 'CLOSED' ||
                    record.inspectionResult === 'FAIL'
                  "
                  class="text-xs text-gray-500"
                >
                  {{ inspectionQuantityText(record) }}
                </div>
                <div v-if="hasLinkedIssue(record)" class="text-xs text-red-500">
                  {{ record.linkedIssueNo || '已生成不合格项' }}
                </div>
              </div>
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
      width="min(100vw, 620px)"
      placement="right"
      :body-style="{ padding: 0 }"
    >
      <div v-if="currentRequest" class="flex min-h-full flex-col bg-gray-50">
        <div class="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
          <div class="rounded border border-blue-100 bg-white p-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-base font-semibold text-gray-900">
                  {{ currentRequest.requestNo }}
                </div>
                <div class="mt-1 break-words text-sm text-gray-600">
                  {{ currentRequest.partName }}
                  <template v-if="currentRequest.componentName">
                    / {{ currentRequest.componentName }}
                  </template>
                  / {{ currentRequest.processName }}
                </div>
              </div>
              <div class="flex shrink-0 flex-wrap justify-end gap-1">
                <Tag :color="statusColor(currentRequest.status)">
                  {{ statusLabel(currentRequest.status) }}
                </Tag>
                <Tag
                  v-if="
                    currentRequest.status === 'CLOSED' ||
                    currentRequest.inspectionResult === 'FAIL'
                  "
                  :color="inspectionResultColor(currentRequest)"
                >
                  {{ inspectionResultLabel(currentRequest) }}
                </Tag>
              </div>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div class="rounded bg-gray-50 px-2 py-2">
                <div class="text-gray-500">数量</div>
                <div class="mt-1 font-semibold text-gray-900">
                  {{ currentRequest.quantity || 1 }}
                </div>
              </div>
              <div class="rounded bg-gray-50 px-2 py-2">
                <div class="text-gray-500">班组</div>
                <div class="mt-1 truncate font-semibold text-gray-900">
                  {{ currentRequest.team || '-' }}
                </div>
              </div>
              <div class="rounded bg-gray-50 px-2 py-2">
                <div class="text-gray-500">等待</div>
                <div class="mt-1 font-semibold text-gray-900">
                  {{ waitDuration(currentRequest) }}
                </div>
              </div>
              <div class="rounded bg-gray-50 px-2 py-2">
                <div class="text-gray-500">
                  {{ executionDurationLabel(currentRequest) }}
                </div>
                <div class="mt-1 font-semibold text-gray-900">
                  {{ displayExecutionDuration(currentRequest) }}
                </div>
              </div>
              <div
                v-if="
                  currentRequest.status === 'CLOSED' ||
                  currentRequest.inspectionResult === 'FAIL'
                "
                class="rounded bg-gray-50 px-2 py-2"
              >
                <div class="text-gray-500">检验结果</div>
                <div
                  class="mt-1 font-semibold"
                  :class="
                    currentRequest.inspectionResult === 'FAIL'
                      ? 'text-red-600'
                      : 'text-green-600'
                  "
                >
                  {{ inspectionResultLabel(currentRequest) }}
                </div>
              </div>
              <div
                v-if="
                  currentRequest.status === 'CLOSED' ||
                  currentRequest.inspectionResult === 'FAIL'
                "
                class="rounded bg-gray-50 px-2 py-2"
              >
                <div class="text-gray-500">检验数量</div>
                <div class="mt-1 font-semibold text-gray-900">
                  {{ inspectionQuantityText(currentRequest) }}
                </div>
              </div>
            </div>
          </div>

          <div class="rounded border border-gray-100 bg-white p-3">
            <div class="mb-2 text-sm font-medium text-gray-900">报检信息</div>
            <div class="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <div class="text-xs text-gray-500">工单号</div>
                <div class="mt-0.5 break-words text-gray-900">
                  {{ currentRequest.workOrderNumber }}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">报检人</div>
                <div class="mt-0.5 break-words text-gray-900">
                  {{ currentRequest.reporter || '-' }}
                </div>
              </div>
              <div class="sm:col-span-2">
                <div class="text-xs text-gray-500">报检时间</div>
                <div class="mt-0.5 text-gray-900">
                  {{ formatDateTime(currentRequest.submittedAt) }}
                </div>
              </div>
            </div>
          </div>

          <div class="rounded border border-gray-100 bg-white p-3">
            <div class="mb-2 text-sm font-medium text-gray-900">执行信息</div>
            <div class="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <div class="text-xs text-gray-500">调度人</div>
                <div
                  class="mt-0.5 break-words text-gray-900"
                  :class="missingValueClass(currentRequest.dispatcherName)"
                >
                  {{ displayDispatcher(currentRequest) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">检验员</div>
                <div
                  class="mt-0.5 break-words text-gray-900"
                  :class="missingValueClass(currentRequest.inspectorName)"
                >
                  {{ displayInspector(currentRequest) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">派单任务 ID</div>
                <div
                  class="mt-0.5 break-all text-gray-900"
                  :class="missingValueClass(currentRequest.dispatchTaskId)"
                >
                  {{ currentRequest.dispatchTaskId || '-' }}
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500">派单时间</div>
                <div
                  class="mt-0.5 text-gray-900"
                  :class="directClosedClass(currentRequest)"
                >
                  {{ displayDispatchTime(currentRequest) }}
                </div>
              </div>
              <div class="sm:col-span-2">
                <div class="text-xs text-gray-500">派单备注</div>
                <div
                  class="mt-0.5 whitespace-pre-wrap break-words text-gray-900"
                >
                  {{ currentRequest.dispatchRemark || '-' }}
                </div>
              </div>
            </div>
          </div>

          <div class="rounded border border-gray-100 bg-white p-3">
            <div class="mb-2 text-sm font-medium text-gray-900">检验资料</div>
            <div class="space-y-3 text-sm">
              <div>
                <div class="mb-1 text-xs text-gray-500">关联检验记录</div>
                <Button
                  v-if="currentRequest.inspectionId"
                  type="link"
                  class="h-auto p-0"
                  @click="openInspectionRecord(currentRequest)"
                >
                  查看检验记录
                </Button>
                <span v-else class="text-gray-400">-</span>
              </div>
              <div v-if="hasLinkedIssue(currentRequest)">
                <div class="mb-1 text-xs text-gray-500">关联不合格项</div>
                <div class="flex flex-wrap items-center gap-2">
                  <Tag :color="inspectionResultColor(currentRequest)">
                    {{ currentRequest.linkedIssueNo || '已生成不合格项' }}
                  </Tag>
                  <Tag
                    :color="issueStatusColor(currentRequest.linkedIssueStatus)"
                  >
                    {{ issueStatusLabel(currentRequest.linkedIssueStatus) }}
                  </Tag>
                </div>
              </div>
              <div>
                <div class="mb-1 text-xs text-gray-500">自检记录</div>
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
                    class="break-all"
                  >
                    {{ file.name }}
                  </a>
                </div>
                <span v-else class="text-gray-400">-</span>
              </div>
              <div>
                <div class="mb-1 text-xs text-gray-500">检验记录</div>
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
                    class="break-all"
                  >
                    {{ file.name }}
                  </a>
                </div>
                <span v-else class="text-gray-400">-</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-100 bg-white p-3 sm:p-4">
          <Button
            type="primary"
            class="w-full sm:w-auto"
            size="large"
            :disabled="currentRequest.status === 'CLOSED'"
            @click="openCloseFromDispatchDetail"
          >
            <template #icon>
              <IconifyIcon icon="lucide:check-circle" />
            </template>
            完成检验
          </Button>
        </div>
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
        <div
          class="w-full rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700"
        >
          <div class="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2 gap-y-1">
            <span class="text-gray-500">报检人</span>
            <span class="break-words font-medium text-gray-900">
              {{ currentRequest.reporter || '-' }}
            </span>
            <span class="text-gray-500">报检部件</span>
            <span class="break-words font-medium text-gray-900">
              {{ currentRequest.partName }}
              <template v-if="currentRequest.componentName">
                / {{ currentRequest.componentName }}
              </template>
            </span>
            <span class="text-gray-500">工序</span>
            <span class="break-words font-medium text-gray-900">
              {{ currentRequest.processName || '-' }}
            </span>
          </div>
        </div>
        <div class="text-center text-xs text-gray-500">
          检验员扫码后会打开派单详情，可在详情中完成检验
        </div>
      </div>
    </Modal>

    <Drawer v-model:open="inspectorStatusOpen" title="检验员状态" width="420">
      <div v-if="sortedInspectorStatus.length > 0" class="space-y-2">
        <div
          v-for="item in sortedInspectorStatus"
          :key="item.inspector"
          class="rounded border bg-white px-3 py-2"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="truncate font-medium text-gray-900">
                {{ item.inspector || '未记录' }}
              </div>
              <div class="mt-0.5 text-xs text-gray-500">
                当前 {{ item.activeTaskCount }} 项 · 已用
                {{ minutesText(item.currentTaskMinutes) }}
              </div>
            </div>
            <Tag :color="item.status === 'BUSY' ? 'processing' : 'success'">
              {{ item.status === 'BUSY' ? '有任务' : '空闲' }}
            </Tag>
          </div>
          <div
            class="mt-2 grid grid-cols-2 gap-2 rounded bg-gray-50 px-2 py-2 text-xs text-gray-500"
          >
            <div>
              <div class="text-gray-400">完成数量</div>
              <div class="mt-0.5 font-medium text-gray-800">
                {{ item.completedTaskCount }}
              </div>
            </div>
            <div>
              <div class="text-gray-400">平均时长</div>
              <div class="mt-0.5 font-medium text-gray-800">
                {{ minutesText(item.averageTaskMinutes) }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="py-10 text-center text-sm text-gray-400">
        暂无检验员状态数据
      </div>
    </Drawer>

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
                :disabled="
                  Boolean(
                    currentRequest?.componentName || currentRequest?.partName,
                  )
                "
                placeholder="自动沿用组件名称，可手动补充"
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
              <TreeSelect
                v-model:value="linkedIssueDraft.responsibleDepartment"
                :tree-data="deptTreeData"
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
