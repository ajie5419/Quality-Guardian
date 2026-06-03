import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import type { UploadFileWithResponse } from '../../issues/types';

import type {
  InspectionRequest,
  InspectionRequestAttachment,
} from '#/api/qms/inspection-request';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, reactive, ref, watch } from 'vue';

import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  closeInspectionRequest,
  deleteInspectionRequest,
  dispatchInspectionRequest,
} from '#/api/qms/inspection-request';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import { DEFAULT_VALUES } from '../../issues/constants';
import { INCOMING_INSPECTION_PROCESS_NAME } from '../constants';

type LinkedIssueDraftState = {
  claim: string;
  defectSubtype: string;
  defectType: string;
  description: string;
  lossAmount: number;
  partName: string;
  photos: UploadFileWithResponse[];
  processName: string;
  qualifiedQuantity: number;
  reportDate: string;
  reportedBy: string;
  responsibleDepartment: string;
  responsibleWelder: string;
  rootCause: string;
  severity: string;
  solution: string;
  status: string;
  supplierName: string;
  unqualifiedQuantity: number;
};

interface UseInspectionRequestTaskActionsOptions {
  canDelete: Ref<boolean>;
  canDispatch: Ref<boolean>;
  defectSubtypes: Ref<Record<string, Array<{ label: string; value: string }>>>;
  deptRawData: Ref<SystemDeptApi.Dept[]>;
  onAfterMutation: () => Promise<void>;
  buildRequestUrl: (params: Record<string, string>, path?: string) => string;
  getCurrentUserName: () => string;
  handleApiError: (error: unknown, action?: string) => void;
  makeQr: (url: string) => Promise<string>;
  query: { keyword: string };
  requests: Ref<InspectionRequest[]>;
  route: RouteLocationNormalizedLoaded;
  router: Router;
}

export function useInspectionRequestTaskActions(
  options: UseInspectionRequestTaskActionsOptions,
) {
  const {
    canDelete,
    canDispatch,
    defectSubtypes,
    deptRawData,
    onAfterMutation,
    buildRequestUrl,
    getCurrentUserName,
    handleApiError,
    makeQr,
    query,
    requests,
    route,
    router,
  } = options;

  const submitting = ref(false);
  const dispatchOpen = ref(false);
  const closeOpen = ref(false);
  const dispatchDetailOpen = ref(false);
  const closeQrOpen = ref(false);
  const currentRequest = ref<InspectionRequest>();
  const closeQr = ref('');
  const closeAttachmentFileList = ref<UploadFile[]>([]);
  const routeDispatchDetailConsumed = ref(false);
  const routeDispatchDetailOpened = ref(false);
  const routeDispatchRestoreKeyword = ref<null | string>(null);

  const dispatchForm = reactive({
    dispatchRemark: '',
    inspectorId: '',
    priority: 3,
  });

  const closeForm = reactive({
    attachments: [] as InspectionRequestAttachment[],
    closeRemark: '',
    hasDocuments: true,
    inspectionId: '',
    inspector: '',
    quantity: 1,
    result: 'PASS' as 'FAIL' | 'PASS',
  });

  const linkedIssueDraft = ref<LinkedIssueDraftState>({
    claim: DEFAULT_VALUES.DEFAULT_CLAIM,
    defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
    defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
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
    photos: [],
    unqualifiedQuantity: 0,
    responsibleDepartment: '',
    severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
  });

  const linkedDefectSubtypeOptions = computed(() => {
    const defectType = linkedIssueDraft.value.defectType;
    return defectSubtypes.value[defectType] || [];
  });

  const shouldCreateLinkedIssue = computed(() => closeForm.result === 'FAIL');
  const routeDispatchRequestId = computed(() =>
    String(
      route.query.dispatchRequestId || route.query.closeRequestId || '',
    ).trim(),
  );

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
    closeForm.attachments =
      normalizeUploadFileList<InspectionRequestAttachment>(
        closeAttachmentFileList.value,
        '检验记录',
      );
  }

  function openDispatch(record: InspectionRequest) {
    if (!canDispatch.value) {
      message.warning('无派单权限');
      return;
    }
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

  function restoreRouteDispatchKeyword() {
    if (routeDispatchRestoreKeyword.value === null) return;
    query.keyword = routeDispatchRestoreKeyword.value;
    routeDispatchRestoreKeyword.value = null;
  }

  function closeRouteDispatchDetail() {
    if (!routeDispatchDetailOpened.value) return;
    dispatchDetailOpen.value = false;
    currentRequest.value = undefined;
    routeDispatchDetailOpened.value = false;
    restoreRouteDispatchKeyword();
  }

  function openCloseFromDispatchDetail() {
    if (!currentRequest.value) return;
    openClose(currentRequest.value);
  }

  async function submitDispatch() {
    if (!canDispatch.value) {
      message.warning('无派单权限');
      return;
    }
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
      await onAfterMutation();
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
        await onAfterMutation();
      },
    });
  }

  function findDeptIdByName(
    departments: SystemDeptApi.Dept[],
    targetName: string,
  ): string {
    const normalizedTarget = targetName.trim();
    if (!normalizedTarget) return '';

    for (const dept of departments) {
      const name = String(dept.name || '').trim();
      if (name === normalizedTarget || name.includes(normalizedTarget)) {
        return String(dept.id);
      }
      const childId = findDeptIdByName(
        (dept.children || []) as SystemDeptApi.Dept[],
        normalizedTarget,
      );
      if (childId) return childId;
    }

    return '';
  }

  function defaultIssueResponsibleDepartment() {
    return findDeptIdByName(deptRawData.value, '生产 OBU') || '生产 OBU';
  }

  function isIncomingInspectionRequest(record: InspectionRequest) {
    return record.processName === INCOMING_INSPECTION_PROCESS_NAME;
  }

  function openClose(record: InspectionRequest) {
    currentRequest.value = record;
    closeAttachmentFileList.value = [];
    closeForm.attachments = [];
    closeForm.closeRemark = '';
    closeForm.hasDocuments = true;
    closeForm.inspectionId = record.inspectionId || '';
    closeForm.inspector = record.inspectorName || getCurrentUserName();
    closeForm.quantity = record.quantity || 1;
    closeForm.result = 'PASS';

    linkedIssueDraft.value = {
      claim: DEFAULT_VALUES.DEFAULT_CLAIM,
      defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
      defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
      description: '',
      lossAmount: 0,
      partName: record.componentName || record.partName || '',
      processName: record.processName || '',
      qualifiedQuantity: 0,
      reportDate: dayjs().format('YYYY-MM-DD'),
      reportedBy: record.inspectorName || getCurrentUserName() || '',
      responsibleWelder: '',
      rootCause: '',
      solution: '',
      status: 'OPEN',
      supplierName: isIncomingInspectionRequest(record)
        ? record.team || ''
        : '',
      photos: [] as UploadFileWithResponse[],
      unqualifiedQuantity: record.quantity || 1,
      responsibleDepartment: defaultIssueResponsibleDepartment(),
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
        hasDocuments: closeForm.hasDocuments,
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
      await onAfterMutation();
    } catch (error) {
      handleApiError(error, 'Close Inspection Request');
    } finally {
      submitting.value = false;
    }
  }

  function applyRouteDispatchDetail() {
    if (routeDispatchRequestId.value) {
      if (routeDispatchRestoreKeyword.value === null) {
        routeDispatchRestoreKeyword.value = query.keyword;
      }
      query.keyword = routeDispatchRequestId.value;
      routeDispatchDetailConsumed.value = false;
    }
  }

  function openDispatchDetailFromRoute() {
    if (
      !routeDispatchRequestId.value ||
      dispatchDetailOpen.value ||
      routeDispatchDetailConsumed.value
    ) {
      return;
    }
    const matched = requests.value.find(
      (item) => item.id === routeDispatchRequestId.value,
    );
    if (matched) {
      openDispatchDetail(matched);
      routeDispatchDetailConsumed.value = true;
      routeDispatchDetailOpened.value = true;
      restoreRouteDispatchKeyword();
      const nextQuery = { ...route.query };
      delete nextQuery.dispatchRequestId;
      delete nextQuery.closeRequestId;
      void router.replace({ query: nextQuery });
    }
  }

  function displayCloseReadonlyValue(value?: null | string) {
    return normalizeCloseText(value) || '系统自动创建';
  }

  watch(
    () => closeForm.quantity,
    () => {
      if (shouldCreateLinkedIssue.value) {
        syncLinkedIssueQuantities();
      }
    },
  );

  return {
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
  };
}
