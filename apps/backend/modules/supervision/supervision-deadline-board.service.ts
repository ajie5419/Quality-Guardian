import type { DeadlineBoardResult, DeadlineBoardTask } from '@qgs/shared';

import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { mapPlanTask, prisma, summarizePlanTasks } from './supervision-shared';

/**
 * Read-only deadline board aggregation. Kept as a plain management overview
 * of non-deleted projects; write-side object authorization lives in
 * supervision-access.ts (SEC-SUPERVISION-001).
 */
export const SupervisionDeadlineBoardService = {
  async deadlineBoard(params?: {
    dueSoonDays?: number;
    projectId?: string;
  }): Promise<DeadlineBoardResult> {
    const dueSoonDays = params?.dueSoonDays ?? 7;
    const now = new Date();
    const projectWhere: any = {
      isDeleted: false,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    };
    if (params?.projectId) projectWhere.id = params.projectId;

    // governance-allow-direct-name-id: select projection for read-only board aggregation.
    const projects = await prisma.supervision_projects.findMany({
      select: {
        id: true,
        projectId: true,
        projectName: true,
        supplierId: true,
        supplierName: true,
      },
      where: projectWhere,
    });
    const [projectNameById, supplierNameById] = await Promise.all([
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'projectName',
        canonicalIds: projects.map((item) => item.projectId),
      }),
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        configKey: 'supplierName',
        canonicalIds: projects.map((item) => item.supplierId),
      }),
    ]);
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length === 0) {
      return {
        byProject: [],
        delayed: [],
        dueSoon: [],
        risk: [],
        summary: {
          delayedCount: 0,
          dueSoonCount: 0,
          healthyPercent: 100,
          riskCount: 0,
          totalProjects: 0,
        },
      };
    }

    const tasks = await prisma.supervision_plan_tasks.findMany({
      where: {
        isDeleted: false,
        isSummary: false,
        projectId: { in: projectIds },
        status: { notIn: ['DONE'] },
      },
      orderBy: { plannedEndAt: 'asc' },
    });

    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const delayed: DeadlineBoardTask[] = [];
    const dueSoon: DeadlineBoardTask[] = [];
    const risk: DeadlineBoardTask[] = [];

    for (const row of tasks) {
      const mapped = mapPlanTask(row);
      const project = projectMap.get(row.projectId);
      const canonicalProjectName = projectNameById.get(
        String(project?.projectId || ''),
      );
      const canonicalSupplierName = supplierNameById.get(
        String(project?.supplierId || ''),
      );
      // governance-allow-direct-name-id: canonical names are resolved above via governance kernel.
      const task: DeadlineBoardTask = {
        ...mapped,
        projectName: canonicalProjectName || project?.projectName || '',
        supplierName: canonicalSupplierName || project?.supplierName || '',
      };

      const endAt = row.plannedEndAt ? new Date(row.plannedEndAt) : null;
      if (endAt) {
        const endOfDay = new Date(endAt);
        endOfDay.setHours(23, 59, 59, 999);
        if (endOfDay < now) {
          delayed.push(task);
          continue;
        }
        const diffMs = endOfDay.getTime() - now.getTime();
        const diffDays = diffMs / (24 * 60 * 60 * 1000);
        if (diffDays <= dueSoonDays) {
          dueSoon.push(task);
          continue;
        }
      }

      const isRiskFlag = (row.riskLevel || '').toUpperCase() === 'RISK';
      if (isRiskFlag) {
        risk.push(task);
        continue;
      }

      const startAt = row.plannedStartAt ? new Date(row.plannedStartAt) : null;
      if (startAt && endAt && startAt < now) {
        const totalDuration = endAt.getTime() - startAt.getTime();
        const elapsed = now.getTime() - startAt.getTime();
        if (totalDuration > 0) {
          const expectedProgress = (elapsed / totalDuration) * 100;
          const actualProgress = mapPlanTask(row).progressPercent;
          if (actualProgress < expectedProgress * 0.7) {
            risk.push(task);
          }
        }
      }
    }

    const byProjectMap = new Map<
      string,
      { delayed: number; dueSoon: number; risk: number }
    >();
    for (const t of delayed) {
      const s = byProjectMap.get(t.projectId) ?? {
        delayed: 0,
        dueSoon: 0,
        risk: 0,
      };
      s.delayed++;
      byProjectMap.set(t.projectId, s);
    }
    for (const t of dueSoon) {
      const s = byProjectMap.get(t.projectId) ?? {
        delayed: 0,
        dueSoon: 0,
        risk: 0,
      };
      s.dueSoon++;
      byProjectMap.set(t.projectId, s);
    }
    for (const t of risk) {
      const s = byProjectMap.get(t.projectId) ?? {
        delayed: 0,
        dueSoon: 0,
        risk: 0,
      };
      s.risk++;
      byProjectMap.set(t.projectId, s);
    }

    const totalLeafTasks = tasks.length;
    const problemCount = delayed.length + dueSoon.length + risk.length;
    const healthyPercent =
      totalLeafTasks > 0
        ? Math.round(((totalLeafTasks - problemCount) / totalLeafTasks) * 100)
        : 100;

    return {
      byProject: projects
        .map((p) => {
          const s = byProjectMap.get(p.id) ?? {
            delayed: 0,
            dueSoon: 0,
            risk: 0,
          };
          const projectLeafTasks = tasks.filter((t) => t.projectId === p.id);
          const projectItems = projectLeafTasks.map((t) => mapPlanTask(t));
          const overallProgress =
            summarizePlanTasks(projectItems).progressPercent;
          return {
            delayedCount: s.delayed,
            dueSoonCount: s.dueSoon,
            overallProgress,
            projectId: p.id,
            projectName: p.projectName,
            riskCount: s.risk,
            supplierName: p.supplierName || '',
          };
        })
        .filter((p) => p.delayedCount + p.dueSoonCount + p.riskCount > 0),
      delayed,
      dueSoon,
      risk,
      summary: {
        delayedCount: delayed.length,
        dueSoonCount: dueSoon.length,
        healthyPercent,
        riskCount: risk.length,
        totalProjects: projects.length,
      },
    };
  },
};
