<script lang="ts" setup>
import type { InspectionRequest } from '@qgs/shared';

import type { TreeSelectNode } from '#/types';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { useAccessStore, useUserStore } from '@vben/stores';

import { Card, message } from 'ant-design-vue';

import { getDeptList } from '#/api/system/dept';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useMobileViewport } from '#/hooks/useMobileViewport';
import { convertToTreeSelectData } from '#/types';
import QmsPageShell from '#/views/qms/shared/components/QmsPageShell.vue';

import { useClaimOptions, useSeverityOptions } from '../issues/constants';
import InspectionRequestEntryModal from './components/InspectionRequestEntryModal.vue';
import InspectionRequestFilterBar from './components/InspectionRequestFilterBar.vue';
import InspectionRequestInspectorStatus from './components/InspectionRequestInspectorStatus.vue';
import InspectionRequestListCard from './components/InspectionRequestListCard.vue';
import InspectionRequestPageHeader from './components/InspectionRequestPageHeader.vue';
import InspectionRequestStatsCards from './components/InspectionRequestStatsCards.vue';
import InspectionRequestWorkflows from './components/InspectionRequestWorkflows.vue';
import { useInspectionRequestEntryActions } from './composables/useInspectionRequestEntryActions';
import { useInspectionRequestInspectorOptions } from './composables/useInspectionRequestInspectorOptions';
import { useInspectionRequestInspectorTasks } from './composables/useInspectionRequestInspectorTasks';
import { useInspectionRequestListing } from './composables/useInspectionRequestListing';
import { useInspectionRequestPresentation } from './composables/useInspectionRequestPresentation';
import { useInspectionRequestTaskActions } from './composables/useInspectionRequestTaskActions';
import { INCOMING_INSPECTION_PROCESS_NAME } from './constants';
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
const inspectorStatusOpen = ref(false);

const canConfigQrBase = computed(() => hasAccessByRoles(['super', 'admin']));
const {
  buildRequestUrl,
  copyRequestEntryUrl,
  incomingRequestEntryQr,
  incomingRequestEntryUrl,
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
const deptTreeData = ref<TreeSelectNode[]>([]);

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
  loadInspectorActiveTasks,
  loadRequestStats,
  loadRequests,
  refreshInspectionRequestPage,
} = useInspectionRequestListing({
  onRequestsLoaded() {
    openDispatchDetailFromRoute();
  },
});

const {
  inspectorStatusTaskLoading,
  inspectorStatusTasks,
  loadInspectorStatusTasks,
} = useInspectionRequestInspectorTasks({
  handleApiError,
  loadInspectorActiveTasks,
  warn: message.warning,
});

const canUseRequestAction = (action: 'Delete' | 'Dispatch') =>
  hasAccessByCodes([`QMS:Inspection:Requests:${action}`]);
const canDelete = computed(() => canUseRequestAction('Delete'));
const canDispatch = computed(() => canUseRequestAction('Dispatch'));
const canApproveMaterial = computed(
  () =>
    hasAccessByCodes(['QMS:Inspection:MaterialRequests:Approve']) ||
    hasAccessByRoles(['super', 'admin']),
);
const { loadInspectorOptions, userOptions } =
  useInspectionRequestInspectorOptions();

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
  canShowDispatchAction,
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
  isDispatchable: isNormallyDispatchable,
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

function isDispatchable(record: InspectionRequest) {
  return (
    isNormallyDispatchable(record) ||
    (canApproveMaterial.value &&
      record.status === 'SUBMITTED' &&
      record.dispatchBlockedReason === 'MATERIAL_APPROVAL_PENDING' &&
      Boolean(record.materialRequestId))
  );
}

const listCardProps = computed(() => ({
  canDelete: canDelete.value,
  canDispatch: canDispatch.value,
  canShowDispatchAction,
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
  linkedIssueDraft,
  submitting,
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
  handleMaterialApproved,
} = useInspectionRequestTaskActions({
  canApproveMaterial,
  canDelete,
  canDispatch,
  deptTreeData,
  async onAfterMutation() {
    await Promise.all([loadRequests(), loadRequestStats()]);
  },
  buildRequestUrl,
  getCurrentUserName: currentUserName,
  handleApiError,
  makeQr,
  query,
  route,
  router,
});

async function loadDeptData() {
  const data = await getDeptList();
  deptTreeData.value = convertToTreeSelectData(data);
}

function openInspectionRecord(record: InspectionRequest) {
  if (!record.inspectionId) return;
  void router.push({
    path: '/qms/inspection/records',
    query: {
      sourceInspectionId: record.inspectionId,
      type:
        record.processName === INCOMING_INSPECTION_PROCESS_NAME
          ? 'incoming'
          : 'process',
    },
  });
}

async function copyIncomingRequestEntryUrl() {
  await navigator.clipboard.writeText(incomingRequestEntryUrl.value);
  message.success('进货检验入口链接已复制');
}

function openIncomingPublicEntryPage() {
  window.open(incomingRequestEntryUrl.value, '_blank', 'noopener,noreferrer');
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
  await loadRequestEntryConfig();
  await Promise.all([
    loadDeptData(),
    loadInspectorOptions(),
    loadRequests(),
    loadRequestStats(),
  ]);
  await openDispatchDetailFromRoute();
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
    await openDispatchDetailFromRoute();
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
      :incoming-qr-code="incomingRequestEntryQr"
      :incoming-url="incomingRequestEntryUrl"
      :can-config="canConfigQrBase"
      :saving="qrBaseSaving"
      @copy="copyRequestEntryUrl"
      @copy-incoming="copyIncomingRequestEntryUrl"
      @open-page="openPublicEntryPage"
      @open-incoming-page="openIncomingPublicEntryPage"
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
      :dept-tree-data="deptTreeData"
      :detail-drawer-props="detailDrawerProps"
      :dispatch-detail-open="dispatchDetailOpen"
      :dispatch-form="dispatchForm"
      :dispatch-open="dispatchOpen"
      :display-close-readonly-value="displayCloseReadonlyValue"
      :handle-close-attachment-upload-change="handleCloseAttachmentUploadChange"
      :inspector-status-items="sortedInspectorStatus"
      :inspector-status-open="inspectorStatusOpen"
      :inspector-status-task-loading="inspectorStatusTaskLoading"
      :inspector-status-tasks="inspectorStatusTasks"
      :linked-issue-draft="linkedIssueDraft"
      :minutes-text="minutesText"
      :severity-options="severityOptions"
      :submitting="submitting"
      :upload-headers="uploadHeaders"
      :user-options="userOptions"
      @load-inspector-status-tasks="loadInspectorStatusTasks"
      @open-close="openCloseFromDispatchDetail"
      @open-inspection-record="openInspectionRecord"
      @submit-close="submitClose"
      @submit-dispatch="submitDispatch"
      @material-approved="handleMaterialApproved"
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
