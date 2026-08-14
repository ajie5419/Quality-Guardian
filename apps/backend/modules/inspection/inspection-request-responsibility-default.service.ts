import type { Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';
import { InspectionRequestResponsibilityDepartmentSettingService } from '~/modules/system';

export async function resolveInspectionRequestResponsibilityDepartmentId(
  responsibilityType: InspectionIssueResponsibilityType,
  client: Prisma.TransactionClient,
) {
  const department =
    await InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment(
      responsibilityType,
      client,
    );
  return department.id;
}

/**
 * Clients never submit this hidden ID. System configuration owns its canonical
 * identity, and only the first safe bootstrap may consult the legacy name.
 */
export async function resolveProcessOutsourcingResponsibleDepartmentId(
  client: Prisma.TransactionClient,
) {
  return resolveInspectionRequestResponsibilityDepartmentId(
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
    client,
  );
}
