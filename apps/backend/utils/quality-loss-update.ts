import type { Prisma } from '@prisma/client';
import type { QualityLossSource } from '~/utils/quality-loss-status';

import {
  normalizeQualityLossUpdateText,
  parseQualityLossUpdateBody,
} from '@qgs/domain';
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

function parseSerialFromPrefixedId(
  value: string,
  prefix: string,
): null | number {
  if (!value.startsWith(prefix)) {
    return null;
  }
  const serial = Number.parseInt(value.slice(prefix.length), 10);
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }
  return serial;
}

export { normalizeQualityLossUpdateText, parseQualityLossUpdateBody };
export { parseOptionalFiniteNumber } from '@qgs/domain';
export { parseQualityLossOptionalDate as parseQualityLossUpdateDate } from '@qgs/domain';

export async function resolveQualityLossUpdateTarget(params: {
  client: SourceLookupClient;
  pathId: string;
  pk: unknown;
  source: QualityLossSource;
}): Promise<ResolveTargetResult> {
  const { client, pathId, pk, source } = params;
  const identifier =
    normalizeQualityLossUpdateText(pk) ||
    normalizeQualityLossUpdateText(pathId);

  if (source === QUALITY_LOSS_SOURCE.MANUAL) {
    if (pathId.startsWith('QL-')) {
      return {
        source: QUALITY_LOSS_SOURCE.MANUAL,
        valid: true,
        where: { lossId: pathId },
      };
    }
    return {
      source: QUALITY_LOSS_SOURCE.MANUAL,
      valid: true,
      where: { id: identifier },
    };
  }

  if (!identifier) {
    return { valid: false, message: '缺少目标记录ID' };
  }

  if (
    source === QUALITY_LOSS_SOURCE.INTERNAL &&
    (identifier.startsWith('EXT-') ||
      identifier.startsWith('DA-') ||
      pathId.startsWith('EXT-') ||
      pathId.startsWith('DA-'))
  ) {
    return { valid: false, message: '内部损失来源与目标ID不匹配' };
  }
  if (
    source === QUALITY_LOSS_SOURCE.EXTERNAL &&
    (identifier.startsWith('INT-') ||
      identifier.startsWith('DA-') ||
      pathId.startsWith('INT-') ||
      pathId.startsWith('DA-'))
  ) {
    return { valid: false, message: '外部损失来源与目标ID不匹配' };
  }
  if (
    source === QUALITY_LOSS_SOURCE.COMMISSIONING &&
    (identifier.startsWith('INT-') ||
      identifier.startsWith('EXT-') ||
      pathId.startsWith('INT-') ||
      pathId.startsWith('EXT-'))
  ) {
    return { valid: false, message: '调试验收来源与目标ID不匹配' };
  }

  if (source === QUALITY_LOSS_SOURCE.INTERNAL) {
    const serial = parseSerialFromPrefixedId(identifier, 'INT-');
    if (serial !== null) {
      const row = await client.quality_records.findFirst({
        where: { serialNumber: serial },
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
      where: { id: identifier },
    };
  }

  if (source === QUALITY_LOSS_SOURCE.COMMISSIONING) {
    const row = await client.vehicle_commissioning_issues.findFirst({
      where: { id: identifier },
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

  const serial = parseSerialFromPrefixedId(identifier, 'EXT-');
  if (serial !== null) {
    const row = await client.after_sales.findFirst({
      where: { serialNumber: serial },
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
    where: { id: identifier },
  };
}
