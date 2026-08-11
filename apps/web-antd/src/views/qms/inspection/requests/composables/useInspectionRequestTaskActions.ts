import type {
  InspectionIssueResponsibilityType,
  InspectionRequest,
  InspectionRequestAttachment,
} from '@qgs/shared';
import type { UploadChangeParam, UploadFile } from 'ant-design-vue';

import type { Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import type { UploadFileWithResponse } from '../../issues/types';

import type { TreeSelectNode } from '#/types';

import { computed, reactive, ref, watch } from 'vue';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';
import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  closeInspectionRequest,
  deleteInspectionRequest,
  dispatchInspectionRequest,
  getInspectionRequest,
} from '#/api/qms/inspection-request';
import {
  applyUploadResponse,
  normalizeUploadFileList,
} from '#/views/qms/shared/utils/upload-file';

import {
  buildInspectionIssuePayload,
  isExternalInspectionIssueResponsibility,
} from '../../issues/components/issueFormPayload';
import { DEFAULT_VALUES } from '../../issues/constants';
import { normalizeIssuePhotoUrls } from '../../issues/utils/photo-upload';
import { resolveTreeDepartmentIdentity } from '../inspection-request-responsibility';

type LinkedIssueDraftState = {
  claim: string;
  defectCategoryId: string;
  defectSubcategoryId: string;
  description: string;
  division: string;
  divisionId: string;
  lossAmount: number;
  ncNumber: string;
  partName: string;
  photos: UploadFileWithResponse[];
  processName: string;
  qualifiedQuantity: number;
  reportDate: string;
  reportedBy: string;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartment: string;
  responsibleDepartmentId: string;
  responsibleWelder: string;
  rootCause: string;
  severity: string;
  solution: string;
  status: string;
  supplierId: string;
  supplierName: string;
  unqualifiedQuantity: number;
};

type CompleteIssueResponsibility = Omit<
  NonNullable<InspectionRequest['issueResponsibility']>,
  'responsibleDepartmentId'
> & {
  responsibleDepartmentId: string;
};

type DivisionIdentitySource = {
  division?: null | string;
  divisionId?: null | string;
};

export function resolveDivisionIdentity(
  nodes: TreeSelectNode[],
  source: DivisionIdentitySource,
): { division: string; divisionId: string } {
  const identity = resolveTreeDepartmentIdentity(nodes, {
    department: source.division,
    departmentId: source.divisionId,
  });
  return {
    division: identity.name,
    divisionId: identity.id,
  };
}

interface UseInspectionRequestTaskActionsOptions {
  canDelete: Ref<boolean>;
  canDispatch: Ref<boolean>;
  canApproveMaterial: Ref<boolean>;
  deptTreeData: Ref<TreeSelectNode[]>;
  onAfterMutation: () => Promise<void>;
  buildRequestUrl: (params: Record<string, string>, path?: string) => string;
  getCurrentUserName: () => string;
  handleApiError: (error: unknown, action?: string) => void;
  makeQr: (url: string) => Promise<string>;
  query: { keyword: string };
  route: RouteLocationNormalizedLoaded;
  router: Router;
}

export function useInspectionRequestTaskActions(
  options: UseInspectionRequestTaskActionsOptions,
) {
  const {
    canDelete,
    canDispatch,
    canApproveMaterial,
    onAfterMutation,
    buildRequestUrl,
    getCurrentUserName,
    handleApiError,
    makeQr,
    query,
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
    defectCategoryId: '',
    defectSubcategoryId: '',
    description: '',
    division: '',
    divisionId: '',
    lossAmount: 0,
    ncNumber: '',
    partName: '',
    processName: '',
    qualifiedQuantity: 1,
    reportDate: dayjs().format('YYYY-MM-DD'),
    reportedBy: '',
    responsibleWelder: '',
    responsibilityType:
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
    responsibleDepartmentId: '',
    rootCause: '',
    solution: '',
    status: 'OPEN',
    supplierId: '',
    supplierName: '',
    photos: [],
    unqualifiedQuantity: 0,
    responsibleDepartment: '',
    severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
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

    if (!shouldCreateLinkedIssue.value) {
      if (closeForm.attachments.length === 0) {
        message.warning('检验记录不能为空');
        return false;
      }

      if (hasBlockingCloseAttachmentState()) {
        message.warning('检验记录仍在上传或上传失败，请处理后再完成检验');
        return false;
      }

      return true;
    }

    syncLinkedIssueQuantities();

    const requiredFields = [
      [linkedIssueDraft.value.partName, '部件名称'],
      [linkedIssueDraft.value.processName, '工序'],
      [linkedIssueDraft.value.responsibleDepartment, '责任部门'],
      [linkedIssueDraft.value.responsibleDepartmentId, '责任部门'],
      [linkedIssueDraft.value.defectCategoryId, '缺陷分类'],
      [linkedIssueDraft.value.defectSubcategoryId, '二级分类'],
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

    if (
      isExternalInspectionIssueResponsibility(
        linkedIssueDraft.value.responsibilityType,
      ) &&
      !normalizeCloseText(linkedIssueDraft.value.supplierId)
    ) {
      message.warning('不合格项责任单位不能为空');
      return false;
    }

    if (normalizeIssuePhotoUrls(linkedIssueDraft.value.photos).length === 0) {
      message.warning('不合格项照片不能为空');
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
    if (
      record.dispatchBlockedReason &&
      !(
        record.dispatchBlockedReason === 'MATERIAL_APPROVAL_PENDING' &&
        canApproveMaterial.value
      )
    ) {
      message.warning('该报检任务当前不可派单');
      return;
    }
    currentRequest.value = record;
    dispatchForm.dispatchRemark = '';
    dispatchForm.inspectorId = record.inspectorId || '';
    dispatchForm.priority = record.priority || 3;
    dispatchOpen.value = true;
  }

  async function handleMaterialApproved(request: InspectionRequest) {
    currentRequest.value = request;
    await onAfterMutation();
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
    void openClose(currentRequest.value);
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
    if (currentRequest.value.dispatchBlockedReason) {
      message.warning('Dispatch is unavailable');
      return;
    }

    submitting.value = true;
    try {
      await dispatchInspectionRequest(currentRequest.value.id, {
        dispatchRemark: dispatchForm.dispatchRemark,
        inspectorId: dispatchForm.inspectorId,
        priority: dispatchForm.priority,
      });
      message.success(
        currentRequest.value.status === 'DISPATCHED'
          ? '报检任务已改派'
          : '报检任务已派单',
      );
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

  function hasCompleteIssueResponsibility(
    request: InspectionRequest,
  ): request is InspectionRequest & {
    issueResponsibility: CompleteIssueResponsibility;
  } {
    const responsibility = request.issueResponsibility;
    if (
      !responsibility ||
      !normalizeCloseText(responsibility.responsibleDepartmentId)
    ) {
      return false;
    }
    return (
      !isExternalInspectionIssueResponsibility(
        responsibility.responsibilityType,
      ) || !!normalizeCloseText(responsibility.supplierId)
    );
  }

  function hasEmptyIssueResponsibilityContext(request: InspectionRequest) {
    return ![
      request.responsibilityType,
      request.responsibleDepartment,
      request.responsibleDepartmentId,
    ].some((value) => normalizeCloseText(value));
  }

  async function resolveCloseRequest(
    record: InspectionRequest,
  ): Promise<InspectionRequest | null> {
    if (hasCompleteIssueResponsibility(record)) return record;
    try {
      const refreshed = await getInspectionRequest(record.id);
      if (refreshed && hasCompleteIssueResponsibility(refreshed)) {
        return refreshed;
      }
      if (refreshed && hasEmptyIssueResponsibilityContext(refreshed)) {
        return refreshed;
      }
      message.warning('报检任务责任上下文不完整，无法关闭');
    } catch (error: unknown) {
      handleApiError(error, 'Load Inspection Request Responsibility');
      message.warning('无法获取报检任务责任上下文，暂不能关闭');
    }
    return null;
  }

  async function openClose(record: InspectionRequest) {
    const request = await resolveCloseRequest(record);
    if (!request) return;
    const issueResponsibility = request.issueResponsibility;
    currentRequest.value = request;
    closeAttachmentFileList.value = [];
    closeForm.attachments = [];
    closeForm.closeRemark = '';
    closeForm.hasDocuments = true;
    closeForm.inspectionId = request.inspectionId || '';
    closeForm.inspector = request.inspectorName || getCurrentUserName();
    closeForm.quantity = request.quantity || 1;
    closeForm.result = 'PASS';

    linkedIssueDraft.value = {
      claim: DEFAULT_VALUES.DEFAULT_CLAIM,
      defectCategoryId: '',
      defectSubcategoryId: '',
      description: '',
      division: '',
      divisionId: '',
      lossAmount: 0,
      ncNumber: '',
      partName: request.componentName || request.partName || '',
      processName: request.processName || '',
      qualifiedQuantity: 0,
      reportDate: dayjs().format('YYYY-MM-DD'),
      reportedBy: request.inspectorName || getCurrentUserName() || '',
      responsibilityType:
        issueResponsibility?.responsibilityType ||
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
      responsibleDepartment: issueResponsibility?.responsibleDepartment || '',
      responsibleDepartmentId:
        issueResponsibility?.responsibleDepartmentId || '',
      responsibleWelder: '',
      rootCause: '',
      solution: '',
      status: 'OPEN',
      supplierId: issueResponsibility?.supplierId || '',
      supplierName: issueResponsibility?.supplierName || '',
      photos: [] as UploadFileWithResponse[],
      unqualifiedQuantity: request.quantity || 1,
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
        ? buildInspectionIssuePayload({
            ...linkedIssueDraft.value,
            photos: normalizeIssuePhotoUrls(linkedIssueDraft.value.photos),
            quantity: linkedIssueDraft.value.unqualifiedQuantity,
            responsibilityType: linkedIssueDraft.value.responsibilityType,
          })
        : undefined;

      await closeInspectionRequest(currentRequest.value.id, {
        attachments: shouldCreateLinkedIssue.value ? [] : closeForm.attachments,
        closeRemark: closeForm.closeRemark,
        hasDocuments: shouldCreateLinkedIssue.value
          ? false
          : closeForm.hasDocuments,
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
    // No-op: detail is now fetched directly by id from route query;
    // see openDispatchDetailFromRoute. Kept for compat with existing callers.
  }

  async function openDispatchDetailFromRoute() {
    if (
      !routeDispatchRequestId.value ||
      dispatchDetailOpen.value ||
      routeDispatchDetailConsumed.value
    ) {
      return;
    }
    routeDispatchDetailConsumed.value = true;
    try {
      const record = await getInspectionRequest(routeDispatchRequestId.value);
      if (!record) {
        message.warning('任务不存在或已被删除');
        return;
      }
      openDispatchDetail(record);
      routeDispatchDetailOpened.value = true;
    } catch (error) {
      handleApiError(error, 'Open Dispatch Detail From Route');
      message.warning('任务不存在或已被删除');
    } finally {
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
    handleMaterialApproved,
    syncLinkedIssueQuantities,
  };
}
