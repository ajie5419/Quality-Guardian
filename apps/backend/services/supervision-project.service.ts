import type {
  SupervisionProject,
  SupervisionProjectParams,
  SupervisionProjectType,
} from '@qgs/shared';

import { formatDate } from '@qgs/shared';

import {
  normalizeDate,
  normalizePercent,
  normalizeProjectStatus,
  normalizeProjectType,
  normalizeText,
  parseList,
  prisma,
  stringifyList,
} from './supervision-shared';

function mapProject(row: any, extras?: Partial<SupervisionProject>) {
  return {
    actualEndAt: row.actualEndAt ? row.actualEndAt.toISOString() : '',
    actualStartAt: row.actualStartAt ? row.actualStartAt.toISOString() : '',
    createdAt: row.createdAt?.toISOString(),
    id: row.id,
    location: row.location || '',
    participants: parseList(row.participants),
    plannedEndAt: row.plannedEndAt ? row.plannedEndAt.toISOString() : '',
    plannedStartAt: row.plannedStartAt ? row.plannedStartAt.toISOString() : '',
    progressPercent: row.progressPercent || 0,
    projectName: row.projectName,
    projectType: normalizeProjectType(
      row.projectType,
    ) as SupervisionProjectType,
    riskLevel: row.riskLevel || 'LOW',
    stage: row.stage || '',
    status: normalizeProjectStatus(row.status) as SupervisionProject['status'],
    summary: row.summary || '',
    supplierName: row.supplierName || '',
    supervisor: row.supervisor || '',
    updatedAt: row.updatedAt?.toISOString(),
    workOrderNumber: row.workOrderNumber || '',
    ...extras,
  } satisfies SupervisionProject;
}

export const SupervisionProjectService = {
  async createProject(payload: Record<string, unknown>) {
    const row = await prisma.supervision_projects.create({
      data: {
        actualEndAt: normalizeDate(payload.actualEndAt),
        actualStartAt: normalizeDate(payload.actualStartAt),
        location: normalizeText(payload.location) || null,
        participants: stringifyList(payload.participants),
        plannedEndAt: normalizeDate(payload.plannedEndAt),
        plannedStartAt: normalizeDate(payload.plannedStartAt),
        progressPercent: normalizePercent(payload.progressPercent),
        projectName: normalizeText(payload.projectName),
        projectType: normalizeProjectType(payload.projectType),
        riskLevel: normalizeText(payload.riskLevel).toUpperCase() || 'LOW',
        stage: normalizeText(payload.stage) || null,
        status: normalizeProjectStatus(payload.status),
        summary: normalizeText(payload.summary) || null,
        supplierName: normalizeText(payload.supplierName) || null,
        supervisor: normalizeText(payload.supervisor) || null,
        workOrderNumber: normalizeText(payload.workOrderNumber) || null,
      },
    });
    return mapProject(row);
  },

  async listProjects(params: SupervisionProjectParams) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));
    const where: any = { isDeleted: false };
    if (params.status) where.status = normalizeProjectStatus(params.status);
    if (params.supplierName)
      where.supplierName = { contains: params.supplierName };
    if (params.projectType)
      where.projectType = normalizeProjectType(params.projectType);
    if (params.keyword) {
      where.OR = [
        { projectName: { contains: params.keyword } },
        { projectType: { contains: params.keyword } },
        { workOrderNumber: { contains: params.keyword } },
        { supplierName: { contains: params.keyword } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.supervision_projects.findMany({
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.supervision_projects.count({ where }),
    ]);
    const projectIds = rows.map((row) => row.id);
    const [issueRows, reportRows] =
      projectIds.length === 0
        ? [[], []]
        : await Promise.all([
            prisma.supervision_issues.groupBy({
              _count: { id: true },
              by: ['projectId', 'status'],
              where: { isDeleted: false, projectId: { in: projectIds } },
            }),
            prisma.supervision_daily_reports.groupBy({
              _max: { reportDate: true },
              by: ['projectId'],
              where: { isDeleted: false, projectId: { in: projectIds } },
            }),
          ]);

    const issueMap = new Map<
      string,
      { closed: number; open: number; total: number }
    >();
    issueRows.forEach((item) => {
      const stats = issueMap.get(item.projectId) || {
        closed: 0,
        open: 0,
        total: 0,
      };
      const count = item._count.id;
      stats.total += count;
      if (item.status === 'CLOSED') stats.closed += count;
      else stats.open += count;
      issueMap.set(item.projectId, stats);
    });
    const reportMap = new Map(
      reportRows.map((item) => [item.projectId, item._max.reportDate]),
    );

    return {
      items: rows.map((row) => {
        const issue = issueMap.get(row.id) || { closed: 0, open: 0, total: 0 };
        return mapProject(row, {
          closedIssueCount: issue.closed,
          latestReportDate: reportMap.get(row.id)
            ? formatDate(reportMap.get(row.id) as Date)
            : '',
          openIssueCount: issue.open,
          totalIssueCount: issue.total,
        });
      }),
      total,
    };
  },

  async updateProject(id: string, payload: Record<string, unknown>) {
    const row = await prisma.supervision_projects.update({
      data: {
        actualEndAt:
          payload.actualEndAt === undefined
            ? undefined
            : normalizeDate(payload.actualEndAt) || null,
        actualStartAt:
          payload.actualStartAt === undefined
            ? undefined
            : normalizeDate(payload.actualStartAt) || null,
        location:
          payload.location === undefined
            ? undefined
            : normalizeText(payload.location) || null,
        participants:
          payload.participants === undefined
            ? undefined
            : stringifyList(payload.participants),
        plannedEndAt:
          payload.plannedEndAt === undefined
            ? undefined
            : normalizeDate(payload.plannedEndAt) || null,
        plannedStartAt:
          payload.plannedStartAt === undefined
            ? undefined
            : normalizeDate(payload.plannedStartAt) || null,
        progressPercent:
          payload.progressPercent === undefined
            ? undefined
            : normalizePercent(payload.progressPercent),
        projectName:
          payload.projectName === undefined
            ? undefined
            : normalizeText(payload.projectName),
        projectType:
          payload.projectType === undefined
            ? undefined
            : normalizeProjectType(payload.projectType),
        riskLevel:
          payload.riskLevel === undefined
            ? undefined
            : normalizeText(payload.riskLevel).toUpperCase() || 'LOW',
        stage:
          payload.stage === undefined
            ? undefined
            : normalizeText(payload.stage) || null,
        status:
          payload.status === undefined
            ? undefined
            : normalizeProjectStatus(payload.status),
        summary:
          payload.summary === undefined
            ? undefined
            : normalizeText(payload.summary) || null,
        supplierName:
          payload.supplierName === undefined
            ? undefined
            : normalizeText(payload.supplierName) || null,
        supervisor:
          payload.supervisor === undefined
            ? undefined
            : normalizeText(payload.supervisor) || null,
        workOrderNumber:
          payload.workOrderNumber === undefined
            ? undefined
            : normalizeText(payload.workOrderNumber) || null,
      },
      where: { id },
    });
    return mapProject(row);
  },
};
