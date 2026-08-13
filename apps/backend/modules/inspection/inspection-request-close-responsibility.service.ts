import type { Prisma } from '@prisma/client';

import { normalizeInspectionIssueResponsibilityType } from '@qgs/shared';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { normalizeInspectionRequestText } from './inspection-request';
import { failCloseRequest } from './inspection-request-close.schema';
import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

type Request = {
  category?: null | string;
  id: string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
  teamId?: null | string;
};

type InspectionResponsibility = {
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
  responsibleDepartmentId?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
};

export type CanonicalCloseResponsibility = {
  responsibilityType: string;
  responsibleDepartment: string;
  responsibleDepartmentId: string;
  supplierId: null | string;
  supplierName: null | string;
};

function hasResponsibilityFact(request: Request) {
  return Boolean(
    normalizeInspectionRequestText(request.responsibilityType) ||
      normalizeInspectionRequestText(request.responsibleDepartment) ||
      normalizeInspectionRequestText(request.responsibleDepartmentId),
  );
}

function hasCompleteResponsibilityFact(request: Omit<Request, 'id'>) {
  const type = normalizeInspectionIssueResponsibilityType(
    request.responsibilityType,
  );
  if (
    !type ||
    !normalizeInspectionRequestText(request.responsibleDepartmentId) ||
    !normalizeInspectionRequestText(request.responsibleDepartment)
  ) {
    return false;
  }
  return type === 'INTERNAL_DEPARTMENT'
    ? !normalizeInspectionRequestText(request.supplierId) &&
        !normalizeInspectionRequestText(request.supplierName)
    : Boolean(
        normalizeInspectionRequestText(request.supplierId) &&
          normalizeInspectionRequestText(request.supplierName),
      );
}

/**
 * Closing is the boundary where one request responsibility becomes durable on
 * every generated inspection and its linked NC. Only the request may supply
 * this fact; an existing inspection can never replace it.
 */
export function requireCanonicalCloseResponsibility(
  request: Omit<Request, 'id'>,
): CanonicalCloseResponsibility {
  if (!hasCompleteResponsibilityFact(request)) {
    failCloseRequest('VALIDATION', '报检任务责任事实不完整，不能关闭');
  }
  return {
    responsibilityType: normalizeInspectionRequestText(
      request.responsibilityType,
    ),
    responsibleDepartment: normalizeInspectionRequestText(
      request.responsibleDepartment,
    ),
    responsibleDepartmentId: normalizeInspectionRequestText(
      request.responsibleDepartmentId,
    ),
    supplierId: normalizeInspectionRequestText(request.supplierId) || null,
    supplierName: normalizeInspectionRequestText(request.supplierName) || null,
  };
}

/**
 * Existing records with no identity may be projected from the request during
 * close. A partial or conflicting canonical identity must abort the same
 * transaction instead of letting a display fallback hide the data defect.
 */
export function buildCloseInspectionResponsibilityWrite(options: {
  inspection?: InspectionResponsibility | null;
  request: Request;
}) {
  const expected = requireCanonicalCloseResponsibility(options.request);
  const inspection = options.inspection;
  if (!inspection) return expected;

  const actualType = normalizeInspectionRequestText(
    inspection.responsibilityType,
  );
  const actualDepartmentId = normalizeInspectionRequestText(
    inspection.responsibleDepartmentId,
  );
  const actualSupplierId = normalizeInspectionRequestText(
    inspection.supplierId,
  );
  const actualDepartment = normalizeInspectionRequestText(
    inspection.responsibleDepartment,
  );
  const actualSupplierName = normalizeInspectionRequestText(
    inspection.supplierName,
  );
  const hasIdentity = Boolean(
    actualType ||
      actualDepartmentId ||
      actualDepartment ||
      actualSupplierId ||
      actualSupplierName,
  );
  if (!hasIdentity) return expected;

  const supplierMatches =
    actualSupplierId === (expected.supplierId || '') &&
    actualSupplierName === (expected.supplierName || '') &&
    (expected.responsibilityType === 'INTERNAL_DEPARTMENT'
      ? !actualSupplierId
      : Boolean(actualSupplierId));
  if (
    actualType !== expected.responsibilityType ||
    actualDepartmentId !== expected.responsibleDepartmentId ||
    actualDepartment !== expected.responsibleDepartment ||
    !supplierMatches
  ) {
    failCloseRequest('CONFLICT', '关联检验记录责任事实与报检任务不一致');
  }
  return expected;
}

/**
 * A legacy request has no responsibility triad at all. Its first FAIL close
 * may turn the submitted canonical IDs into the durable request fact, but a
 * PASS close cannot invent a fact and a partial fact is never overwritten.
 */
export async function resolveLegacyCloseRequestResponsibility<
  T extends Request,
>(options: {
  linkedIssue?: Record<string, unknown>;
  request: T;
  tx: Prisma.TransactionClient;
}) {
  if (hasCompleteResponsibilityFact(options.request)) {
    return { request: options.request, resolvedLegacy: false };
  }
  if (hasResponsibilityFact(options.request)) {
    failCloseRequest('VALIDATION', '报检任务责任事实不完整，不能覆盖');
  }
  if (!options.linkedIssue) {
    failCloseRequest('VALIDATION', '报检任务责任事实缺失，不能关闭');
  }
  const responsibility = await resolveInspectionIssueResponsibility(
    options.linkedIssue,
    options.tx,
  );
  await assertInspectionRequestResponsibilityPolicy({
    client: options.tx,
    responsibleDepartmentId: responsibility.responsibleDepartmentId,
    responsibilityType: responsibility.responsibilityType,
    teamId:
      responsibility.responsibilityType === 'INTERNAL_DEPARTMENT'
        ? options.request.teamId
        : null,
  });
  const existingSupplierId = normalizeInspectionRequestText(
    options.request.supplierId,
  );
  if (
    existingSupplierId &&
    existingSupplierId !== (responsibility.supplierId || '')
  ) {
    failCloseRequest('VALIDATION', '报检任务存在冲突的供应商责任事实');
  }
  const persisted = await options.tx.qms_inspection_requests.updateMany({
    data: {
      responsibilityType: responsibility.responsibilityType,
      responsibleDepartment: responsibility.responsibleDepartment,
      responsibleDepartmentId: responsibility.responsibleDepartmentId,
      supplierId: responsibility.supplierId,
      supplierName: responsibility.supplierName,
    },
    where: {
      id: options.request.id,
      isDeleted: false,
      responsibilityType: null,
      responsibleDepartment: null,
      responsibleDepartmentId: null,
      supplierId: options.request.supplierId ?? null,
      // The selected internal department is validated against this TEAM.
      // A concurrent TEAM change must therefore invalidate the same CAS write.
      teamId: options.request.teamId ?? null,
    },
  });
  if (persisted.count !== 1) {
    failCloseRequest('CONFLICT', '报检任务责任事实已被并发修改，请刷新后重试');
  }
  return {
    request: {
      ...options.request,
      responsibilityType: responsibility.responsibilityType,
      responsibleDepartment: responsibility.responsibleDepartment,
      responsibleDepartmentId: responsibility.responsibleDepartmentId,
      supplierId: responsibility.supplierId,
      supplierName: responsibility.supplierName,
    } as T & {
      responsibilityType: string;
      responsibleDepartment: string;
      responsibleDepartmentId: string;
      supplierId: null | string;
      supplierName: null | string;
    },
    resolvedLegacy: true,
  };
}
