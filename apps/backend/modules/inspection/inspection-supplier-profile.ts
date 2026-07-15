import type { Prisma } from '@prisma/client';

export function buildSupplierEngineeringIssueWhere(params: {
  since?: Date;
  supplierIds: string[];
}): Prisma.quality_recordsWhereInput {
  return {
    isDeleted: false,
    supplierId: { in: params.supplierIds },
    ...(params.since ? { date: { gte: params.since } } : {}),
  };
}
