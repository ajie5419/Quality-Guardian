import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import { Prisma } from '@prisma/client';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { QUALITY_LOSS_SOURCE } from '~/modules/quality-loss/quality-loss-status';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type DeleteContext = {
  dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
  userId: string;
};

type ManualDeleteTarget = {
  createdBy: null | string;
  id: string;
  respDept: null | string;
};

async function resolveManualIdentifiers(ids: string[]) {
  const indexRows = await prisma.quality_loss_index.findMany({
    where: { id: { in: ids }, isDeleted: false },
    select: { id: true, source: true, sourcePk: true },
  });
  const nonManualRow = indexRows.find(
    (row) => row.source !== QUALITY_LOSS_SOURCE.MANUAL,
  );
  if (nonManualRow) {
    throw new BusinessError(
      'INVALID_SOURCE',
      '非手工质量损失记录请到源业务页面删除',
      400,
    );
  }

  const sourcePkByIndexId = new Map(
    indexRows.map((row) => [row.id, row.sourcePk]),
  );
  return ids.map((id) => sourcePkByIndexId.get(id) ?? id);
}

async function assertDeleteAccess(
  targets: ManualDeleteTarget[],
  context: DeleteContext,
) {
  const scopeType = context.dataScope?.scopeType ?? 'ALL';
  if (scopeType === 'ALL') return;

  if (scopeType === 'SELF') {
    if (targets.every((target) => target.createdBy === context.userId)) return;
    throw new BusinessError('FORBIDDEN', '无权删除他人的质量损失记录', 403);
  }

  const deptCandidates = await DataScopeService.getDeptCandidates(
    context.dataScope?.deptIds ?? [],
  );
  if (
    targets.every(
      (target) => target.respDept && deptCandidates.includes(target.respDept),
    )
  ) {
    return;
  }
  throw new BusinessError('FORBIDDEN', '无权删除其他部门的质量损失记录', 403);
}

export const QualityLossRecordMaintenanceService = {
  async deleteRecord(id: string, context: DeleteContext): Promise<void> {
    const [identifier] = await resolveManualIdentifiers([id]);
    if (!identifier) {
      throw new BusinessError('NOT_FOUND', '质量损失记录不存在', 404);
    }
    const target = await prisma.quality_losses.findFirst({
      where: {
        isDeleted: false,
        OR: [{ id: identifier }, { lossId: identifier }],
      },
      select: { createdBy: true, id: true, respDept: true },
    });

    if (!target) {
      throw new BusinessError('NOT_FOUND', '质量损失记录不存在', 404);
    }

    await assertDeleteAccess([target], context);
    // Keep the source row and its materialized projection consistent.
    const [result] = await prisma.$transaction([
      prisma.quality_losses.updateMany({
        where: { id: target.id, isDeleted: false },
        data: { isDeleted: true },
      }),
      prisma.quality_loss_index.updateMany({
        where: { source: QUALITY_LOSS_SOURCE.MANUAL, sourcePk: target.id },
        data: { isDeleted: true, indexedAt: new Date() },
      }),
    ]);
    if (result.count === 0) {
      throw new BusinessError('NOT_FOUND', '质量损失记录不存在', 404);
    }

    await SystemLogService.auditLog('quality-loss', 'delete', {
      userId: context.userId,
      targetId: target.id,
      detailsVariables: {},
    });
  },

  async batchDelete(
    ids: string[],
    context: DeleteContext,
  ): Promise<Prisma.BatchPayload> {
    const normalizedIds = [
      ...new Set(ids.map((item) => String(item).trim()).filter(Boolean)),
    ];
    if (normalizedIds.length === 0) return { count: 0 };
    const identifiers = await resolveManualIdentifiers(normalizedIds);

    const targets = await prisma.quality_losses.findMany({
      where: {
        isDeleted: false,
        OR: [{ id: { in: identifiers } }, { lossId: { in: identifiers } }],
      },
      select: { createdBy: true, id: true, respDept: true },
    });

    if (targets.length === 0) return { count: 0 };
    await assertDeleteAccess(targets, context);

    const targetIds = targets.map((target) => target.id);
    const [result] = await prisma.$transaction([
      prisma.quality_losses.updateMany({
        where: { id: { in: targetIds }, isDeleted: false },
        data: { isDeleted: true },
      }),
      prisma.quality_loss_index.updateMany({
        where: {
          source: QUALITY_LOSS_SOURCE.MANUAL,
          sourcePk: { in: targetIds },
        },
        data: { isDeleted: true, indexedAt: new Date() },
      }),
    ]);

    await SystemLogService.auditLog('quality-loss', 'batchDelete', {
      userId: context.userId,
      targetId: normalizedIds.join(','),
      detailsVariables: {
        count: result.count,
      },
    });

    return result;
  },

  async getDrillDown(start: Date, end: Date) {
    return prisma.quality_loss_index.findMany({
      where: {
        isDeleted: false,
        occurDate: { gte: start, lte: end },
      },
      orderBy: { occurDate: 'desc' },
      take: 2000,
    });
  },
};
