import type { Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';

export async function resolveQualityLossDepartmentWrite(
  tx: Prisma.TransactionClient,
  responsibleDepartmentId: string,
) {
  const department = await tx.departments.findFirst({
    where: {
      id: responsibleDepartmentId,
      isDeleted: false,
      status: 1,
    },
    select: { id: true, name: true },
  });
  if (!department) {
    throw new BusinessError(
      'INVALID_RESPONSIBLE_DEPARTMENT_ID',
      'responsibleDepartmentId does not reference an active department',
    );
  }
  return { respDept: department.name, respDeptId: department.id };
}
