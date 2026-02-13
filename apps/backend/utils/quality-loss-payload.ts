import type { Prisma, quality_losses } from '@prisma/client';

import { nanoid } from 'nanoid';
import { normalizeQualityLossStatus } from '~/utils/quality-loss-status';

function parseQualityLossNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseQualityLossDate(value: unknown): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function createQualityLossId(now = new Date()): string {
  return `QL-${now.getFullYear()}-${nanoid(6).toUpperCase()}`;
}

export function buildQualityLossCreateData(
  body: Record<string, unknown>,
  lossId: string,
): Prisma.quality_lossesUncheckedCreateInput {
  return {
    actualClaim: parseQualityLossNumber(body.actualClaim, 0),
    amount: parseQualityLossNumber(body.amount, 0),
    description: body.description as null | string | undefined,
    isDeleted: false,
    lossId,
    occurDate: parseQualityLossDate(body.date),
    respDept: (body.responsibleDepartment as null | string | undefined) || null,
    status: normalizeQualityLossStatus(
      (body.status as string | undefined) || 'Pending',
    ),
    type: String(body.type || ''),
  };
}

export function buildQualityLossCreateResponse(item: quality_losses) {
  return {
    ...item,
    date: item.occurDate.toISOString().split('T')[0],
    id: item.lossId,
    responsibleDepartment: item.respDept,
  };
}
