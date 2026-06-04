/**
 * One-time resync script: recalculate progressPercent and status for all
 * supervision projects using only leaf tasks (isSummary: false), correcting
 * historical dirty data caused by the path-A bug that included summary rows
 * in the denominator.
 *
 * Run:
 *   pnpm --dir apps/backend exec tsx scripts/resync-supervision-project-progress.ts
 *
 * Prerequisites:
 *   - DATABASE_URL must be set (via .env or environment). Prisma reads it automatically.
 *   - Run after deploying the code fix so the same logic is used going forward.
 */

/* eslint-disable no-console */
import process from 'node:process';

import { calcProjectStatusFromProgress } from '../modules/supervision/supervision-plan-task-progress';
import {
  mapPlanTask,
  summarizePlanTasks,
} from '../modules/supervision/supervision-shared';
import prismaDefault from '../utils/prisma';

const prisma = prismaDefault;

async function main() {
  const projects = await prisma.supervision_projects.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      projectName: true,
      progressPercent: true,
      status: true,
    },
  });

  console.log(
    `Found ${projects.length} active supervision project(s). Starting resync...\n`,
  );

  let updatedCount = 0;

  for (const project of projects) {
    const rows = await prisma.supervision_plan_tasks.findMany({
      where: { isDeleted: false, isSummary: false, projectId: project.id },
    });

    const items = rows.map((row) => mapPlanTask(row));
    const newProgress = summarizePlanTasks(items).progressPercent;
    const newStatus = calcProjectStatusFromProgress(newProgress);

    const oldProgress = project.progressPercent ?? 0;
    const oldStatus = project.status;

    const progressChanged = newProgress !== oldProgress;
    const statusChanged = newStatus !== undefined && newStatus !== oldStatus;

    if (progressChanged || statusChanged) {
      await prisma.supervision_projects.update({
        where: { id: project.id },
        data: {
          progressPercent: newProgress,
          status: newStatus,
        },
      });
      updatedCount += 1;
      console.log(
        `[UPDATED] ${project.projectName} (${project.id})\n` +
          `  progress: ${oldProgress}% → ${newProgress}%\n` +
          `  status:   ${oldStatus} → ${newStatus ?? '(unchanged)'}`,
      );
    } else {
      console.log(
        `[OK]      ${project.projectName} (${project.id})  progress=${newProgress}%  status=${oldStatus}`,
      );
    }
  }

  console.log(
    `\nDone. Processed ${projects.length} project(s), corrected ${updatedCount}.`,
  );
}

main()
  .catch((error) => {
    console.error('Resync failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
