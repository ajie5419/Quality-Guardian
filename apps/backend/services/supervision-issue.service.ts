import type {
  SupervisionIssue,
  SupervisionIssueAction,
  SupervisionIssueParams,
} from '@qgs/shared';

import { safeNumber, tryParsePhotos } from '@qgs/shared';

import {
  normalizeDate,
  normalizeIssueStatus,
  normalizeText,
  parseList,
  prisma,
  stringifyList,
} from './supervision-shared';

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

export const SupervisionIssueService = {
  async createIssue(payload: Record<string, unknown>, operatorUserId?: string) {
    const status = normalizeIssueStatus(payload.status);
    const row = await prisma.supervision_issues.create({
      data: {
        affectsProgress: Boolean(payload.affectsProgress),
        closedAt: status === 'CLOSED' ? new Date() : null,
        correctiveAction: normalizeText(payload.correctiveAction) || null,
        createdBy: operatorUserId || null,
        description: normalizeText(payload.description),
        dueAt: normalizeDate(payload.dueAt),
        estimatedLoss: safeNumber(payload.estimatedLoss),
        isClaim: Boolean(payload.isClaim),
        issueNo: await generateIssueNo(),
        issueType: normalizeText(payload.issueType).toUpperCase() || 'QUALITY',
        photos: stringifyList(payload.photos),
        projectId: normalizeText(payload.projectId),
        rectificationPhotos: stringifyList(payload.rectificationPhotos),
        responsibleUnit: normalizeText(payload.responsibleUnit) || null,
        severity: normalizeText(payload.severity) || 'minor',
        status,
        taskId: normalizeText(payload.taskId) || null,
        verifyResult: normalizeText(payload.verifyResult) || null,
      },
      include: { project: { select: { projectName: true } } },
    });
    return mapIssue(row);
  },

  async createIssueAction(
    issueId: string,
    payload: Record<string, unknown>,
    operatorUserId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const actionType =
        normalizeText(payload.actionType).toUpperCase() || 'FOLLOW_UP';
      const row = await tx.supervision_issue_actions.create({
        data: {
          actionType,
          attachments: stringifyList(payload.attachments),
          createdBy: operatorUserId || null,
          description: normalizeText(payload.description) || null,
          issueId,
        },
      });

      const updateData: any = {};
      if (payload.status !== undefined) {
        updateData.status = normalizeIssueStatus(payload.status);
        updateData.closedAt =
          updateData.status === 'CLOSED' ? new Date() : null;
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
        await tx.supervision_issues.update({
          data: updateData,
          where: { id: issueId },
        });
      }
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

  async updateIssue(id: string, payload: Record<string, unknown>) {
    const status =
      payload.status === undefined
        ? undefined
        : normalizeIssueStatus(payload.status);
    const row = await prisma.supervision_issues.update({
      data: {
        affectsProgress:
          payload.affectsProgress === undefined
            ? undefined
            : Boolean(payload.affectsProgress),
        closedAt: status === 'CLOSED' ? new Date() : undefined,
        correctiveAction:
          payload.correctiveAction === undefined
            ? undefined
            : normalizeText(payload.correctiveAction) || null,
        description:
          payload.description === undefined
            ? undefined
            : normalizeText(payload.description),
        dueAt:
          payload.dueAt === undefined
            ? undefined
            : normalizeDate(payload.dueAt),
        estimatedLoss:
          payload.estimatedLoss === undefined
            ? undefined
            : safeNumber(payload.estimatedLoss),
        isClaim:
          payload.isClaim === undefined ? undefined : Boolean(payload.isClaim),
        issueType:
          payload.issueType === undefined
            ? undefined
            : normalizeText(payload.issueType).toUpperCase() || 'QUALITY',
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
      },
      include: { project: { select: { projectName: true } } },
      where: { id },
    });
    return mapIssue(row);
  },
};
