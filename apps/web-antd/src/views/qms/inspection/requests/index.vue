<script lang="ts" setup>
import type { InspectionRequest } from '#/api/qms/inspection-request';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemUserApi } from '#/api/system/user';
import type { TreeSelectNode } from '#/types';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useAccessStore, useUserStore } from '@vben/stores';

import { Card } from 'ant-design-vue';

import { getDeptList } from '#/api/system/dept';
import { getUserList } from '#/api/system/user';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { convertToTreeSelectData } from '#/types';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import {
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
} from '../issues/constants';
import InspectionRequestEntryModal from './components/InspectionRequestEntryModal.vue';
import InspectionRequestFilterBar from './components/InspectionRequestFilterBar.vue';
import InspectionRequestInspectorStatus from './components/InspectionRequestInspectorStatus.vue';
import InspectionRequestListCard from './components/InspectionRequestListCard.vue';
import InspectionRequestPageHeader from './components/InspectionRequestPageHeader.vue';
import InspectionRequestStatsCards from './components/InspectionRequestStatsCards.vue';
import InspectionRequestWorkflows from './components/InspectionRequestWorkflows.vue';
import { useInspectionRequestEntryActions } from './composables/useInspectionRequestEntryActions';
import { useInspectionRequestListing } from './composables/useInspectionRequestListing';
import { useInspectionRequestPresentation } from './composables/useInspectionRequestPresentation';
import { useInspectionRequestTaskActions } from './composables/useInspectionRequestTaskActions';
import {
  inspectionRequestCheckResultOptions,
  inspectionRequestViewOptions,
} from './inspection-request-options';

const route = useRoute();
const router = useRouter();
const accessStore = useAccessStore();
const userStore = useUserStore();
const { hasAccessByCodes, hasAccessByRoles } = useAccess();
const { handleApiError } = useErrorHandler();
const { isMobile } = useMobileViewport();
const users = ref<SystemUserApi.User[]>([]);
const inspectorStatusOpen = ref(false);

const canConfigQrBase = computed(() => hasAccessByRoles(['super', 'admin']));
const {
  buildRequestUrl,
  copyRequestEntryUrl,
  loadRequestEntryConfig,
  makeQr,
  openPublicEntryPage,
  openRequestEntry,
  qrBaseInput,
  qrBaseSaving,
  requestEntryOpen,
  requestEntryQr,
  requestEntryUrl,
  saveQrBaseUrl,
} = useInspectionRequestEntryActions({ handleApiError });
const deptRawData = ref<SystemDeptApi.Dept[]>([]);
const deptTreeData = ref<TreeSelectNode[]>([]);

const { defectOptions, defectSubtypes } = useDefectOptions();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();

const {
  activeView,
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

const canDelete = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Requests:Delete']),
);
const canDispatch = computed(() =>
  hasAccessByCodes(['QMS:Inspection:Requests:Dispatch']),
);

const userOptions = computed(() =>
  users.value.map((user) => ({
    label: user.realName || user.username,
    value: user.id,
  })),
);

const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${accessStore.accessToken}`,
}));

const exceptionTaskCount = computed(
  () =>
    requests.value.filter(
      (item) => item.inspectionResult === 'FAIL' || Boolean(item.linkedIssueId),
    ).length,
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
  checkResultOptions: inspectionRequestCheckResultOptions,
  requestStats,
});

const listCardProps = computed(() => ({
  canDelete: canDelete.value,
  canDispatch: canDispatch.value,
  checkResultLabel,
  directClosedClass,
  displayDispatchTime,
  displayDispatcher,
  displayExecutionDuration,
  displayInspector,
  executionDurationLabel,
  formatDateTime,
  hasActionMenu,
  hasLinkedIssue,
  inspectionQuantityText,
  inspectionResultColor,
  inspectionResultLabel,
  isMobile: isMobile.value,
  isClosed,
  isCompletable,
  isDispatchable,
  loading: loading.value,
  missingValueClass,
  page: page.value,
  pageSize: pageSize.value,
  requests: requests.value,
  rowClassName,
  statusColor,
  statusLabel,
  total: total.value,
  waitDuration,
}));

const detailDrawerProps = computed(() => ({
  directClosedClass,
  displayDispatchTime,
  displayDispatcher,
  displayExecutionDuration,
  displayInspector,
  executionDurationLabel,
  formatDateTime,
  hasLinkedIssue,
  inspectionQuantityText,
  inspectionResultColor,
  inspectionResultLabel,
  issueStatusColor,
  issueStatusLabel,
  missingValueClass,
  request: currentRequest.value,
  statusColor,
  statusLabel,
  waitDuration,
}));

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

async function handleViewChange(value: number | string) {
  await handleListingViewChange(value, closeRouteDispatchDetail);
}

function handleActiveViewUpdate(value: string) {
  activeView.value = value;
}

function handleKeywordUpdate(value: string) {
  query.keyword = value;
}

function handleStatusUpdate(value?: InspectionRequest['status']) {
  query.status = value;
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
  canDispatch,
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
  applyRouteDispatchDetail();
  await loadRequestEntryConfig();
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
    applyRouteDispatchDetail();
    await loadRequests();
  },
);
</script>

<template>
  <Page content-class="p-0">
    <QmsPageShell content-class="bg-gray-50">
      <div class="space-y-4">
        <InspectionRequestPageHeader
          @open-entry="openRequestEntry"
          @refresh="refreshInspectionRequestPage"
        />

        <InspectionRequestStatsCards
          :stats="requestStats"
          :exception-task-count="exceptionTaskCount"
        />

        <Card>
          <InspectionRequestFilterBar
            :active-view="activeView"
            :is-mobile="isMobile"
            :keyword="query.keyword"
            :status="query.status"
            :status-options="statusOptions"
            :view-options="inspectionRequestViewOptions"
            @search="loadRequests"
            @status-change="handleStatusFilterChange"
            @update-active-view="handleActiveViewUpdate"
            @update-keyword="handleKeywordUpdate"
            @update-status="handleStatusUpdate"
            @view-change="handleViewChange"
          />
        </Card>

        <Card>
          <InspectionRequestInspectorStatus
            :busy-count="busyInspectorCount"
            :has-items="requestStats.inspectorStatus.length > 0"
            :idle-count="idleInspectorCount"
            :items="visibleInspectorStatus"
            :minutes-text="minutesText"
            @open-all="inspectorStatusOpen = true"
          />
        </Card>

        <InspectionRequestListCard
          v-bind="listCardProps"
          @page-change="handleTablePageChange"
          @detail="openDispatchDetail"
          @dispatch="openDispatch"
          @close="openClose"
          @record="openInspectionRecord"
          @qr="handleTableActionQr"
          @delete="handleTableActionDelete"
        />
      </div>
    </QmsPageShell>

    <InspectionRequestEntryModal
      v-model:open="requestEntryOpen"
      v-model:base-url="qrBaseInput"
      :qr-code="requestEntryQr"
      :url="requestEntryUrl"
      :can-config="canConfigQrBase"
      :saving="qrBaseSaving"
      @copy="copyRequestEntryUrl"
      @open-page="openPublicEntryPage"
      @save-base-url="saveQrBaseUrl"
    />

    <InspectionRequestWorkflows
      :claim-options="claimOptions"
      :close-attachment-file-list="closeAttachmentFileList"
      :close-form="closeForm"
      :close-open="closeOpen"
      :close-qr="closeQr"
      :close-qr-open="closeQrOpen"
      :current-request="currentRequest"
      :defect-options="defectOptions"
      :dept-tree-data="deptTreeData"
      :detail-drawer-props="detailDrawerProps"
      :dispatch-detail-open="dispatchDetailOpen"
      :dispatch-form="dispatchForm"
      :dispatch-open="dispatchOpen"
      :display-close-readonly-value="displayCloseReadonlyValue"
      :handle-close-attachment-upload-change="handleCloseAttachmentUploadChange"
      :inspector-status-items="sortedInspectorStatus"
      :inspector-status-open="inspectorStatusOpen"
      :linked-defect-subtype-options="linkedDefectSubtypeOptions"
      :linked-issue-draft="linkedIssueDraft"
      :minutes-text="minutesText"
      :severity-options="severityOptions"
      :submitting="submitting"
      :upload-headers="uploadHeaders"
      :user-options="userOptions"
      @open-close="openCloseFromDispatchDetail"
      @open-inspection-record="openInspectionRecord"
      @submit-close="submitClose"
      @submit-dispatch="submitDispatch"
      @update-close-form="handleCloseFormUpdate"
      @update-close-open="(value) => (closeOpen = value)"
      @update-close-qr-open="(value) => (closeQrOpen = value)"
      @update-dispatch-detail-open="(value) => (dispatchDetailOpen = value)"
      @update-dispatch-form="handleDispatchFormUpdate"
      @update-dispatch-open="(value) => (dispatchOpen = value)"
      @update-inspector-status-open="(value) => (inspectorStatusOpen = value)"
      @update-linked-issue-draft="handleLinkedIssueDraftUpdate"
    />
  </Page>
</template>
