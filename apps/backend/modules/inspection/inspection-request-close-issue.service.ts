import type { Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';
import type { UserSession } from '~/utils/jwt-utils';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import { findInspectionForIssue } from './inspection-issue';
import { InspectionIssueCreateService } from './inspection-issue-create.service';
import { normalizeInspectionRequestText } from './inspection-request';
import { requireCanonicalCloseResponsibility } from './inspection-request-close-responsibility.service';
import {
  failCloseRequest,
  parseCloseRequestNumber,
} from './inspection-request-close.schema';
import { resolveInspectionRequestIssueResponsibilityInTransaction } from './inspection-request-responsibility.service';

export interface CloseLinkedIssueCreateResult {
  auditVariables: { issue: string; nonConformanceNumber: string };
  record: Prisma.quality_recordsGetPayload<Record<string, never>>;
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
    category?: null | string;
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    responsibilityType?: null | string;
    responsibleDepartment?: null | string;
    responsibleDepartmentId?: null | string;
    supplierId?: null | string;
    supplierName?: null | string;
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
  const linkedIssueProcessName = resolveCloseIssueProcessName({
    linkedIssue: options.linkedIssue,
    request: options.request,
  });
  const issueResponsibility = await resolveCloseIssueResponsibility({
    linkedInspection,
    linkedIssue: options.linkedIssue,
    request: options.request,
    tx: options.tx,
  });
  const issueBody = buildCloseLinkedIssueBody({
    body: options.body,
    inspectionId: options.inspectionId,
    issueResponsibility,
    linkedInspection,
    linkedIssue: options.linkedIssue,
    processName: linkedIssueProcessName,
    request: options.request,
  });

  const created = await InspectionIssueCreateService.createInTransaction({
    body: issueBody,
    tx: options.tx,
    userinfo: options.userinfo,
  });
  const responsibility = requireCanonicalCloseResponsibility(options.request);
  const record = await options.tx.quality_records.update({
    data: responsibility,
    where: { id: created.record.id },
  });

  return {
    auditVariables: {
      issue: issueBody.partName,
      nonConformanceNumber: created.ncNumber,
    },
    record,
  };
}

function buildCloseLinkedIssueBody(options: {
  body: Record<string, unknown>;
  inspectionId: string;
  issueResponsibility: CloseIssueResponsibility;
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  linkedIssue: Record<string, unknown>;
  processName: string;
  request: {
    category?: null | string;
    componentName?: null | string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    reporter: string;
    responsibilityType?: null | string;
    responsibleDepartment?: null | string;
    responsibleDepartmentId?: null | string;
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
    reportDate: normalizeInspectionRequestText(options.linkedIssue.reportDate),
    reportedBy:
      normalizeInspectionRequestText(options.linkedIssue.reportedBy) ||
      options.request.reporter,
    responsibleDepartment: options.issueResponsibility.responsibleDepartment,
    responsibleDepartmentId:
      options.issueResponsibility.responsibleDepartmentId,
    responsibilityType: options.issueResponsibility.responsibilityType,
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
    category?: null | string;
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

async function resolveCloseIssueResponsibility(options: {
  linkedInspection: Awaited<ReturnType<typeof findInspectionForIssue>>;
  linkedIssue: Record<string, unknown>;
  request: {
    category?: null | string;
    processName?: null | string;
    responsibilityType?: null | string;
    responsibleDepartment?: null | string;
    responsibleDepartmentId?: null | string;
    supplierId?: null | string;
    supplierName?: null | string;
    teamId?: null | string;
  };
  tx: Prisma.TransactionClient;
}): Promise<CloseIssueResponsibility> {
  const explicitType = resolveExplicitResponsibilityType(options.linkedIssue);
  const requestContext = {
    category: options.request.category || options.linkedInspection?.category,
    processName:
      options.request.processName || options.linkedInspection?.processName,
    supplierId:
      options.request.supplierId || options.linkedInspection?.supplierId,
    supplierName: options.request.supplierName,
    team: options.linkedInspection?.team,
    teamId: options.request.teamId || options.linkedInspection?.teamId,
    responsibilityType: options.request.responsibilityType,
    responsibleDepartment: options.request.responsibleDepartment,
    responsibleDepartmentId: options.request.responsibleDepartmentId,
  };
  const canonical =
    await resolveInspectionRequestIssueResponsibilityInTransaction(
      requestContext,
      options.tx,
    );
  if (explicitType && explicitType !== canonical.responsibilityType) {
    failCloseRequest(
      'VALIDATION',
      '责任类型与报检任务的 canonical 责任单位不一致',
    );
  }
  if (!explicitType) {
    failCloseRequest('VALIDATION', '不合格项责任类型无效');
  }
  const responsibilityType = explicitType;
  const requestedDepartmentId = normalizeInspectionRequestText(
    options.linkedIssue.responsibleDepartmentId,
  );
  if (!canonical.responsibleDepartmentId) {
    failCloseRequest(
      'VALIDATION',
      '报检任务责任部门缺失或存在多个有效匹配，不能创建不合格项',
    );
  }
  if (requestedDepartmentId !== canonical.responsibleDepartmentId) {
    failCloseRequest(
      'VALIDATION',
      '责任部门 ID 与报检任务的 canonical 责任部门不一致',
    );
  }
  const supplier = await resolveCanonicalResponsibleSupplier({
    linkedIssue: options.linkedIssue,
    canonicalSupplierId: canonical.supplierId,
    responsibilityType,
    tx: options.tx,
  });

  return {
    responsibleDepartment: canonical.responsibleDepartment,
    responsibleDepartmentId: canonical.responsibleDepartmentId,
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

async function resolveCanonicalResponsibleSupplier(options: {
  canonicalSupplierId: null | string;
  linkedIssue: Record<string, unknown>;
  responsibilityType: InspectionIssueResponsibilityType;
  tx: Prisma.TransactionClient;
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
  if (
    options.canonicalSupplierId &&
    explicitSupplierId &&
    options.canonicalSupplierId !== explicitSupplierId
  ) {
    failCloseRequest(
      'VALIDATION',
      '供应商 ID 与报检任务的 canonical 责任单位不一致',
    );
  }
  const supplierId = options.canonicalSupplierId || explicitSupplierId;
  if (!supplierId) {
    failCloseRequest('VALIDATION', '外部责任单位缺少 canonical 供应商 ID');
  }
  const supplier = await SupplierIdentityService.resolveSupplierById(
    supplierId,
    options.tx,
  );
  if (!supplier) {
    failCloseRequest('VALIDATION', '不合格项供应商 ID 无效');
  }
  return supplier;
}
