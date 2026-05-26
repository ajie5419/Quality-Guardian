import { mapPlanTask, prisma, summarizePlanTasks } from './supervision-shared';

export async function syncSupervisionProjectProgress(projectId: string) {
  const rows = await prisma.supervision_plan_tasks.findMany({
    where: { isDeleted: false, isSummary: false, projectId },
  });
  const items = rows.map((row) => mapPlanTask(row));
  const progress = summarizePlanTasks(items).progressPercent;
  await prisma.supervision_projects.update({
    data: {
      progressPercent: progress,
      status: progress >= 100 ? 'COMPLETED' : undefined,
    },
    where: { id: projectId },
  });
}
