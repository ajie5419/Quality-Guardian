import type { Prisma } from '@prisma/client';
import type { QualityLossSource } from '~/utils/quality-loss-status';

import { resolveQualityLossTargetLocator } from '@qgs/domain';
import { QUALITY_LOSS_SOURCE } from '~/utils/quality-loss-status';

type SourceLookupClient = {
  after_sales: {
    findFirst(args: {
      select: { id: true };
      where: { serialNumber: number };
    }): Promise<null | { id: string }>;
  };
  quality_records: {
    findFirst(args: {
      select: { id: true };
      where: { serialNumber: number };
    }): Promise<null | { id: string }>;
  };
  vehicle_commissioning_issues: {
    findFirst(args: {
      select: { id: true };
      where: { id: string };
    }): Promise<null | { id: string }>;
  };
};

type ResolveTargetResult =
  | {
      message: string;
      valid: false;
    }
  | {
      source: 'Commissioning';
      valid: true;
      where: Prisma.vehicle_commissioning_issuesWhereUniqueInput;
    }
  | {
      source: 'External';
      valid: true;
      where: Prisma.after_salesWhereUniqueInput;
    }
  | {
      source: 'Internal';
      valid: true;
      where: Prisma.quality_recordsWhereUniqueInput;
    }
  | {
      source: 'Manual';
      valid: true;
      where: Prisma.quality_lossesWhereUniqueInput;
    };

export {
  normalizeQualityLossUpdateText,
  parseQualityLossUpdateBody,
} from '@qgs/domain';
export { parseOptionalFiniteNumber } from '@qgs/domain';
export { parseQualityLossOptionalDate as parseQualityLossUpdateDate } from '@qgs/domain';

export async function resolveQualityLossUpdateTarget(params: {
  client: SourceLookupClient;
  pathId: string;
  pk: unknown;
  source: QualityLossSource;
}): Promise<ResolveTargetResult> {
  const { client, pathId, pk, source } = params;
  const target = resolveQualityLossTargetLocator({ pathId, pk, source });
  if ('message' in target) {
    return { valid: false, message: target.message };
  }

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
    if (target.serial !== null) {
      const row = await client.quality_records.findFirst({
        where: { serialNumber: target.serial },
        select: { id: true },
      });
      if (!row) {
        return { valid: false, message: '内部质量记录不存在' };
      }
      return {
        source: QUALITY_LOSS_SOURCE.INTERNAL,
        valid: true,
        where: { id: row.id },
      };
    }
    return {
      source: QUALITY_LOSS_SOURCE.INTERNAL,
      valid: true,
      where: { id: target.identifier },
    };
  }

  if (target.lookup === 'commissioning') {
    const row = await client.vehicle_commissioning_issues.findFirst({
      where: { id: target.identifier },
      select: { id: true },
    });
    if (!row) {
      return { valid: false, message: '调试验收问题不存在' };
    }
    return {
      source: QUALITY_LOSS_SOURCE.COMMISSIONING,
      valid: true,
      where: { id: row.id },
    };
  }

  if (target.serial !== null) {
    const row = await client.after_sales.findFirst({
      where: { serialNumber: target.serial },
      select: { id: true },
    });
    if (!row) {
      return { valid: false, message: '外部售后记录不存在' };
    }
    return {
      source: QUALITY_LOSS_SOURCE.EXTERNAL,
      valid: true,
      where: { id: row.id },
    };
  }

  return {
    source: QUALITY_LOSS_SOURCE.EXTERNAL,
    valid: true,
    where: { id: target.identifier },
  };
}
