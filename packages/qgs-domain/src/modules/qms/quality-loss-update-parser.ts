import { normalizeQualityLossStatus } from './quality-loss-status';

type ParseOptionalFiniteNumberResult =
  | { message: string; valid: false }
  | { valid: true; value?: number };

type ParseOptionalDateResult =
  | { message: string; valid: false }
  | { valid: true; value?: Date };

export type QualityLossUpdateParseResult =
  | {
      actualClaim?: number;
      amount?: number;
      occurDate?: Date;
      respDept?: string;
      status?: ReturnType<typeof normalizeQualityLossStatus>;
      type?: string;
      valid: true;
    }
  | {
      message: string;
      valid: false;
    };

export function normalizeQualityLossUpdateText(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseOptionalFiniteNumber(
  value: unknown,
  fieldName: string,
): ParseOptionalFiniteNumberResult {
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return { valid: false, message: `${fieldName} 格式无效` };
  }
  return { valid: true, value: parsed };
}

export function parseQualityLossOptionalDate(
  value: unknown,
): ParseOptionalDateResult {
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
): QualityLossUpdateParseResult {
  const actualClaim = parseOptionalFiniteNumber(
    body.actualClaim,
    'actualClaim',
  );
  if (!actualClaim.valid) return actualClaim;

  const amount = parseOptionalFiniteNumber(body.amount, 'amount');
  if (!amount.valid) return amount;

  const occurDate = parseQualityLossOptionalDate(body.date);
  if (!occurDate.valid) return occurDate;

  const statusText = normalizeQualityLossUpdateText(body.status);
  const status = statusText
    ? normalizeQualityLossStatus(statusText)
    : undefined;
  const type = normalizeQualityLossUpdateText(body.type) || undefined;
  const respDept =
    normalizeQualityLossUpdateText(body.responsibleDepartment) || undefined;

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
