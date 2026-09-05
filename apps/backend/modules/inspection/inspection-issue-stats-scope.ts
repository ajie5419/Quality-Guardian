import { Prisma } from '@prisma/client';

export function buildIssueTrendOwnershipRawFilter(
  where: Prisma.quality_recordsWhereInput,
) {
  return typeof where.createdBy === 'string'
    ? Prisma.sql`AND createdBy = ${where.createdBy}`
    : Prisma.sql``;
}
