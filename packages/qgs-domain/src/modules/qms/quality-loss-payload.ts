import { normalizeQualityLossStatus } from './quality-loss-status';

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

export function buildQualityLossCreateData(
  body: Record<string, unknown>,
  lossId: string,
) {
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

export function buildQualityLossCreateResponse<
  T extends {
    lossId: string;
    occurDate: Date;
    respDept: null | string;
  },
>(item: T) {
  return {
    ...item,
    date: item.occurDate.toISOString().split('T')[0],
    id: item.lossId,
    responsibleDepartment: item.respDept,
  };
}
