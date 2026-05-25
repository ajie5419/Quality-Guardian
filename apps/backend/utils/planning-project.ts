import { buildGovernedWriteFieldsForTable } from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';

interface PlanningProjectRecord {
  id: string;
  isDeleted: boolean;
}

interface UpsertPlanningProjectParams<
  TExisting extends PlanningProjectRecord,
  TResult,
> {
  createProject: (params: {
    projectName: string;
    workOrderNumber: string;
  }) => Promise<TResult>;
  findExistingByWorkOrderNumber: (
    workOrderNumber: string,
  ) => Promise<null | TExisting>;
  restoreProjectById: (id: string) => Promise<TResult>;
  workOrderNumber: string;
}

type UpsertPlanningProjectResult<TResult> =
  | { code: 'CONFLICT' }
  | { code: 'CREATED'; data: TResult }
  | { code: 'MISSING_WORK_ORDER' }
  | { code: 'RESTORED'; data: TResult };

export async function upsertPlanningProjectByWorkOrder<
  TExisting extends PlanningProjectRecord,
  TResult,
>(
  params: UpsertPlanningProjectParams<TExisting, TResult>,
): Promise<UpsertPlanningProjectResult<TResult>> {
  const {
    createProject,
    findExistingByWorkOrderNumber,
    restoreProjectById,
    workOrderNumber,
  } = params;

  // governance-allow-direct-canonical-read: planning bootstrap reads current project label from work order.
  const workOrder = await prisma.work_orders.findUnique({
    where: { workOrderNumber },
    select: { projectName: true },
  });
  if (!workOrder) {
    return { code: 'MISSING_WORK_ORDER' };
  }

  const existing = await findExistingByWorkOrderNumber(workOrderNumber);
  if (existing) {
    if (!existing.isDeleted) {
      return { code: 'CONFLICT' };
    }

    const restored = await restoreProjectById(existing.id);
    return { code: 'RESTORED', data: restored };
  }

  const created = await createProject({
    projectName: workOrder.projectName || workOrderNumber,
    workOrderNumber,
  });
  return { code: 'CREATED', data: created };
}

export function applyGovernedProjectNameByTable<
  T extends Record<string, unknown>,
>(targetTable: 'bom_projects' | 'doc_projects', data: T): T {
  return {
    ...data,
    ...buildGovernedWriteFieldsForTable(targetTable, data),
  } as T;
}

export {
  buildPlanningProjectUpdateData,
  normalizePlanningProjectName,
  normalizePlanningWorkOrderNumber,
} from '@qgs/shared';
