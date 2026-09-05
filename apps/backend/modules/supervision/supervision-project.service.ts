import type {
  SupervisionProject,
  SupervisionProjectParams,
  SupervisionProjectType,
} from '@qgs/shared';

import type { SupervisionAccessContext } from './supervision-access';

import { formatDate } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { buildKeywordOr } from '~/utils/query-helpers';

import { buildSupervisionAccessWhere } from './supervision-access';
import { auditSupervisionWrite } from './supervision-audit';
import { syncSupervisionProjectProgress } from './supervision-plan-task-progress';
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
import {
  assertSupervisionProjectTransition,
  throwSupervisionConflict,
} from './supervision-state';

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
    supplierId: row.supplierId || null,
    supplierName: row.supplierName || '',
    supervisor: row.supervisor || '',
    updatedAt: row.updatedAt?.toISOString(),
    workOrderNumber: row.workOrderNumber || '',
    ...extras,
  } satisfies SupervisionProject;
}

export const SupervisionProjectService = {
  async createProject(
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    const normalizedParticipants = stringifyList(payload.participants);
    const normalizedProjectType = normalizeProjectType(payload.projectType);
    const normalizedSupplierId =
      payload.supplierId === undefined
        ? undefined
        : normalizeText(payload.supplierId) || null;
    const governedFields = buildGovernedWriteFieldsForTable(
      'supervision_projects',
      {
        participants: normalizedParticipants, // governance-allow-direct-name-id
        projectType: normalizedProjectType, // governance-allow-direct-name-id
        supplierName: normalizeText(payload.supplierName) || null,
      },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'supervision_projects',
      {
        ...governedFields,
        supplierId: normalizedSupplierId,
      },
    );
    const normalizedGovernedFields = {
      ...governedFields,
      ...governedCanonicalIds,
    };
    const row = await prisma.supervision_projects.create({
      data: {
        actualEndAt: normalizeDate(payload.actualEndAt),
        actualStartAt: normalizeDate(payload.actualStartAt),
        location: normalizeText(payload.location) || null,
        plannedEndAt: normalizeDate(payload.plannedEndAt),
        plannedStartAt: normalizeDate(payload.plannedStartAt),
        progressPercent: normalizePercent(payload.progressPercent),
        projectName: normalizeText(payload.projectName),
        createdBy: context.userId || null,
        riskLevel: normalizeText(payload.riskLevel).toUpperCase() || 'LOW',
        stage: normalizeText(payload.stage) || null,
        status: normalizeProjectStatus(payload.status),
        summary: normalizeText(payload.summary) || null,
        ...normalizedGovernedFields,
        supervisor: normalizeText(payload.supervisor) || null,
        workOrderNumber: normalizeText(payload.workOrderNumber) || null,
      },
    });
    await auditSupervisionWrite({
      action: 'project-create',
      context,
      detailsVariables: { projectName: row.projectName },
      targetId: row.id,
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
    const keywordOr = buildKeywordOr(params.keyword, [
      'projectName',
      'projectType',
      'workOrderNumber',
      'supplierName',
    ] as const);
    if (keywordOr) Object.assign(where, keywordOr);

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

  async updateProject(
    id: string,
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    const normalizedParticipants =
      payload.participants === undefined
        ? undefined
        : stringifyList(payload.participants);
    const normalizedProjectType =
      payload.projectType === undefined
        ? undefined
        : normalizeProjectType(payload.projectType);
    const normalizedSupplierId =
      payload.supplierId === undefined
        ? undefined
        : normalizeText(payload.supplierId) || null;
    const governedFields = buildGovernedWriteFieldsForTable(
      'supervision_projects',
      {
        participants: normalizedParticipants, // governance-allow-direct-name-id
        projectType: normalizedProjectType, // governance-allow-direct-name-id
        supplierName:
          payload.supplierName === undefined
            ? undefined
            : normalizeText(payload.supplierName) || null,
      },
    );
    const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'supervision_projects',
      {
        ...governedFields,
        supplierId: normalizedSupplierId,
      },
    );
    const normalizedGovernedFields = {
      ...governedFields,
      ...governedCanonicalIds,
    };
    const accessWhere = buildSupervisionAccessWhere('project', context);
    const current = await prisma.supervision_projects.findFirst({
      select: { id: true, progressPercent: true, status: true },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', '监造项目不存在', 404);
    }

    const nextStatus =
      payload.status === undefined
        ? undefined
        : normalizeProjectStatus(payload.status);
    if (nextStatus !== undefined) {
      assertSupervisionProjectTransition(current.status, nextStatus);
    }

    const data = {
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
      riskLevel:
        payload.riskLevel === undefined
          ? undefined
          : normalizeText(payload.riskLevel).toUpperCase() || 'LOW',
      stage:
        payload.stage === undefined
          ? undefined
          : normalizeText(payload.stage) || null,
      status: payload.status === undefined ? undefined : nextStatus,
      summary:
        payload.summary === undefined
          ? undefined
          : normalizeText(payload.summary) || null,
      ...normalizedGovernedFields,
      supervisor:
        payload.supervisor === undefined
          ? undefined
          : normalizeText(payload.supervisor) || null,
      workOrderNumber:
        payload.workOrderNumber === undefined
          ? undefined
          : normalizeText(payload.workOrderNumber) || null,
    };
    const result = await prisma.supervision_projects.updateMany({
      data,
      // CAS on the current status so two concurrent editors cannot both pass
      // their pre-read transition check.
      where: { id, isDeleted: false, status: current.status, ...accessWhere },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('监造项目状态已变化，请刷新后重试');
    }
    const progressChanged =
      payload.progressPercent !== undefined &&
      normalizePercent(payload.progressPercent) !== current.progressPercent;
    if (progressChanged) {
      // Progress and status are coupled: recalc the derived status so
      // `progress=100 / status=PLANNED` contradictions cannot persist.
      await syncSupervisionProjectProgress(id);
    }
    const row = await prisma.supervision_projects.findFirst({
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!row) {
      throw new BusinessError('NOT_FOUND', '监造项目不存在', 404);
    }
    await auditSupervisionWrite({
      action: 'project-update',
      context,
      detailsVariables: {
        projectName: String(payload.projectName ?? current.id ?? ''),
        status: String(nextStatus ?? ''),
      },
      targetId: id,
    });
    return mapProject(row);
  },

  async deleteProject(id: string, context: SupervisionAccessContext) {
    const accessWhere = buildSupervisionAccessWhere('project', context);
    const current = await prisma.supervision_projects.findFirst({
      select: { status: true },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', '监造项目不存在', 404);
    }
    const result = await prisma.supervision_projects.updateMany({
      data: { isDeleted: true },
      // Completed projects are immutable business records and must not be
      // soft-deleted; the status guard also acts as a CAS on the delete.
      where: {
        id,
        isDeleted: false,
        status: { not: 'COMPLETED' },
        ...accessWhere,
      },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('已完成监造项目不可删除');
    }
    await auditSupervisionWrite({
      action: 'project-delete',
      context,
      detailsVariables: { projectName: '' },
      targetId: id,
    });
  },
};
