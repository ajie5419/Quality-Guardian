import type {
  InspectionIssueResponsibilityType,
  InspectionRequestAttachment,
  InspectionRequestCheckResult,
} from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';

import type { ComputedRef, Ref } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';

import { INCOMING_INSPECTION_PROCESS_NAME } from './entry-mode';

type RequestForm = {
  attachments: InspectionRequestAttachment[];
  componentName: string;
  incomingType: string;
  mutualCheckResult: InspectionRequestCheckResult;
  partId: string;
  partName: string;
  processId: string;
  processName: string;
  quantity: number;
  reporter: string;
  requestedPartName: string;
  requestInfo: string;
  requestNewPart: boolean;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  selfCheckResult: InspectionRequestCheckResult;
  stationSelection: null | { indexes: number[]; mode: 'ALL' | 'PARTIAL' };
  supplierId: string;
  team: string;
  teamId: string;
  workOrderNumber: string;
  workOrderNumbers: string[];
};

export function useInspectionRequestEntryFormState(options: {
  attachmentFileList: Ref<UploadFile[]>;
  clearResponsibilityIdentity: () => void;
  incomingMaterialFreeInputEnabled: Ref<boolean>;
  isIncomingEntry: ComputedRef<boolean>;
  requestForm: RequestForm;
  route: RouteLocationNormalizedLoaded;
}) {
  const {
    attachmentFileList,
    clearResponsibilityIdentity,
    incomingMaterialFreeInputEnabled,
    isIncomingEntry,
    requestForm,
    route,
  } = options;

  function applyRoutePrefill() {
    const workOrderNumber = String(route.query.workOrderNumber || '');
    requestForm.workOrderNumber = workOrderNumber;
    requestForm.workOrderNumbers = workOrderNumber ? [workOrderNumber] : [];
    requestForm.partId = String(route.query.partId || '');
    requestForm.partName = String(route.query.partName || '');
    requestForm.processId = String(route.query.processId || '');
    requestForm.componentName = String(route.query.componentName || '');
    requestForm.processName = isIncomingEntry.value
      ? INCOMING_INSPECTION_PROCESS_NAME
      : String(route.query.processName || '');
    requestForm.reporter = String(route.query.reporter || '');
    requestForm.requestedPartName = '';
    requestForm.requestNewPart =
      isIncomingEntry.value && incomingMaterialFreeInputEnabled.value;
    requestForm.responsibilityType = isIncomingEntry.value
      ? INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
      : INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
    clearResponsibilityIdentity();
  }

  function resetRequestForm() {
    attachmentFileList.value = [];
    requestForm.attachments = [];
    requestForm.componentName = '';
    requestForm.incomingType = '';
    requestForm.partId = '';
    requestForm.partName = '';
    requestForm.processId = '';
    requestForm.processName = isIncomingEntry.value
      ? INCOMING_INSPECTION_PROCESS_NAME
      : '';
    requestForm.quantity = 1;
    requestForm.reporter = '';
    requestForm.requestedPartName = '';
    requestForm.requestNewPart =
      isIncomingEntry.value && incomingMaterialFreeInputEnabled.value;
    requestForm.requestInfo = '';
    requestForm.selfCheckResult = 'PASS';
    requestForm.mutualCheckResult = 'PASS';
    requestForm.stationSelection = null;
    clearResponsibilityIdentity();
    requestForm.workOrderNumber = '';
    requestForm.workOrderNumbers = [];
  }

  return { applyRoutePrefill, resetRequestForm };
}
