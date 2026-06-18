import { parseQualityLossStatus } from './quality-loss-status';

const QUALITY_LOSS_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const QUALITY_LOSS_ID_SIZE = 6;

function createQualityLossIdSuffix(size = QUALITY_LOSS_ID_SIZE) {
  let output = '';
  for (let index = 0; index < size; index += 1) {
    const randomIndex = Math.floor(
      Math.random() * QUALITY_LOSS_ID_ALPHABET.length,
    );
    output += QUALITY_LOSS_ID_ALPHABET[randomIndex];
  }
  return output;
}

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
  return `QL-${now.getFullYear()}-${createQualityLossIdSuffix()}`;
}

export function buildQualityLossCreateData(
  body: Record<string, unknown>,
  lossId: string,
  options: { createdBy?: string } = {},
) {
  return {
    actualClaim: parseQualityLossNumber(body.actualClaim, 0),
    amount: parseQualityLossNumber(body.amount, 0),
    description: body.description as null | string | undefined,
    isDeleted: false,
    lossId,
    occurDate: parseQualityLossDate(body.date),
    respDept: (body.responsibleDepartment as null | string | undefined) || null,
    status:
      parseQualityLossStatus(body.status as string | undefined) || 'Pending',
    type: String(body.type || ''),
    createdBy: options.createdBy || null,
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
