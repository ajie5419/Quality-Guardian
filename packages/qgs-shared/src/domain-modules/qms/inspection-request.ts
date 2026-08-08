export const INSPECTION_REQUEST_STATUS = {
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  DISPATCHED: 'DISPATCHED',
  INSPECTING: 'INSPECTING',
  SUBMITTED: 'SUBMITTED',
} as const;

export const INSPECTION_ISSUE_RESPONSIBILITY_TYPE = {
  INTERNAL_DEPARTMENT: 'INTERNAL_DEPARTMENT',
  OUTSOURCING_UNIT: 'OUTSOURCING_UNIT',
  SUPPLIER: 'SUPPLIER',
} as const;

export type InspectionIssueResponsibilityType =
  (typeof INSPECTION_ISSUE_RESPONSIBILITY_TYPE)[keyof typeof INSPECTION_ISSUE_RESPONSIBILITY_TYPE];

export const INCOMING_INSPECTION_PROCESS_NAME = '进货检验';
export const INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT = '采购部';
export const OUTSOURCING_INSPECTION_PROCESS_KEYWORD = '外协';
export const OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT = '生产 OBU';
export const WELDING_PROCESS_KEYWORD = '焊';
export const WELDING_DEFECT_CODE = 'WELDING_DEFECT';
const CHECK_RESULT_SET = new Set(['FAIL', 'NA', 'PASS']);
const REQUEST_STATUS_SET = new Set<string>(
  Object.values(INSPECTION_REQUEST_STATUS),
);
const STATION_SELECTION_MODE_SET = new Set(['ALL', 'PARTIAL']);

export function normalizeInspectionRequestText(value: unknown): string {
  return String(value ?? '').trim();
}

export function mergeInspectionProcessNames(
  ...groups: ReadonlyArray<ReadonlyArray<unknown>>
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      const processName = normalizeInspectionRequestText(value);
      if (!processName || seen.has(processName)) continue;
      seen.add(processName);
      result.push(processName);
    }
  }
  return result;
}

export function normalizeInspectionRequestCheckResult(
  value: unknown,
  fallback = 'PASS',
) {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return CHECK_RESULT_SET.has(normalized) ? normalized : fallback;
}

export function normalizeInspectionRequestStatus(value: unknown) {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return REQUEST_STATUS_SET.has(normalized) ? normalized : '';
}

export function isInspectionRequestAssemblyProcess(value: unknown) {
  return normalizeInspectionRequestText(value).includes('组装');
}

export function isIncomingInspectionRequestProcess(value: unknown) {
  return (
    normalizeInspectionRequestText(value) === INCOMING_INSPECTION_PROCESS_NAME
  );
}

export function isIncomingInspectionRequestCategory(input: {
  category?: unknown;
  processName?: unknown;
}) {
  const category = normalizeInspectionRequestText(input.category).toUpperCase();
  if (category) return category === 'INCOMING';
  return isIncomingInspectionRequestProcess(input.processName);
}

export function isOutsourcingInspectionRequestProcess(value: unknown) {
  return normalizeInspectionRequestText(value).includes(
    OUTSOURCING_INSPECTION_PROCESS_KEYWORD,
  );
}

export function resolveInspectionIssueResponsibilityTypeFromDepartment(
  value: unknown,
  fallback: InspectionIssueResponsibilityType = INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
): InspectionIssueResponsibilityType {
  const department = normalizeInspectionRequestText(value);
  if (department === INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT) {
    return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER;
  }
  if (department === OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT) {
    return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT;
  }
  return department
    ? INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
    : fallback;
}

export function resolveInspectionRequestIssueResponsibility(input: {
  category?: unknown;
  processName?: unknown;
  supplierId?: unknown;
  team?: unknown;
  teamSupplier?: null | { id: string; name: string };
}) {
  const category = normalizeInspectionRequestText(input.category);
  const processName = normalizeInspectionRequestText(input.processName);
  const team = normalizeInspectionRequestText(input.team);
  const supplierId = normalizeInspectionRequestText(input.supplierId) || null;

  if (isIncomingInspectionRequestCategory({ category, processName })) {
    return {
      responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
      responsibleDepartment: INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
      supplierId,
      supplierName: team,
    };
  }

  if (
    isOutsourcingInspectionRequestProcess(processName) ||
    input.teamSupplier
  ) {
    return {
      responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
      responsibleDepartment: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
      supplierId: input.teamSupplier?.id || supplierId,
      supplierName: input.teamSupplier?.name || team,
    };
  }

  return {
    responsibilityType:
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
    responsibleDepartment: team,
    supplierId: null,
    supplierName: '',
  };
}

export function normalizeInspectionIssueResponsibilityType(
  value: unknown,
): InspectionIssueResponsibilityType | null {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return (
    Object.values(INSPECTION_ISSUE_RESPONSIBILITY_TYPE).find(
      (item) => item === normalized,
    ) ?? null
  );
}

export function parseInspectionRequestPriority(value: unknown, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 5);
}

export function parseInspectionRequestQuantity(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
}

export type NormalizedInspectionStationSelection = {
  indexes: number[];
  mode: 'ALL' | 'PARTIAL';
};

export function normalizeInspectionStationSelection(
  value: unknown,
  quantity?: unknown,
): NormalizedInspectionStationSelection | null {
  const rawQuantity = Number(quantity);
  const totalQuantity = Number.isFinite(rawQuantity)
    ? Math.max(1, Math.trunc(rawQuantity))
    : null;
  if (!value) return null;

  let source: unknown = value;
  if (typeof value === 'string') {
    const raw = normalizeInspectionRequestText(value);
    if (!raw) return null;
    try {
      source = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== 'object') return null;

  const record = source as Record<string, unknown>;
  const mode = normalizeInspectionRequestText(record.mode).toUpperCase();
  if (!STATION_SELECTION_MODE_SET.has(mode)) return null;

  if (mode === 'ALL') {
    return { indexes: [], mode: 'ALL' };
  }

  const rawIndexes = Array.isArray(record.indexes) ? record.indexes : [];
  const indexes = [
    ...new Set(
      rawIndexes
        .map((item) => Math.trunc(Number(item)))
        .filter((item) => Number.isFinite(item) && item >= 1)
        .map((item) => (totalQuantity ? Math.min(item, totalQuantity) : item)),
    ),
  ].sort((a, b) => a - b);

  return indexes.length > 0 ? { indexes, mode: 'PARTIAL' } : null;
}

export function serializeInspectionStationSelection(
  value: unknown,
  quantity?: unknown,
): null | string {
  const normalized = normalizeInspectionStationSelection(value, quantity);
  return normalized ? JSON.stringify(normalized) : null;
}

export function formatInspectionStationSelection(value: unknown): string {
  const normalized = normalizeInspectionStationSelection(value);
  if (!normalized) return '';
  if (normalized.mode === 'ALL') return '全部台数';
  return normalized.indexes.map((item) => `第 ${item} 台`).join('、');
}

type InspectionRequestAttachment = {
  fileId?: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export function normalizeInspectionRequestAttachments(
  value: unknown,
): InspectionRequestAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const url = normalizeInspectionRequestText(source.url);
      if (!url) return null;

      const fileId = normalizeInspectionRequestText(source.fileId) || undefined;
      const name =
        normalizeInspectionRequestText(source.name) ||
        normalizeInspectionRequestText(source.originalName) ||
        '报检单';
      const attachment: InspectionRequestAttachment = {
        name,
        size: Number(source.size || 0),
        type: normalizeInspectionRequestText(source.type),
        url,
      };
      if (fileId) {
        attachment.fileId = fileId;
      }

      return attachment;
    })
    .filter((item): item is InspectionRequestAttachment => item !== null);
}

export function parseInspectionRequestAttachments(
  value: unknown,
): InspectionRequestAttachment[] {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeInspectionRequestAttachments(value);
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? normalizeInspectionRequestAttachments(parsed)
      : [];
  } catch {
    return [];
  }
}

export function mergeInspectionRequestAttachments(
  ...sources: unknown[]
): InspectionRequestAttachment[] {
  const merged: InspectionRequestAttachment[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const item of parseInspectionRequestAttachments(source)) {
      const key = normalizeInspectionRequestText(item.fileId) || item.url;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return normalizeInspectionRequestAttachments(merged);
}

export interface InspectionRequestIssueLike {
  id?: null | string;
  isDeleted?: unknown;
  nonConformanceNumber?: null | string;
  quantity?: null | number;
  status?: null | string;
}

export interface InspectionRequestRecordLike {
  attachments?: unknown;
  closeAttachments?: unknown;
  dispatcher?: null | { realName?: null | string; username?: null | string };
  inspection?: null | {
    qualifiedQuantity?: null | number;
    result?: null | string;
    unqualifiedQuantity?: null | number;
  };
  inspectionResult?: null | string;
  inspector?: null | { realName?: null | string; username?: null | string };
  linkedIssueId?: null | string;
  linkedIssueNo?: null | string;
  linkedIssueStatus?: null | string;
  materialRequest?: null | {
    id?: null | string;
    requestedName?: null | string;
    status?: null | string;
  };
  qualifiedQuantity?: null | number;
  qualityRecords?: unknown;
  stationSelection?: unknown;
  unqualifiedQuantity?: null | number;
  workOrders?: Array<{ workOrderNumber?: null | string }>;
}

export function mapInspectionRequestRecord<
  T extends InspectionRequestRecordLike,
>(
  record: T,
): T & {
  attachments: InspectionRequestAttachment[];
  closeAttachments: InspectionRequestAttachment[];
  dispatchBlockedReason:
    | 'MATERIAL_APPROVAL_PENDING'
    | 'MATERIAL_APPROVAL_REJECTED'
    | null;
  dispatcherName: null | string;
  inspectionResult: string;
  inspectorName: null | string;
  linkedIssueId: null | string;
  linkedIssueNo: null | string;
  linkedIssueStatus: null | string;
  materialApprovalStatus: 'APPROVED' | 'PENDING' | 'REJECTED' | null;
  materialRequestId: null | string;
  qualifiedQuantity: null | number;
  requestedPartName: null | string;
  stationSelection: NormalizedInspectionStationSelection | null;
  unqualifiedQuantity: null | number;
  workOrderNumbers: string[];
} {
  const issue = Array.isArray(record.qualityRecords)
    ? (record.qualityRecords.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          !(item as { isDeleted?: unknown }).isDeleted,
      ) as InspectionRequestIssueLike | undefined)
    : undefined;
  const materialApprovalStatus = normalizeMaterialApprovalStatus(
    record.materialRequest?.status,
  );

  return {
    ...record,
    attachments: parseInspectionRequestAttachments(record.attachments),
    closeAttachments: parseInspectionRequestAttachments(
      record.closeAttachments,
    ),
    dispatcherName:
      record.dispatcher?.realName || record.dispatcher?.username || null,
    dispatchBlockedReason: resolveMaterialDispatchBlockedReason(
      materialApprovalStatus,
    ),
    inspectionResult:
      record.inspectionResult || record.inspection?.result || 'PASS',
    inspectorName:
      record.inspector?.realName || record.inspector?.username || null,
    linkedIssueId: record.linkedIssueId || issue?.id || null,
    linkedIssueNo: record.linkedIssueNo || issue?.nonConformanceNumber || null,
    linkedIssueStatus: issue?.status || record.linkedIssueStatus || null,
    materialApprovalStatus,
    materialRequestId:
      normalizeInspectionRequestText(record.materialRequest?.id) || null,
    qualifiedQuantity:
      record.qualifiedQuantity ?? record.inspection?.qualifiedQuantity ?? null,
    requestedPartName:
      normalizeInspectionRequestText(record.materialRequest?.requestedName) ||
      null,
    stationSelection: normalizeInspectionStationSelection(
      record.stationSelection,
    ),
    unqualifiedQuantity:
      record.unqualifiedQuantity ??
      record.inspection?.unqualifiedQuantity ??
      issue?.quantity ??
      null,
    workOrderNumbers: normalizeInspectionRequestWorkOrderNumbers(record),
  };
}

function resolveMaterialDispatchBlockedReason(
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | null,
) {
  if (status === 'PENDING') return 'MATERIAL_APPROVAL_PENDING' as const;
  if (status === 'REJECTED') return 'MATERIAL_APPROVAL_REJECTED' as const;
  return null;
}

function normalizeMaterialApprovalStatus(
  value: unknown,
): 'APPROVED' | 'PENDING' | 'REJECTED' | null {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  if (
    normalized === 'APPROVED' ||
    normalized === 'PENDING' ||
    normalized === 'REJECTED'
  ) {
    return normalized;
  }
  return null;
}

function normalizeInspectionRequestWorkOrderNumbers(
  record: InspectionRequestRecordLike,
) {
  const numbers = Array.isArray(record.workOrders)
    ? record.workOrders
        .map((item) => normalizeInspectionRequestText(item.workOrderNumber))
        .filter(Boolean)
    : [];
  const fallback = normalizeInspectionRequestText(
    (record as { workOrderNumber?: unknown }).workOrderNumber,
  );
  return [...new Set(fallback ? [fallback, ...numbers] : numbers)];
}

export function buildInspectionRequestNo(params: {
  count: number;
  now?: Date;
}): string {
  const datePart = (params.now ?? new Date())
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  return `IR-${datePart}-${String(params.count + 1).padStart(4, '0')}`;
}

function parseIncomingRequestInfo(value?: null | string) {
  const raw = normalizeInspectionRequestText(value);
  if (!raw) return { incomingType: '', notes: '' };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      incomingType: normalizeInspectionRequestText(parsed.incomingType),
      notes: normalizeInspectionRequestText(parsed.notes),
    };
  } catch {
    return { incomingType: '', notes: raw };
  }
}

export interface InspectionRecordPayloadInput {
  body: Record<string, unknown>;
  request: {
    attachments?: unknown;
    category?: null | string;
    closeRemark?: null | string;
    componentName?: null | string;
    mutualCheckResult: string;
    partId?: null | string;
    partName: string;
    processName: string;
    quantity?: number;
    reporter: string;
    requestInfo?: null | string;
    selfCheckResult: string;
    stationSelection?: null | string;
    supplierId?: null | string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
}

export function buildInspectionRecordPayloadCore(
  input: InspectionRecordPayloadInput,
) {
  const result = normalizeInspectionRequestText(
    input.body.result,
  ).toUpperCase();
  const inspectionItems = Array.isArray(input.body.inspectionItems)
    ? input.body.inspectionItems
    : [];
  const closeAttachments = normalizeInspectionRequestAttachments(
    input.body.attachments,
  );
  const selfCheckAttachments = parseInspectionRequestAttachments(
    input.request.attachments,
  );
  const componentName = normalizeInspectionRequestText(
    input.request.componentName,
  );
  const isIncoming = isIncomingInspectionRequestCategory(input.request);
  const requestInfo = isIncoming
    ? parseIncomingRequestInfo(input.request.requestInfo)
    : {
        incomingType: '',
        notes: normalizeInspectionRequestText(input.request.requestInfo),
      };
  const quantity = parseInspectionRequestQuantity(
    input.body.quantity,
    input.request.quantity || 1,
  );
  let defaultMeasuredValue = `${input.request.selfCheckResult}/${input.request.mutualCheckResult}`;
  if (isIncoming) {
    defaultMeasuredValue = result === 'FAIL' ? 'FAIL' : 'PASS';
  }
  const basePayload = {
    documents:
      closeAttachments.length > 0 ? JSON.stringify(closeAttachments) : null,
    hasDocuments:
      typeof input.body.hasDocuments === 'boolean'
        ? input.body.hasDocuments
        : closeAttachments.length > 0,
    hasSelfCheckDocuments: selfCheckAttachments.length > 0,
    inspectionDate:
      normalizeInspectionRequestText(input.body.inspectionDate) || new Date(),
    inspector:
      normalizeInspectionRequestText(input.body.inspector) ||
      normalizeInspectionRequestText(input.request.reporter),
    items:
      inspectionItems.length > 0
        ? inspectionItems
        : [
            {
              acceptanceCriteria: isIncoming
                ? '来料外观、数量和资料符合进货检验要求。'
                : '报检前已完成自检和互检。',
              checkItem: isIncoming
                ? `${INCOMING_INSPECTION_PROCESS_NAME} ${input.request.partName}`
                : `${input.request.processName} ${input.request.partName}${componentName ? ` ${componentName}` : ''}`,
              measuredValue: defaultMeasuredValue,
              remarks: requestInfo.notes,
              result: result === 'FAIL' ? 'FAIL' : 'PASS',
              standardValue: isIncoming ? 'PASS' : 'PASS/PASS',
            },
          ],
    projectName:
      input.request.work_order?.projectName || input.request.workOrderNumber,
    partId: normalizeInspectionRequestText(input.request.partId),
    partName: input.request.partName,
    quantity,
    qualifiedQuantity:
      typeof input.body.qualifiedQuantity === 'string' ||
      typeof input.body.qualifiedQuantity === 'number'
        ? input.body.qualifiedQuantity
        : undefined,
    remarks:
      normalizeInspectionRequestText(input.body.closeRemark) ||
      requestInfo.notes,
    result: result === 'FAIL' ? 'FAIL' : 'PASS',
    selfCheckDocuments:
      selfCheckAttachments.length > 0
        ? JSON.stringify(selfCheckAttachments)
        : null,
    stationSelection: input.request.stationSelection,
    unqualifiedQuantity:
      typeof input.body.unqualifiedQuantity === 'string' ||
      typeof input.body.unqualifiedQuantity === 'number'
        ? input.body.unqualifiedQuantity
        : undefined,
    workOrderNumber: input.request.workOrderNumber,
  };

  if (isIncoming) {
    return {
      ...basePayload,
      category: 'INCOMING' as const,
      incomingType:
        requestInfo.incomingType || INCOMING_INSPECTION_PROCESS_NAME,
      materialName: input.request.partName,
      supplierId: normalizeInspectionRequestText(input.request.supplierId),
      supplierName: normalizeInspectionRequestText(input.request.team),
    };
  }

  return {
    ...basePayload,
    category: 'PROCESS' as const,
    level1Component: input.request.partName,
    level2Component: componentName || undefined,
    processName: input.request.processName,
    team: normalizeInspectionRequestText(input.request.team),
    teamId: normalizeInspectionRequestText(input.request.teamId),
  };
}
