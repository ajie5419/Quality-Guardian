import type { Prisma } from '@prisma/client';

import { OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { BusinessError } from '~/utils/business-error';

/**
 * PROCESS outsourcing owns one product-policy department, but clients must
 * never submit its hidden ID. The shared policy constant and active canonical
 * department lookup make a missing or ambiguous setup fail closed.
 */
export async function resolveProcessOutsourcingResponsibleDepartmentId(
  client: Prisma.TransactionClient,
) {
  const departments = await DeptService.findActiveByIdsOrNames(
    { names: [OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT] },
    client,
  );
  if (departments.length !== 1 || !departments[0]) {
    throw new BusinessError(
      'INSPECTION_REQUEST_OUTSOURCING_DEPARTMENT_UNRESOLVED',
      'PROCESS outsourcing responsibility department is not uniquely configured',
      409,
    );
  }
  return departments[0].id;
}
