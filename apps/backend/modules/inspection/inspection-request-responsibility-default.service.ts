import type { Prisma } from '@prisma/client';

import { ProcessOutsourcingResponsibleDepartmentSettingService } from '~/modules/system';

/**
 * Clients never submit this hidden ID. System configuration owns its canonical
 * identity, and only the first safe bootstrap may consult the legacy name.
 */
export async function resolveProcessOutsourcingResponsibleDepartmentId(
  client: Prisma.TransactionClient,
) {
  const department =
    await ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment(
      client,
    );
  return department.id;
}
