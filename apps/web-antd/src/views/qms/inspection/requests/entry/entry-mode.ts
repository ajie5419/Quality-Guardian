import { cloneInspectionProcessFallbackOptions } from '../../../shared/constants/inspection-process-fallback';
import { mapDictionaryOptionsToInspectionProcess } from '../../records/config';

export const INCOMING_INSPECTION_PROCESS_NAME = '进货检验';

export const inspectionRequestEntryCheckResultOptions = [
  { label: '合格', value: 'PASS' },
  { label: '不合格', value: 'FAIL' },
  { label: '不适用', value: 'NA' },
];

export const incomingInspectionTypeOptions = [
  { label: '原材料', value: '原材料' },
  { label: '外购件', value: '外购件' },
  { label: '辅材', value: '辅材' },
  { label: '机加成品件', value: '机加成品件' },
];

export const MACHINED_INCOMING_INSPECTION_TYPE = '机加成品件';

type WorkOrderOptionSource = {
  division?: null | string;
  multiStationEnabled?: boolean;
  projectName?: null | string;
  quantity?: null | number;
  workOrderNumber: string;
};

type TeamOptionSource = {
  group: 'external' | 'internal';
  label: string;
  value: string;
};

type BomPartOptionSource = {
  partName: string;
  partNumber?: null | string;
};

export function isIncomingInspectionEntryPath(path: string) {
  return path.includes('/incoming-entry');
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

export function mapInspectionRequestEntryTeamOptions(
  items: TeamOptionSource[],
) {
  const internalOptions = items
    .filter((item) => item.group === 'internal')
    .map((item) => ({ label: item.label, value: item.value }));
  const externalOptions = items
    .filter((item) => item.group === 'external')
    .map((item) => ({ label: item.label, value: item.value }));

  return [
    { label: '内部生产车间', options: internalOptions },
    { label: '外协加工单位', options: externalOptions },
  ].filter((group) => group.options.length > 0);
}

export function mapInspectionRequestEntryBomPartOptions(
  items: BomPartOptionSource[],
) {
  const parts = new Map<string, BomPartOptionSource>();
  for (const item of items || []) {
    const partName = String(item.partName || '').trim();
    if (partName) parts.set(partName, item);
  }
  return [...parts.values()].map((item) => ({
    label: item.partNumber
      ? `${item.partName} (${item.partNumber})`
      : item.partName,
    value: item.partName,
  }));
}

export function buildInspectionRequestEntryProcessOptions(
  dictionaryOptions: Array<{ label: string; value: string }>,
  workOrderOptions: Array<{ label: string; value: string }>,
) {
  const map = new Map<string, { label: string; value: string }>();
  for (const option of mapDictionaryOptionsToInspectionProcess(
    undefined,
    cloneInspectionProcessFallbackOptions(),
  )) {
    map.set(option.value, option);
  }
  for (const option of dictionaryOptions) map.set(option.value, option);
  for (const option of workOrderOptions) map.set(option.value, option);
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
        partPlaceholder: '请输入物料名称',
        processLabel: '检验类型',
        shellTitle: '进货检验扫码报检',
        submitSuccessPrefix: '进货检验任务已提交',
        teamLabel: '供应商/来料单位',
        teamPlaceholder: '请选择或搜索供应商/来料单位',
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
        teamLabel: '班组',
        teamPlaceholder: '请选择或搜索班组/外协单位',
      };
}

export function buildInspectionRequestEntryRequiredMessage(
  copy: ReturnType<typeof getInspectionRequestEntryCopy>,
  requiresComponentName: boolean,
  isIncoming: boolean,
  requiresStationSelection = false,
) {
  const componentText = requiresComponentName ? `${copy.componentLabel}、` : '';
  const incomingTypeText = isIncoming ? '进货类型、' : '';
  const stationText = requiresStationSelection ? '台数、' : '';
  return `工单号、${copy.processLabel}、${incomingTypeText}${copy.partLabel}、${componentText}数量、${stationText}${copy.teamLabel}、报检人、${copy.attachmentRequiredMessage}`;
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
