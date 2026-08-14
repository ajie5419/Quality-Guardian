import type { Prisma } from '@prisma/client';

import {
  getInspectionRequestResponsibilitySupplierCategory,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { resolveInspectionRequestResponsibilityDepartmentId } from './inspection-request-responsibility-default.service';
import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

export type V2RequestResponsibilityInput = {
  category: 'INCOMING' | 'PROCESS';
  v2Responsibility: {
    responsibilityType: string;
    responsibleDepartmentId?: string;
    supplierId: string;
    teamId?: null | string;
  };
};

/**
 * V2 stores the chosen responsibility directly. PROCESS internal responsibility
 * is a production department; TEAM identity is not part of this request contract.
 */
export async function resolveV2RequestResponsibility(
  payload: V2RequestResponsibilityInput,
  tx: Prisma.TransactionClient,
) {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    payload.v2Responsibility.responsibilityType,
  );
  if (!responsibilityType) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'Inspection request responsibilityType is invalid',
      400,
    );
  }
  if (
    payload.category === 'INCOMING' &&
    responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'INCOMING inspection requests cannot use internal department responsibility',
      400,
    );
  }
  if (
    payload.category === 'PROCESS' &&
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
  ) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'PROCESS inspection requests cannot use supplier responsibility',
      400,
    );
  }
  const isServerResolvedDepartment =
    payload.category === 'INCOMING' ||
    responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT;
  if (
    isServerResolvedDepartment &&
    String(payload.v2Responsibility.responsibleDepartmentId || '').trim()
  ) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'External responsibility department is server-resolved',
      400,
    );
  }
  const responsibleDepartmentId = isServerResolvedDepartment
    ? await resolveInspectionRequestResponsibilityDepartmentId(
        responsibilityType,
        tx,
      )
    : payload.v2Responsibility.responsibleDepartmentId;
  const responsibility = await resolveInspectionIssueResponsibility(
    { ...payload.v2Responsibility, responsibleDepartmentId },
    tx,
  );
  if (payload.v2Responsibility.teamId) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'Inspection request teamId is no longer supported',
      400,
    );
  }
  const supplierCategory = getInspectionRequestResponsibilitySupplierCategory(
    responsibility.responsibilityType,
  );
  if (supplierCategory) {
    const supplier = await SupplierIdentityService.resolveSupplierById(
      responsibility.supplierId,
      tx,
    );
    if (!supplier || supplier.category !== supplierCategory) {
      throw new BusinessError(
        'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
        'Supplier category does not match responsibilityType',
        400,
      );
    }
  }
  await assertInspectionRequestResponsibilityPolicy({
    client: tx,
    responsibleDepartmentId: responsibility.responsibleDepartmentId,
    responsibilityType: responsibility.responsibilityType,
    teamId: undefined,
  });
  return {
    responsibility,
    supplierId: responsibility.supplierId,
    team: '',
    teamId: null,
  };
}
