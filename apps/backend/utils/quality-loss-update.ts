import type { Prisma } from '@prisma/client';
import type {
  QualityLossSource,
  UnifiedQualityLossStatus,
} from '~/utils/quality-loss-status';

import {
  normalizeQualityLossStatus,
  QUALITY_LOSS_SOURCE,
} from '~/utils/quality-loss-status';

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
};

type ParseUpdateResult =
  | {
      actualClaim?: number;
      amount?: number;
      occurDate?: Date;
      respDept?: string;
      status?: UnifiedQualityLossStatus;
      type?: string;
      valid: true;
    }
  | {
      message: string;
      valid: false;
    };

type ResolveTargetResult =
  | {
      message: string;
      valid: false;
    }
  | {
      source: typeof QUALITY_LOSS_SOURCE.EXTERNAL;
      valid: true;
      where: Prisma.after_salesWhereUniqueInput;
    }
  | {
      source: typeof QUALITY_LOSS_SOURCE.INTERNAL;
      valid: true;
      where: Prisma.quality_recordsWhereUniqueInput;
    }
  | {
      source: typeof QUALITY_LOSS_SOURCE.MANUAL;
      valid: true;
      where: Prisma.quality_lossesWhereUniqueInput;
    };

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

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

function parseOptionalFiniteNumber(
  value: unknown,
  fieldName: string,
): { message: string; valid: false } | { valid: true; value?: number } {
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return { valid: false, message: `${fieldName} 格式无效` };
  }
  return { valid: true, value: parsed };
}

function parseOptionalDate(
  value: unknown,
): { message: string; valid: false } | { valid: true; value?: Date } {
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, message: 'date 格式无效' };
  }
  return { valid: true, value: parsed };
}

export function parseQualityLossUpdateBody(
  body: Record<string, unknown>,
): ParseUpdateResult {
  const actualClaim = parseOptionalFiniteNumber(
    body.actualClaim,
    'actualClaim',
  );
  if (!actualClaim.valid) return actualClaim;

  const amount = parseOptionalFiniteNumber(body.amount, 'amount');
  if (!amount.valid) return amount;

  const occurDate = parseOptionalDate(body.date);
  if (!occurDate.valid) return occurDate;

  const statusText = normalizeText(body.status);
  const status = statusText
    ? normalizeQualityLossStatus(statusText)
    : undefined;
  const type = normalizeText(body.type) || undefined;
  const respDept = normalizeText(body.responsibleDepartment) || undefined;

  return {
    actualClaim: actualClaim.value,
    amount: amount.value,
    occurDate: occurDate.value,
    respDept,
    status,
    type,
    valid: true,
  };
}

export async function resolveQualityLossUpdateTarget(params: {
  client: SourceLookupClient;
  pathId: string;
  pk: unknown;
  source: QualityLossSource;
}): Promise<ResolveTargetResult> {
  const { client, pathId, pk, source } = params;
  const identifier = normalizeText(pk) || normalizeText(pathId);

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
    (identifier.startsWith('EXT-') || pathId.startsWith('EXT-'))
  ) {
    return { valid: false, message: '内部损失来源与目标ID不匹配' };
  }
  if (
    source === QUALITY_LOSS_SOURCE.EXTERNAL &&
    (identifier.startsWith('INT-') || pathId.startsWith('INT-'))
  ) {
    return { valid: false, message: '外部损失来源与目标ID不匹配' };
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
