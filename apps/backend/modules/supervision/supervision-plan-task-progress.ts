import type { Prisma } from '@prisma/client';

import { mapPlanTask, prisma, summarizePlanTasks } from './supervision-shared';

/**
 * Derive the project status from a progress value:
 * - 100   → 'COMPLETED'
 * - 1–99  → 'IN_PROGRESS'
 * - 0     → undefined (keep existing value, e.g. 'PLANNED')
 */
export function calcProjectStatusFromProgress(
  progress: number,
): string | undefined {
  if (progress >= 100) return 'COMPLETED';
  if (progress > 0) return 'IN_PROGRESS';
  return undefined;
}

/**
 * Recalculate a project's progressPercent and status from its leaf tasks.
 *
 * Accepts an optional Prisma transaction client so it can be called inside
 * an existing $transaction (pass `tx`) or standalone (omit the argument).
 */
export async function syncSupervisionProjectProgress(
  projectId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  const rows = await client.supervision_plan_tasks.findMany({
    where: { isDeleted: false, isSummary: false, projectId },
  });
  const items = rows.map((row) => mapPlanTask(row));
  const progress = summarizePlanTasks(items).progressPercent;
  await client.supervision_projects.update({
    data: {
      progressPercent: progress,
      status: calcProjectStatusFromProgress(progress),
    },
    where: { id: projectId },
  });
}
