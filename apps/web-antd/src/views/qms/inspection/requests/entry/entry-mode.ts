import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import type { LocationQuery, LocationQueryRaw } from 'vue-router';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';

export const INCOMING_INSPECTION_PROCESS_NAME = '进货检验';

export const inspectionRequestEntryCheckResultOptions = [
  { label: '合格', value: 'PASS' },
  { label: '不合格', value: 'FAIL' },
  { label: '不适用', value: 'NA' },
];

export const inspectionRequestResponsibilityTypeOptions: Array<{
  label: string;
  value: InspectionIssueResponsibilityType;
}> = [
  {
    label: '内部部门',
    value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
  },
  {
    label: '供应商',
    value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
  },
  {
    label: '外协单位',
    value: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
  },
];

export function getInspectionRequestResponsibilityTypeOptions(
  isIncoming: boolean,
) {
  return isIncoming
    ? inspectionRequestResponsibilityTypeOptions.filter(
        (option) =>
          option.value !==
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
      )
    : inspectionRequestResponsibilityTypeOptions.filter(
        (option) =>
          option.value !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
      );
}

export function buildInspectionRequestEntryResponsibilityPayload(input: {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
}) {
  if (
    input.responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER ||
    input.responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  ) {
    const supplierId = input.supplierId.trim();
    return supplierId
      ? {
          responsibilityType: input.responsibilityType,
          supplierId,
        }
      : null;
  }
  const responsibleDepartmentId = input.responsibleDepartmentId.trim();
  if (!responsibleDepartmentId) return null;
  if (
    input.responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    return {
      responsibilityType: input.responsibilityType,
      responsibleDepartmentId,
    };
  }
  return null;
}

type WorkOrderOptionSource = {
  division?: null | string;
  multiStationEnabled?: boolean;
  projectName?: null | string;
  quantity?: null | number;
  workOrderNumber: string;
};

type BomPartOptionSource = {
  partId?: null | string;
  partName: string;
  partNumber?: null | string;
};

export function isIncomingInspectionEntryPath(path: string) {
  return path.includes('/incoming-entry');
}

export function buildInspectionRequestPostSubmitQuery(
  query: LocationQuery,
): LocationQueryRaw {
  const nextQuery: LocationQueryRaw = { ...query };
  delete nextQuery.componentName;
  delete nextQuery.partId;
  delete nextQuery.partName;
  delete nextQuery.processId;
  delete nextQuery.processName;
  delete nextQuery.reporter;
  delete nextQuery.team;
  return nextQuery;
}

export function mapInspectionRequestEntryWorkOrderOptions(
  items: WorkOrderOptionSource[],
) {
  return items.map((item) => ({
    division: item.division || null,
    label: item.projectName
      ? `${item.workOrderNumber} - ${item.projectName}`
      : item.workOrderNumber,
    multiStationEnabled: item.multiStationEnabled === true,
    quantity: item.quantity || 0,
    value: item.workOrderNumber,
  }));
}

export function mapInspectionRequestEntryBomPartOptions(
  items: BomPartOptionSource[],
) {
  const parts = new Map<string, BomPartOptionSource>();
  for (const item of items || []) {
    const partId = String(item.partId || '').trim();
    const partName = String(item.partName || '').trim();
    if (partId && partName) parts.set(partId, item);
  }
  return [...parts].map(([partId, item]) => ({
    label: item.partNumber
      ? `${item.partName} (${item.partNumber})`
      : item.partName,
    partName: item.partName,
    value: partId,
  }));
}

export function buildInspectionRequestEntryProcessOptions(
  workOrderProcesses: Array<{
    category: 'INCOMING' | 'PROCESS';
    processId: string;
    processName: string;
    supplierSource?: null | string;
  }>,
  category: 'INCOMING' | 'PROCESS',
) {
  const map = new Map<
    string,
    {
      label: string;
      processName: string;
      supplierSource: null | string;
      value: string;
    }
  >();
  for (const item of workOrderProcesses) {
    if (item.category !== category) continue;
    const processId = String(item.processId || '').trim();
    const processName = String(item.processName || '').trim();
    if (!processId || !processName) continue;
    map.set(processId, {
      label: processName,
      processName,
      supplierSource: item.supplierSource || null,
      value: processId,
    });
  }
  return [...map.values()];
}

export function getInspectionRequestEntryCopy(isIncoming: boolean) {
  return isIncoming
    ? {
        attachmentLabel: '来料资料',
        attachmentRequiredMessage: '来料资料不能为空',
        attachmentUploadName: '来料资料',
        componentLabel: '组件名称',
        partLabel: '物料名称',
        partPlaceholder: '请选择BOM物料',
        processLabel: '检验类型',
        shellTitle: '进货检验扫码报检',
        submitSuccessPrefix: '进货检验任务已提交',
      }
    : {
        attachmentLabel: '自检记录',
        attachmentRequiredMessage: '自检记录不能为空',
        attachmentUploadName: '自检记录',
        componentLabel: '组件名称',
        partLabel: '一级部件名称',
        partPlaceholder: '请选择BOM一级部件',
        processLabel: '工序',
        shellTitle: '扫码报检',
        submitSuccessPrefix: '报检任务已提交',
      };
}

export function getInspectionRequestResponsibilityUnitCopy(
  responsibilityType: InspectionIssueResponsibilityType,
) {
  if (
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  ) {
    return {
      label: '外协单位',
      placeholder: '请选择或搜索外协单位',
    };
  }
  return {
    label: '供应商',
    placeholder: '请选择或搜索供应商',
  };
}

export function buildInspectionRequestEntryRequiredMessage(
  copy: ReturnType<typeof getInspectionRequestEntryCopy>,
  requiresComponentName: boolean,
  isIncoming: boolean,
  requiresStationSelection = false,
  responsibilityType: InspectionIssueResponsibilityType = INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
) {
  const componentText = requiresComponentName ? `${copy.componentLabel}、` : '';
  const incomingTypeText = isIncoming ? '进货类型、' : '';
  const stationText = requiresStationSelection ? '台数、' : '';
  const responsibilityText =
    getInspectionRequestResponsibilityRequiredText(responsibilityType);
  return `工单号、${copy.processLabel}、${incomingTypeText}${copy.partLabel}、${componentText}数量、${stationText}${responsibilityText}报检人、${copy.attachmentRequiredMessage}`;
}

function getInspectionRequestResponsibilityRequiredText(
  responsibilityType: InspectionIssueResponsibilityType,
) {
  if (
    responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    return '责任归属类型、责任部门、';
  }
  return `责任归属类型、${getInspectionRequestResponsibilityUnitCopy(responsibilityType).label}、`;
}

export function buildIncomingInspectionRequestInfo(input: {
  incomingType: string;
  notes: string;
}) {
  return JSON.stringify({
    incomingType: input.incomingType,
    notes: input.notes,
  });
}
