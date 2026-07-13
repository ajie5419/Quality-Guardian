import { Prisma } from '@prisma/client';
import prisma from '~/utils/prisma';

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

export const PlanningBomService = {
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
