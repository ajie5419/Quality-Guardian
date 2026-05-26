import type { QualityLossSource } from '~/modules/quality-loss/quality-loss-status';

import { Prisma } from '@prisma/client';
import { resolveQualityLossTargetLocator } from '@qgs/shared';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import {
  normalizeQualityLossSource,
  QUALITY_LOSS_SOURCE,
  toQualityLossTargetType,
} from '~/modules/quality-loss/quality-loss-status';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
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

export const QualityLossRouteUpdateService = {
  async updateByRouteId(params: {
    body: Record<string, unknown>;
    id: string;
    userId: string;
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

    try {
      switch (target.source) {
        case QUALITY_LOSS_SOURCE.COMMISSIONING: {
          await VehicleCommissioningService.updateQualityLossFields({
            id: target.id,
            amount: parsedBody.amount,
            actualClaim: parsedBody.actualClaim,
            status: parsedBody.status,
          });
          break;
        }
        case QUALITY_LOSS_SOURCE.EXTERNAL: {
          await AfterSalesService.updateQualityLossFields({
            id: target.id,
            actualClaim: parsedBody.actualClaim,
            status: parsedBody.status,
          });
          break;
        }
        case QUALITY_LOSS_SOURCE.INTERNAL: {
          await InspectionService.updateQualityLossFields({
            id: target.id,
            actualClaim: parsedBody.actualClaim,
            status: parsedBody.status,
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
