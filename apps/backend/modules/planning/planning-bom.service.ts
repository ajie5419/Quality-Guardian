import { Prisma } from '@prisma/client';
import { PartMasterService } from '~/modules/part-master';
import prisma from '~/utils/prisma';

type PlanningBomClient = Pick<Prisma.TransactionClient, 'master_parts'>;

const workOrderBomSelect = {
  id: true,
  material: true,
  partId: true,
  part_name: true,
  part_number: true,
  quantity: true,
  remarks: true,
  required_processes: true,
  unit: true,
  updated_at: true,
  processRequirements: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      position: true,
      process: { select: { name: true } },
      processId: true,
      processName: true,
    },
  },
} as const satisfies Prisma.project_bomsSelect;

export type WorkOrderBomRow = Prisma.project_bomsGetPayload<{
  select: typeof workOrderBomSelect;
}>;

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

export const PlanningBomService = {
  /**
   * All BOM rows of one work order with their required processes ordered by
   * position. project_boms has no soft delete; an unknown work order yields [].
   */
  async listByWorkOrder(workOrderNumber: string): Promise<WorkOrderBomRow[]> {
    return prisma.project_boms.findMany({
      where: { work_order_number: workOrderNumber },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: workOrderBomSelect,
    });
  },

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
