<script lang="ts" setup>
import type { InspectionRequest } from '#/api/qms/inspection-request';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemUserApi } from '#/api/system/user';
import type { TreeSelectNode } from '#/types';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccessStore, useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Tag,
  Upload,
} from 'ant-design-vue';
import QRCode from 'qrcode';

import { getDeptList } from '#/api/system/dept';
import { getUserList } from '#/api/system/user';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { convertToTreeSelectData } from '#/types';
import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';

import {
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
} from '../issues/constants';
import TeamSelect from '../records/components/form/TeamSelect.vue';
import CloseInspectionModal from './components/CloseInspectionModal.vue';
import CloseQrModal from './components/CloseQrModal.vue';
import DispatchDetailDrawer from './components/DispatchDetailDrawer.vue';
import DispatchTaskModal from './components/DispatchTaskModal.vue';
import InspectionRequestTable from './components/InspectionRequestTable.vue';
import InspectorStatusDrawer from './components/InspectorStatusDrawer.vue';
import { useInspectionRequestEntryForm } from './composables/useInspectionRequestEntryForm';
import { useInspectionRequestListing } from './composables/useInspectionRequestListing';
import { useInspectionRequestPresentation } from './composables/useInspectionRequestPresentation';
import { useInspectionRequestTaskActions } from './composables/useInspectionRequestTaskActions';

defineOptions({ name: 'QMSInspectionRequests' });

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const userStore = useUserStore();
const { hasAccessByCodes } = useAccess();
const { handleApiError } = useErrorHandler();
const users = ref<SystemUserApi.User[]>([]);
const inspectorStatusOpen = ref(false);
const requestEntryQr = ref('');
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);

const { defectOptions, defectSubtypes } = useDefectOptions();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();

const {
  activeView,
  isEntryView,
  loading,
  page,
  pageSize,
  query,
  requestStats,
  requests,
  total,
  handleStatusFilterChange,
  handleViewChange: handleListingViewChange,
  loadRequestStats,
  loadRequests,
  refreshInspectionRequestPage,
} = useInspectionRequestListing({
  onRequestsLoaded() {
    openDispatchDetailFromRoute();
  },
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

function handleTableActionDelete(record: InspectionRequest) {
  confirmDelete(record);
}

function handleTableActionQr(record: InspectionRequest) {
  void openCloseQr(record);
}

function handleTablePageChange(nextPage: number, nextPageSize: number) {
  page.value = nextPage;
  pageSize.value = nextPageSize;
  void loadRequests();
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

async function handleViewChange(value: number | string) {
  await handleListingViewChange(value, closeRouteDispatchDetail);
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

function handleCloseFormUpdate(nextValue: typeof closeForm) {
  Object.assign(closeForm, nextValue);
}

function handleLinkedIssueDraftUpdate(
  nextValue: typeof linkedIssueDraft.value,
) {
  linkedIssueDraft.value = {
    ...nextValue,
    photos: [...nextValue.photos],
  };
}

function handleDispatchFormUpdate(nextValue: typeof dispatchForm) {
  Object.assign(dispatchForm, nextValue);
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

        <InspectionRequestTable
          v-else
          :requests="requests"
          :loading="loading"
          :page="page"
          :page-size="pageSize"
          :total="total"
          :can-delete="canDelete"
          :row-class-name="rowClassName"
          :status-color="statusColor"
          :status-label="statusLabel"
          :inspection-result-color="inspectionResultColor"
          :inspection-result-label="inspectionResultLabel"
          :inspection-quantity-text="inspectionQuantityText"
          :has-linked-issue="hasLinkedIssue"
          :missing-value-class="missingValueClass"
          :display-inspector="displayInspector"
          :display-dispatcher="displayDispatcher"
          :wait-duration="waitDuration"
          :execution-duration-label="executionDurationLabel"
          :direct-closed-class="directClosedClass"
          :display-execution-duration="displayExecutionDuration"
          :display-dispatch-time="displayDispatchTime"
          :format-date-time="formatDateTime"
          :check-result-label="checkResultLabel"
          :is-dispatchable="isDispatchable"
          :is-completable="isCompletable"
          :is-closed="isClosed"
          :has-action-menu="hasActionMenu"
          @page-change="handleTablePageChange"
          @detail="openDispatchDetail"
          @dispatch="openDispatch"
          @close="openClose"
          @record="openInspectionRecord"
          @qr="handleTableActionQr"
          @delete="handleTableActionDelete"
        />
      </Card>
    </div>

    <DispatchTaskModal
      :open="dispatchOpen"
      :submitting="submitting"
      :user-options="userOptions"
      :form="dispatchForm"
      @update:open="(value) => (dispatchOpen = value)"
      @update:form="handleDispatchFormUpdate"
      @submit="submitDispatch"
    />

    <DispatchDetailDrawer
      :open="dispatchDetailOpen"
      :request="currentRequest"
      :status-color="statusColor"
      :status-label="statusLabel"
      :inspection-result-color="inspectionResultColor"
      :inspection-result-label="inspectionResultLabel"
      :inspection-quantity-text="inspectionQuantityText"
      :wait-duration="waitDuration"
      :execution-duration-label="executionDurationLabel"
      :display-execution-duration="displayExecutionDuration"
      :format-date-time="formatDateTime"
      :missing-value-class="missingValueClass"
      :display-dispatcher="displayDispatcher"
      :display-inspector="displayInspector"
      :direct-closed-class="directClosedClass"
      :display-dispatch-time="displayDispatchTime"
      :has-linked-issue="hasLinkedIssue"
      :issue-status-color="issueStatusColor"
      :issue-status-label="issueStatusLabel"
      @update:open="(value) => (dispatchDetailOpen = value)"
      @open-close="openCloseFromDispatchDetail"
      @open-inspection-record="openInspectionRecord"
    />

    <CloseQrModal
      :open="closeQrOpen"
      :qr-code="closeQr"
      :request="currentRequest"
      @update:open="(value) => (closeQrOpen = value)"
    />

    <InspectorStatusDrawer
      :open="inspectorStatusOpen"
      :items="sortedInspectorStatus"
      :minutes-text="minutesText"
      @update:open="(value) => (inspectorStatusOpen = value)"
    />

    <CloseInspectionModal
      :open="closeOpen"
      :submitting="submitting"
      :close-form="closeForm"
      :linked-issue-draft="linkedIssueDraft"
      :close-attachment-file-list="closeAttachmentFileList"
      :upload-headers="uploadHeaders"
      :current-request="currentRequest"
      :dept-tree-data="deptTreeData"
      :defect-options="defectOptions"
      :linked-defect-subtype-options="linkedDefectSubtypeOptions"
      :severity-options="severityOptions"
      :claim-options="claimOptions"
      :display-close-readonly-value="displayCloseReadonlyValue"
      :handle-close-attachment-upload-change="handleCloseAttachmentUploadChange"
      @update:open="(value) => (closeOpen = value)"
      @update:close-form="handleCloseFormUpdate"
      @update:linked-issue-draft="handleLinkedIssueDraftUpdate"
      @submit="submitClose"
    />
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
