import type { Prisma } from '@prisma/client';

import { normalizeInspectionIssueResponsibilityType } from '@qgs/shared';

import { resolveInspectionIssueResponsibility } from './inspection-issue-create.service';
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

function hasResponsibilityFact(request: Request) {
  return Boolean(
    normalizeInspectionRequestText(request.responsibilityType) ||
      normalizeInspectionRequestText(request.responsibleDepartment) ||
      normalizeInspectionRequestText(request.responsibleDepartmentId),
  );
}

function hasCompleteResponsibilityFact(request: Request) {
  const type = normalizeInspectionIssueResponsibilityType(
    request.responsibilityType,
  );
  if (
    !type ||
    !normalizeInspectionRequestText(request.responsibleDepartmentId)
  ) {
    return false;
  }
  return type === 'INTERNAL_DEPARTMENT'
    ? !normalizeInspectionRequestText(request.supplierId)
    : Boolean(normalizeInspectionRequestText(request.supplierId));
}

/**
 * A legacy request has no responsibility triad at all. Its first FAIL close
 * may turn the submitted canonical IDs into the durable request fact, but a
 * partial or competing fact is never overwritten.
 */
export async function resolveLegacyCloseRequestResponsibility<
  T extends Request,
>(options: {
  linkedIssue: Record<string, unknown>;
  request: T;
  tx: Prisma.TransactionClient;
}) {
  if (hasCompleteResponsibilityFact(options.request)) {
    return { request: options.request, resolvedLegacy: false };
  }
  if (hasResponsibilityFact(options.request)) {
    failCloseRequest('VALIDATION', '报检任务责任事实不完整，不能覆盖');
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
