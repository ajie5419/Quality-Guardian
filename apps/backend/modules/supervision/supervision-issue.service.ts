import type {
  SupervisionIssue,
  SupervisionIssueAction,
  SupervisionIssueParams,
} from '@qgs/shared';

import type { SupervisionAccessContext } from './supervision-access';

import { safeNumber, tryParsePhotos } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';

import { buildSupervisionAccessWhere } from './supervision-access';
import { auditSupervisionWrite } from './supervision-audit';
import {
  normalizeDate,
  normalizeIssueStatus,
  normalizeText,
  parseList,
  prisma,
  stringifyList,
} from './supervision-shared';
import {
  assertSupervisionIssueTransition,
  throwSupervisionConflict,
} from './supervision-state';

function mapIssue(row: any) {
  return {
    affectsProgress: Boolean(row.affectsProgress),
    closedAt: row.closedAt ? row.closedAt.toISOString() : '',
    correctiveAction: row.correctiveAction || '',
    createdAt: row.createdAt?.toISOString(),
    createdBy: row.createdBy || '',
    description: row.description || '',
    dueAt: row.dueAt ? row.dueAt.toISOString() : '',
    estimatedLoss: safeNumber(row.estimatedLoss),
    id: row.id,
    isClaim: Boolean(row.isClaim),
    issueNo: row.issueNo,
    issueType: row.issueType || 'QUALITY',
    photos: tryParsePhotos(row.photos),
    projectId: row.projectId,
    projectName: row.project?.projectName || '',
    rectificationPhotos: tryParsePhotos(row.rectificationPhotos),
    responsibleUnit: row.responsibleUnit || '',
    severity: row.severity || 'minor',
    status: normalizeIssueStatus(row.status) as SupervisionIssue['status'],
    taskId: row.taskId || '',
    updatedAt: row.updatedAt?.toISOString(),
    verifyResult: row.verifyResult || '',
  } satisfies SupervisionIssue;
}

function mapIssueAction(row: any) {
  return {
    actionType: row.actionType,
    attachments: parseList(row.attachments),
    createdAt: row.createdAt?.toISOString(),
    createdBy: row.createdBy || '',
    description: row.description || '',
    id: row.id,
    issueId: row.issueId,
  } satisfies SupervisionIssueAction;
}

async function generateIssueNo() {
  const prefix = `SP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
  const count = await prisma.supervision_issues.count({
    where: { issueNo: { startsWith: prefix } },
  });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function resolveIssueClosedAt(
  status: string | undefined,
): Date | null | undefined {
  if (status === undefined) return undefined;
  return status === 'CLOSED' ? new Date() : null;
}

export const SupervisionIssueService = {
  async createIssue(
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    const status = normalizeIssueStatus(payload.status);
    const projectId = normalizeText(payload.projectId);
    const project = await prisma.supervision_projects.findFirst({
      select: { id: true },
      where: {
        id: projectId,
        isDeleted: false,
        ...buildSupervisionAccessWhere('project', context),
      },
    });
    if (!project) {
      throw new BusinessError('NOT_FOUND', '监造项目不存在', 404);
    }
    const taskId = normalizeText(payload.taskId);
    if (taskId) {
      const task = await prisma.supervision_plan_tasks.findFirst({
        select: { id: true },
        where: {
          id: taskId,
          isDeleted: false,
          projectId,
          ...buildSupervisionAccessWhere('task', context),
        },
      });
      if (!task) {
        throw new BusinessError('NOT_FOUND', '监造任务不存在', 404);
      }
    }
    const normalizedIssueType =
      normalizeText(payload.issueType).toUpperCase() || 'QUALITY';
    const governedIssueFields = buildGovernedWriteFieldsForTable(
      'supervision_issues',
      {
        issueType: normalizedIssueType, // governance-allow-direct-name-id
      },
    );
    const governedIssueCanonicalIds =
      await buildGovernedCanonicalWritePairForTable('supervision_issues', {
        issueType:
          governedIssueFields.issueType === undefined
            ? normalizedIssueType
            : governedIssueFields.issueType,
      });
    const row = await prisma.supervision_issues.create({
      data: {
        affectsProgress: Boolean(payload.affectsProgress),
        closedAt: status === 'CLOSED' ? new Date() : null,
        correctiveAction: normalizeText(payload.correctiveAction) || null,
        createdBy: context.userId || null,
        description: normalizeText(payload.description),
        dueAt: normalizeDate(payload.dueAt),
        estimatedLoss: safeNumber(payload.estimatedLoss),
        isClaim: Boolean(payload.isClaim),
        issueNo: await generateIssueNo(),
        issueType: normalizedIssueType, // governance-allow-direct-name-id
        ...governedIssueFields,
        ...governedIssueCanonicalIds,
        photos: stringifyList(payload.photos),
        projectId,
        rectificationPhotos: stringifyList(payload.rectificationPhotos),
        responsibleUnit: normalizeText(payload.responsibleUnit) || null,
        severity: normalizeText(payload.severity) || 'minor',
        status,
        taskId: taskId || null,
        verifyResult: normalizeText(payload.verifyResult) || null,
      },
      include: { project: { select: { projectName: true } } },
    });
    await auditSupervisionWrite({
      action: 'issue-create',
      context,
      detailsVariables: { issueNo: row.issueNo },
      targetId: row.id,
    });
    return mapIssue(row);
  },

  async createIssueAction(
    issueId: string,
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    return prisma.$transaction(async (tx) => {
      const accessWhere = buildSupervisionAccessWhere('issue', context);
      const current = await tx.supervision_issues.findFirst({
        select: { id: true, status: true },
        where: { id: issueId, isDeleted: false, ...accessWhere },
      });
      if (!current) {
        throw new BusinessError('NOT_FOUND', '监造问题不存在', 404);
      }
      const actionType =
        normalizeText(payload.actionType).toUpperCase() || 'FOLLOW_UP';
      const governedActionFields = buildGovernedWriteFieldsForTable(
        'supervision_issue_actions',
        {
          actionType,
        },
      );
      const governedActionCanonicalIds =
        await buildGovernedCanonicalWritePairForTable(
          'supervision_issue_actions',
          {
            actionType:
              governedActionFields.actionType === undefined
                ? actionType
                : governedActionFields.actionType,
          },
        );
      const row = await tx.supervision_issue_actions.create({
        data: {
          actionType,
          ...governedActionFields,
          ...governedActionCanonicalIds,
          attachments: stringifyList(payload.attachments),
          createdBy: context.userId || null,
          description: normalizeText(payload.description) || null,
          issueId,
        },
      });

      const updateData: any = {};
      if (payload.status !== undefined) {
        const nextStatus = normalizeIssueStatus(payload.status);
        assertSupervisionIssueTransition(current.status, nextStatus);
        updateData.status = nextStatus;
        updateData.closedAt = nextStatus === 'CLOSED' ? new Date() : null;
      }
      if (payload.rectificationPhotos !== undefined) {
        updateData.rectificationPhotos = stringifyList(
          payload.rectificationPhotos,
        );
      }
      if (payload.verifyResult !== undefined) {
        updateData.verifyResult = normalizeText(payload.verifyResult) || null;
      }
      if (Object.keys(updateData).length > 0) {
        const result = await tx.supervision_issues.updateMany({
          data: updateData,
          where: {
            id: issueId,
            isDeleted: false,
            status: current.status,
            ...accessWhere,
          },
        });
        if (result.count !== 1) {
          throwSupervisionConflict('监造问题状态已变化，请刷新后重试');
        }
      }
      await auditSupervisionWrite({
        action: 'issue-update',
        context,
        detailsVariables: {
          issueNo: String(payload.issueNo ?? ''),
          status: String(payload.status ?? ''),
        },
        targetId: issueId,
      });
      return mapIssueAction(row);
    });
  },

  async listIssueActions(issueId: string) {
    const rows = await prisma.supervision_issue_actions.findMany({
      orderBy: { createdAt: 'desc' },
      where: { issueId },
    });
    return rows.map((row) => mapIssueAction(row));
  },

  async listIssues(params: SupervisionIssueParams) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Number(params.pageSize || 20));
    const where: any = { isDeleted: false };
    if (params.projectId) where.projectId = params.projectId;
    if (params.issueType)
      where.issueType = String(params.issueType).toUpperCase();
    if (params.status) where.status = normalizeIssueStatus(params.status);
    const [items, total] = await Promise.all([
      prisma.supervision_issues.findMany({
        include: { project: { select: { projectName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.supervision_issues.count({ where }),
    ]);
    return { items: items.map((item) => mapIssue(item)), total };
  },

  async updateIssue(
    id: string,
    payload: Record<string, unknown>,
    context: SupervisionAccessContext,
  ) {
    const status =
      payload.status === undefined
        ? undefined
        : normalizeIssueStatus(payload.status);
    const normalizedIssueType =
      payload.issueType === undefined
        ? undefined
        : normalizeText(payload.issueType).toUpperCase() || 'QUALITY';
    const governedIssueFields = buildGovernedWriteFieldsForTable(
      'supervision_issues',
      {
        issueType: normalizedIssueType, // governance-allow-direct-name-id
      },
    );
    const governedIssueCanonicalIds =
      await buildGovernedCanonicalWritePairForTable('supervision_issues', {
        issueType:
          governedIssueFields.issueType === undefined
            ? normalizedIssueType
            : governedIssueFields.issueType,
      });
    const normalizedIssuePayload = {
      ...governedIssueFields,
      ...governedIssueCanonicalIds,
    };
    const accessWhere = buildSupervisionAccessWhere('issue', context);
    const current = await prisma.supervision_issues.findFirst({
      select: { id: true, status: true },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', '监造问题不存在', 404);
    }
    if (status !== undefined) {
      assertSupervisionIssueTransition(current.status, status);
    }

    const data = {
      affectsProgress:
        payload.affectsProgress === undefined
          ? undefined
          : Boolean(payload.affectsProgress),
      closedAt: status === undefined ? undefined : resolveIssueClosedAt(status),
      correctiveAction:
        payload.correctiveAction === undefined
          ? undefined
          : normalizeText(payload.correctiveAction) || null,
      description:
        payload.description === undefined
          ? undefined
          : normalizeText(payload.description),
      dueAt:
        payload.dueAt === undefined ? undefined : normalizeDate(payload.dueAt),
      estimatedLoss:
        payload.estimatedLoss === undefined
          ? undefined
          : safeNumber(payload.estimatedLoss),
      isClaim:
        payload.isClaim === undefined ? undefined : Boolean(payload.isClaim),
      ...normalizedIssuePayload,
      photos:
        payload.photos === undefined
          ? undefined
          : stringifyList(payload.photos),
      rectificationPhotos:
        payload.rectificationPhotos === undefined
          ? undefined
          : stringifyList(payload.rectificationPhotos),
      responsibleUnit:
        payload.responsibleUnit === undefined
          ? undefined
          : normalizeText(payload.responsibleUnit) || null,
      severity:
        payload.severity === undefined
          ? undefined
          : normalizeText(payload.severity) || 'minor',
      status,
      verifyResult:
        payload.verifyResult === undefined
          ? undefined
          : normalizeText(payload.verifyResult) || null,
    };
    const result = await prisma.supervision_issues.updateMany({
      data,
      where: { id, isDeleted: false, status: current.status, ...accessWhere },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('监造问题状态已变化，请刷新后重试');
    }
    const row = await prisma.supervision_issues.findFirst({
      include: { project: { select: { projectName: true } } },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!row) {
      throw new BusinessError('NOT_FOUND', '监造问题不存在', 404);
    }
    await auditSupervisionWrite({
      action: 'issue-update',
      context,
      detailsVariables: {
        issueNo: String(payload.issueNo ?? ''),
        status: String(status ?? ''),
      },
      targetId: id,
    });
    return mapIssue(row);
  },

  async deleteIssue(id: string, context: SupervisionAccessContext) {
    const accessWhere = buildSupervisionAccessWhere('issue', context);
    const current = await prisma.supervision_issues.findFirst({
      select: { status: true },
      where: { id, isDeleted: false, ...accessWhere },
    });
    if (!current) {
      throw new BusinessError('NOT_FOUND', '监造问题不存在', 404);
    }
    const result = await prisma.supervision_issues.updateMany({
      data: { isDeleted: true },
      // Closed issues are immutable business records.
      where: {
        id,
        isDeleted: false,
        status: { not: 'CLOSED' },
        ...accessWhere,
      },
    });
    if (result.count !== 1) {
      throwSupervisionConflict('已关闭监造问题不可删除');
    }
    await auditSupervisionWrite({
      action: 'issue-delete',
      context,
      detailsVariables: { issueNo: '' },
      targetId: id,
    });
  },
};
