import type { Prisma } from '@prisma/client';

import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';

import { resolveInspectionIssueResponsibility } from './inspection-issue-create.service';
import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

export type V2RequestResponsibilityInput = {
  category: 'INCOMING' | 'PROCESS';
  v2Responsibility: {
    responsibilityType: string;
    responsibleDepartmentId: string;
    supplierId: string;
    teamId: string;
  };
};

/**
 * V2 stores the chosen responsibility directly. TEAM remains process-internal
 * context only; external responsibility never depends on a TEAM supplier link.
 */
export async function resolveV2RequestResponsibility(
  payload: V2RequestResponsibilityInput,
  tx: Prisma.TransactionClient,
) {
  const responsibility = await resolveInspectionIssueResponsibility(
    payload.v2Responsibility,
    tx,
  );
  if (
    payload.category === 'INCOMING' &&
    responsibility.responsibilityType !== 'SUPPLIER'
  ) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'Incoming inspection requests require SUPPLIER responsibility',
      400,
    );
  }
  const isInternal =
    responsibility.responsibilityType === 'INTERNAL_DEPARTMENT';
  if (!isInternal && payload.v2Responsibility.teamId) {
    throw new BusinessError(
      'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      'External responsibility must not depend on teamId',
      400,
    );
  }
  if (
    payload.category === 'PROCESS' &&
    isInternal &&
    !payload.v2Responsibility.teamId
  ) {
    throw new BusinessError(
      'TEAM_ID_REQUIRED',
      'Internal process responsibility requires teamId',
      400,
    );
  }
  const team =
    isInternal && payload.v2Responsibility.teamId
      ? await SupplierIdentityService.resolveTeamById(
          payload.v2Responsibility.teamId,
          tx,
        )
      : null;
  await assertInspectionRequestResponsibilityPolicy({
    client: tx,
    responsibleDepartmentId: responsibility.responsibleDepartmentId,
    responsibilityType: responsibility.responsibilityType,
    teamId: team?.id,
  });
  return {
    responsibility,
    supplierId: responsibility.supplierId,
    team: team?.name || '',
    teamId: team?.id || null,
  };
}
