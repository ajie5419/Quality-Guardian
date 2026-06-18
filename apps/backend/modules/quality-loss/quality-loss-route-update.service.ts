import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';
import type { QualityLossSource } from '~/modules/quality-loss/quality-loss-status';

import { Prisma } from '@prisma/client';
import { resolveQualityLossTargetLocator } from '@qgs/shared';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import {
  normalizeQualityLossSource,
  QUALITY_LOSS_SOURCE,
  toQualityLossTargetType,
} from '~/modules/quality-loss/quality-loss-status';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';

import { parseQualityLossUpdateBody } from './quality-loss-update';

type QualityLossUpdateTarget =
  | { id: string; source: 'Commissioning'; valid: true }
  | { id: string; source: 'External'; valid: true }
  | { id: string; source: 'Internal'; valid: true }
  | { message: string; valid: false }
  | {
      source: 'Manual';
      valid: true;
      where: Prisma.quality_lossesWhereUniqueInput;
    };

async function resolveQualityLossUpdateTarget(params: {
  pathId: string;
  pk: unknown;
  source: QualityLossSource;
}): Promise<QualityLossUpdateTarget> {
  const target = resolveQualityLossTargetLocator(params);
  if ('message' in target) return { valid: false, message: target.message };

  if (target.lookup === 'manualLossId') {
    return {
      source: QUALITY_LOSS_SOURCE.MANUAL,
      valid: true,
      where: { lossId: target.identifier },
    };
  }
  if (target.lookup === 'manualId') {
    return {
      source: QUALITY_LOSS_SOURCE.MANUAL,
      valid: true,
      where: { id: target.identifier },
    };
  }
  if (target.lookup === 'internal') {
    if (target.serial === null) {
      return {
        source: QUALITY_LOSS_SOURCE.INTERNAL,
        valid: true,
        id: target.identifier,
      };
    }
    const id = await InspectionService.findIssueIdBySerialNumber(target.serial);
    return id
      ? { source: QUALITY_LOSS_SOURCE.INTERNAL, valid: true, id }
      : { valid: false, message: '内部质量记录不存在' };
  }
  if (target.lookup === 'commissioning') {
    const id = await VehicleCommissioningService.findIssueId(target.identifier);
    return id
      ? { source: QUALITY_LOSS_SOURCE.COMMISSIONING, valid: true, id }
      : { valid: false, message: '调试验收问题不存在' };
  }
  if (target.serial === null) {
    return {
      source: QUALITY_LOSS_SOURCE.EXTERNAL,
      valid: true,
      id: target.identifier,
    };
  }
  const id = await AfterSalesService.findIdBySerialNumber(target.serial);
  return id
    ? { source: QUALITY_LOSS_SOURCE.EXTERNAL, valid: true, id }
    : { valid: false, message: '外部售后记录不存在' };
}

async function loadOwnershipForTarget(
  target: Exclude<QualityLossUpdateTarget, { valid: false }>,
): Promise<null | {
  createdBy: null | string;
  responsibleDepartments: string[];
}> {
  if (target.source === QUALITY_LOSS_SOURCE.MANUAL) {
    const row = await prisma.quality_losses.findFirst({
      where: target.where,
      select: { createdBy: true, respDept: true },
    });
    if (!row) return null;
    return {
      createdBy: row.createdBy,
      responsibleDepartments: row.respDept ? [row.respDept] : [],
    };
  }
  if (target.source === QUALITY_LOSS_SOURCE.EXTERNAL) {
    const row = await prisma.after_sales.findUnique({
      where: { id: target.id },
      select: {
        createdBy: true,
        division: true,
        feedbackDept: true,
        respDept: true,
      },
    });
    if (!row) return null;
    return {
      createdBy: row.createdBy,
      responsibleDepartments: [
        row.respDept,
        row.feedbackDept,
        row.division,
      ].filter(Boolean),
    };
  }
  if (target.source === QUALITY_LOSS_SOURCE.INTERNAL) {
    const row = await prisma.quality_records.findUnique({
      where: { id: target.id },
      select: {
        createdBy: true,
        responsibleBU: true,
        responsibleDepartment: true,
      },
    });
    if (!row) return null;
    return {
      createdBy: row.createdBy,
      responsibleDepartments: [
        row.responsibleDepartment,
        row.responsibleBU,
      ].filter(Boolean),
    };
  }
  // Commissioning
  const row = await prisma.vehicle_commissioning_issues.findUnique({
    where: { id: target.id },
    select: { createdBy: true, responsibleDepartment: true },
  });
  if (!row) return null;
  return {
    createdBy: row.createdBy,
    responsibleDepartments: row.responsibleDepartment
      ? [row.responsibleDepartment]
      : [],
  };
}

async function assertOwnership(params: {
  dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
  target: Exclude<QualityLossUpdateTarget, { valid: false }>;
  userId: string;
}) {
  const scopeType = params.dataScope?.scopeType ?? 'ALL';
  if (scopeType === 'ALL') return;

  const ownership = await loadOwnershipForTarget(params.target);
  if (!ownership) {
    throw new BusinessError('NOT_FOUND', '目标记录不存在', 404);
  }

  if (scopeType === 'SELF') {
    if (ownership.createdBy && String(ownership.createdBy) === params.userId) {
      return;
    }
    throw new BusinessError('FORBIDDEN', '无权修改他人的质量损失记录', 403);
  }

  if (scopeType === 'DEPT') {
    const deptCandidates = await DataScopeService.getDeptCandidates(
      params.dataScope?.deptIds ?? [],
    );
    const inScope = ownership.responsibleDepartments.some((dept) =>
      deptCandidates.includes(dept),
    );
    if (!inScope) {
      throw new BusinessError('FORBIDDEN', '该记录不在你的数据权限范围内', 403);
    }
  }
}

export const QualityLossRouteUpdateService = {
  async updateByRouteId(params: {
    body: Record<string, unknown>;
    dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
    id: string;
    userId: string;
    username?: string;
  }) {
    const source = normalizeQualityLossSource(
      params.body.lossSource as string | undefined,
    );
    const parsedBody = parseQualityLossUpdateBody(params.body);
    if ('message' in parsedBody) {
      return {
        ok: false as const,
        code: 'BAD_REQUEST' as const,
        message: parsedBody.message,
      };
    }

    const target = await resolveQualityLossUpdateTarget({
      pathId: params.id,
      pk: params.body.pk,
      source,
    });
    if ('message' in target) {
      return {
        ok: false as const,
        code: 'BAD_REQUEST' as const,
        message: target.message,
      };
    }

    await assertOwnership({
      dataScope: params.dataScope,
      target,
      userId: params.userId,
    });

    if (
      target.source !== QUALITY_LOSS_SOURCE.MANUAL &&
      parsedBody.status !== undefined
    ) {
      return {
        ok: false as const,
        code: 'BAD_REQUEST' as const,
        message: '该来源的状态请回到对应业务页面修改',
      };
    }

    try {
      switch (target.source) {
        case QUALITY_LOSS_SOURCE.COMMISSIONING: {
          await VehicleCommissioningService.updateQualityLossFields({
            id: target.id,
            amount: parsedBody.amount,
            actualClaim: parsedBody.actualClaim,
          });
          break;
        }
        case QUALITY_LOSS_SOURCE.EXTERNAL: {
          await AfterSalesService.updateQualityLossFields({
            id: target.id,
            actualClaim: parsedBody.actualClaim,
          });
          break;
        }
        case QUALITY_LOSS_SOURCE.INTERNAL: {
          await InspectionService.updateQualityLossFields({
            id: target.id,
            actualClaim: parsedBody.actualClaim,
          });
          break;
        }
        default: {
          await prisma.$transaction(async (tx) => {
            await tx.quality_losses.update({
              where: target.where,
              data: {
                ...(parsedBody.occurDate
                  ? { occurDate: parsedBody.occurDate }
                  : {}),
                ...(parsedBody.type ? { type: parsedBody.type } : {}),
                ...(parsedBody.amount === undefined
                  ? {}
                  : { amount: parsedBody.amount }),
                ...(parsedBody.actualClaim === undefined
                  ? {}
                  : { actualClaim: parsedBody.actualClaim }),
                ...(parsedBody.respDept === undefined
                  ? {}
                  : { respDept: parsedBody.respDept }),
                ...(params.body.description === undefined
                  ? {}
                  : { description: params.body.description }),
                ...(parsedBody.status ? { status: parsedBody.status } : {}),
                updatedAt: new Date(),
              },
            });
          });
        }
      }
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return {
          ok: false as const,
          code: 'NOT_FOUND' as const,
          message: '目标记录不存在',
        };
      }
      const err = error as { message?: string };
      return {
        ok: false as const,
        code: 'INTERNAL' as const,
        message: `数据更新失败：${err.message || '数据库操作异常'}`,
      };
    }

    await SystemLogService.auditLog('quality-loss', 'relatedUpdate', {
      userId: params.userId,
      targetType: toQualityLossTargetType(source as QualityLossSource),
      targetId: String(params.id),
      detailsVariables: {
        id: params.id,
        sourcePart:
          source === QUALITY_LOSS_SOURCE.MANUAL ? '' : ` (${source} 来源)`,
      },
    });
    return { ok: true as const };
  },
};
