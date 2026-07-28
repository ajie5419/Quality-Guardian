import type { Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';
import type { UserSession } from '~/utils/jwt-utils';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  isIncomingInspectionRequestProcess,
  isOutsourcingInspectionRequestProcess,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
} from './inspection-issue';
import { normalizeInspectionRequestText } from './inspection-request';
import {
  failCloseRequest,
  parseCloseRequestNumber,
} from './inspection-request-close.schema';

export interface CloseLinkedIssueCreateResult {
  auditVariables: { issue: string; nonConformanceNumber: string };
  createData: Prisma.quality_recordsCreateInput;
}

interface CloseIssueResponsibility {
  responsibleDepartment: string;
  responsibleDepartmentId: string;
  responsibilityType: InspectionIssueResponsibilityType;
  supplierId?: string;
  supplierName?: string;
}

export async function buildCloseLinkedIssueCreateResult(options: {
  body: Record<string, unknown>;
  inspectionId: string;
  linkedIssue: Record<string, unknown>;
  request: {
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    supplierId?: null | string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
  tx: Prisma.TransactionClient;
  userinfo: UserSession;
}): Promise<CloseLinkedIssueCreateResult> {
  const linkedInspection = await findInspectionForIssue(
    options.inspectionId,
    options.tx,
  );
  const newId = createInspectionIssueId();
  const serialNumber = await getNextInspectionIssueSerialNumber(options.tx);
  const linkedIssueProcessName = resolveCloseIssueProcessName({
    linkedIssue: options.linkedIssue,
    request: options.request,
  });
  const issueResponsibility = await resolveCloseIssueResponsibility({
    linkedInspection,
    linkedIssue: options.linkedIssue,
    processName: resolveCloseRequestProcessName(options.request),
    request: options.request,
  });
  const issueBody = buildCloseLinkedIssueBody({
    body: options.body,
    inspectionId: options.inspectionId,
    issueResponsibility,
    linkedInspection,
    linkedIssue: options.linkedIssue,
    ncNumber: normalizeInspectionRequestText(options.linkedIssue.ncNumber),
    processName: linkedIssueProcessName,
    request: options.request,
  });

  const createData = await buildInspectionIssueCreateData(issueBody, {
    createdBy:
      String(options.userinfo.id || options.userinfo.userId || '') || undefined,
    id: newId,
    inspection: linkedInspection,
    inspectorUsername: options.userinfo.username,
    serialNumber,
  });

  return {
    auditVariables: {
      issue: issueBody.partName,
      nonConformanceNumber: issueBody.ncNumber,
    },
    createData: {
      ...createData,
      responsibleDepartmentId: issueResponsibility.responsibleDepartmentId,
    },
  };
}

function buildCloseLinkedIssueBody(options: {
  body: Record<string, unknown>;
  inspectionId: string;
  issueResponsibility: CloseIssueResponsibility;
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  linkedIssue: Record<string, unknown>;
  ncNumber: string;
  processName: string;
  request: {
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
}) {
  const issueQuantity = Math.max(
    1,
    Math.trunc(
      parseCloseRequestNumber(
        options.linkedIssue.quantity,
        parseCloseRequestNumber(options.body.unqualifiedQuantity, 1),
      ),
    ),
  );
  const governedIssueFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    {
      division:
        normalizeInspectionRequestText(options.linkedIssue.division) ||
        options.linkedInspection?.work_order?.division ||
        undefined,
      divisionId:
        normalizeInspectionRequestText(options.linkedIssue.divisionId) ||
        options.linkedInspection?.work_order?.divisionId ||
        undefined,
    },
  );
  return {
    claim: normalizeInspectionRequestText(options.linkedIssue.claim) || 'No',
    ...governedIssueFields,
    defectCategoryId: normalizeInspectionRequestText(
      options.linkedIssue.defectCategoryId,
    ),
    defectSubcategoryId: normalizeInspectionRequestText(
      options.linkedIssue.defectSubcategoryId,
    ),
    description: normalizeInspectionRequestText(
      options.linkedIssue.description,
    ),
    inspectionId: options.inspectionId,
    lossAmount: Number(options.linkedIssue.lossAmount || 0),
    partName:
      normalizeInspectionRequestText(options.linkedIssue.partName) ||
      normalizeInspectionRequestText(options.request.componentName) ||
      options.request.partName,
    processName: options.processName,
    projectName:
      options.request.work_order?.projectName ||
      options.request.workOrderNumber,
    quantity: issueQuantity,
    ncNumber: options.ncNumber,
    reportDate: normalizeInspectionRequestText(options.linkedIssue.reportDate),
    reportedBy:
      normalizeInspectionRequestText(options.linkedIssue.reportedBy) ||
      options.request.reporter,
    responsibleDepartment: options.issueResponsibility.responsibleDepartment,
    responsibleDepartmentId:
      options.issueResponsibility.responsibleDepartmentId,
    responsibleWelder:
      normalizeInspectionRequestText(options.linkedIssue.responsibleWelder) ||
      undefined,
    rootCause: normalizeInspectionRequestText(options.linkedIssue.rootCause),
    severity:
      normalizeInspectionRequestText(options.linkedIssue.severity) || 'Minor',
    solution: normalizeInspectionRequestText(options.linkedIssue.solution),
    status:
      normalizeInspectionRequestText(options.linkedIssue.status) || 'OPEN',
    supplierName: options.issueResponsibility.supplierName,
    supplierId: options.issueResponsibility.supplierId,
    sourceType: 'INSPECTION_REQUEST',
    photos: Array.isArray(options.linkedIssue.photos)
      ? options.linkedIssue.photos
      : [],
    workOrderNumber: options.request.workOrderNumber,
  };
}

function resolveCloseIssueProcessName(options: {
  linkedIssue: Record<string, unknown>;
  request: {
    process?: null | { name?: null | string };
    processName: string;
  };
}) {
  return (
    normalizeInspectionRequestText(options.linkedIssue.processName) ||
    normalizeInspectionRequestText(
      resolveCanonicalProcessName(options.request),
    ) ||
    options.request.processName
  );
}

function resolveCloseRequestProcessName(request: {
  process?: null | { name?: null | string };
  processName: string;
}) {
  return (
    normalizeInspectionRequestText(resolveCanonicalProcessName(request)) ||
    normalizeInspectionRequestText(request.processName)
  );
}

async function resolveCloseIssueResponsibility(options: {
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  linkedIssue: Record<string, unknown>;
  processName: string;
  request: {
    supplierId?: null | string;
    teamId?: null | string;
  };
}): Promise<CloseIssueResponsibility> {
  const explicitType = resolveExplicitResponsibilityType(options.linkedIssue);
  const teamSupplier = await SupplierIdentityService.resolveSupplierByTeamId(
    options.request.teamId || options.linkedInspection?.teamId,
  );
  const contextType = resolveContextResponsibilityType({
    linkedInspection: options.linkedInspection,
    requestSupplierId: options.request.supplierId,
    teamSupplier,
  });
  if (explicitType && contextType && explicitType !== contextType) {
    failCloseRequest(
      'VALIDATION',
      '责任类型与报检任务的 canonical 责任单位不一致',
    );
  }
  const responsibilityType =
    explicitType ||
    contextType ||
    inferLegacyResponsibilityType(options.processName);
  const department = await resolveCanonicalResponsibleDepartment({
    explicitType,
    linkedIssue: options.linkedIssue,
  });
  const supplier = await resolveCanonicalResponsibleSupplier({
    linkedInspection: options.linkedInspection,
    linkedIssue: options.linkedIssue,
    requestSupplierId: options.request.supplierId,
    responsibilityType,
    teamSupplier,
  });

  return {
    ...department,
    responsibilityType,
    ...(supplier
      ? { supplierId: supplier.id, supplierName: supplier.name }
      : {}),
  };
}

function resolveExplicitResponsibilityType(
  linkedIssue: Record<string, unknown>,
) {
  const rawType = normalizeInspectionRequestText(
    linkedIssue.responsibilityType,
  );
  const normalizedType = normalizeInspectionIssueResponsibilityType(rawType);
  if (rawType && !normalizedType) {
    failCloseRequest('VALIDATION', '不合格项责任类型无效');
  }
  return normalizedType;
}

function resolveContextResponsibilityType(options: {
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  requestSupplierId?: null | string;
  teamSupplier: null | { id: string; name: string };
}): InspectionIssueResponsibilityType | null {
  const requestSupplierId = normalizeInspectionRequestText(
    options.requestSupplierId,
  );
  if (requestSupplierId && options.teamSupplier) {
    failCloseRequest('VALIDATION', '报检任务存在冲突的 canonical 责任单位');
  }
  if (
    requestSupplierId ||
    (options.linkedInspection?.category === 'INCOMING' &&
      options.linkedInspection.supplierId)
  ) {
    return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER;
  }
  if (
    options.teamSupplier ||
    (options.linkedInspection?.category === 'PROCESS' &&
      options.linkedInspection.supplierId)
  ) {
    return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT;
  }
  return null;
}

function inferLegacyResponsibilityType(
  processName: string,
): InspectionIssueResponsibilityType {
  if (isIncomingInspectionRequestProcess(processName)) {
    return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER;
  }
  if (isOutsourcingInspectionRequestProcess(processName)) {
    return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT;
  }
  return INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
}

async function resolveCanonicalResponsibleDepartment(options: {
  explicitType: InspectionIssueResponsibilityType | null;
  linkedIssue: Record<string, unknown>;
}) {
  const explicitId = normalizeInspectionRequestText(
    options.linkedIssue.responsibleDepartmentId,
  );
  const legacyId = options.explicitType
    ? ''
    : normalizeInspectionRequestText(options.linkedIssue.responsibleDepartment);
  const responsibleDepartmentId = explicitId || legacyId;
  if (!responsibleDepartmentId) {
    failCloseRequest('VALIDATION', '不合格项责任部门 ID 不能为空');
  }
  const canonicalName =
    await MasterDataGovernanceKernel.resolveCanonicalNameById({
      canonicalId: responsibleDepartmentId,
      configKey: 'responsibleDepartment',
      fallbackName: null,
    });
  if (!canonicalName) {
    failCloseRequest('VALIDATION', '不合格项责任部门 ID 无效');
  }
  const governed = await buildGovernedCanonicalWritePairForTable(
    'quality_records',
    { responsibleDepartment: canonicalName, responsibleDepartmentId },
  );
  const responsibleDepartment = normalizeInspectionRequestText(
    governed.responsibleDepartment,
  );
  const governedDepartmentId = normalizeInspectionRequestText(
    governed.responsibleDepartmentId,
  );
  if (!responsibleDepartment || !governedDepartmentId) {
    failCloseRequest('VALIDATION', '不合格项责任部门 ID 无效');
  }
  return {
    responsibleDepartment,
    responsibleDepartmentId: governedDepartmentId,
  };
}

async function resolveCanonicalResponsibleSupplier(options: {
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  linkedIssue: Record<string, unknown>;
  requestSupplierId?: null | string;
  responsibilityType: InspectionIssueResponsibilityType;
  teamSupplier: null | { id: string; name: string };
}) {
  const explicitSupplierId = normalizeInspectionRequestText(
    options.linkedIssue.supplierId,
  );
  if (
    options.responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    if (explicitSupplierId) {
      failCloseRequest('VALIDATION', '内部责任部门不能同时指定供应商 ID');
    }
    return null;
  }
  const canonicalSupplierId = resolveContextSupplierId(options);
  if (
    canonicalSupplierId &&
    explicitSupplierId &&
    canonicalSupplierId !== explicitSupplierId
  ) {
    failCloseRequest(
      'VALIDATION',
      '供应商 ID 与报检任务的 canonical 责任单位不一致',
    );
  }
  const supplierId = canonicalSupplierId || explicitSupplierId;
  if (!supplierId) {
    failCloseRequest('VALIDATION', '外部责任单位缺少 canonical 供应商 ID');
  }
  const supplier =
    await SupplierIdentityService.resolveSupplierById(supplierId);
  if (!supplier) {
    failCloseRequest('VALIDATION', '不合格项供应商 ID 无效');
  }
  return supplier;
}

function resolveContextSupplierId(options: {
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  requestSupplierId?: null | string;
  responsibilityType: InspectionIssueResponsibilityType;
  teamSupplier: null | { id: string; name: string };
}) {
  if (
    options.responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
  ) {
    return (
      normalizeInspectionRequestText(options.requestSupplierId) ||
      normalizeInspectionRequestText(options.linkedInspection?.supplierId)
    );
  }
  return (
    normalizeInspectionRequestText(options.teamSupplier?.id) ||
    normalizeInspectionRequestText(options.linkedInspection?.supplierId)
  );
}
