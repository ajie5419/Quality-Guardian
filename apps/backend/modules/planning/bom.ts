import { Prisma } from '@prisma/client';

export {
  buildProjectBomCreateData,
  buildProjectBomMutableData,
  createBomItemId,
  createBomProjectId,
  groupBomItemsByWorkOrder,
  mapBomTreeProjectNode,
  mapProjectBomItem,
  normalizeBomProjectStatus,
  normalizeBomProjectVersion,
  normalizeBomText,
  parseBomQuantity,
  parseBomRequiredProcesses,
  serializeBomRequiredProcesses,
} from '@qgs/shared';
export type { BomInspectionProgress } from '@qgs/shared';

export const projectBomItemSelect = {
  id: true,
  part_name: true,
  part_number: true,
  quantity: true,
  remarks: true,
  required_processes: true,
  unit: true,
  work_order_number: true,
} as const;

export type ProjectBomItemRow = Prisma.project_bomsGetPayload<{
  select: typeof projectBomItemSelect;
}>;
