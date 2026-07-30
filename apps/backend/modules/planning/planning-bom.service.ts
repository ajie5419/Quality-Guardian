import { Prisma } from '@prisma/client';
import { PartMasterService } from '~/modules/part-master';
import prisma from '~/utils/prisma';

type PlanningBomClient = Pick<Prisma.TransactionClient, 'master_parts'>;

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

export const PlanningBomService = {
  async resolvePartIdentityForWrite(
    input: { partId?: null | string; partName: string },
    db: PlanningBomClient = prisma,
  ) {
    return PartMasterService.resolveOrCreateActive(
      { name: normalizeText(input.partName), partId: input.partId },
      db,
    );
  },

  async findPartReference(params: {
    partId?: null | string;
    partName: string;
    workOrderNumber: string;
  }) {
    const partId = normalizeText(params.partId);
    const partName = normalizeText(params.partName);
    const partFilter: Prisma.project_bomsWhereInput = partId
      ? { partId }
      : { part_name: partName };

    return prisma.project_boms.findFirst({
      where: {
        work_order_number: params.workOrderNumber,
        ...partFilter,
      },
      select: {
        partId: true,
        part_name: true,
      },
    });
  },
};
