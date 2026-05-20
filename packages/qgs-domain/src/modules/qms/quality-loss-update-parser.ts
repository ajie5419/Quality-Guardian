import { normalizeQualityLossStatus } from './quality-loss-status';
import { QUALITY_LOSS_SOURCE, type QualityLossSource } from './quality-loss-status';

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

export type QualityLossTargetLocatorResult =
  | { message: string; valid: false }
  | {
      identifier: string;
      lookup: 'commissioning' | 'external' | 'internal' | 'manualId' | 'manualLossId';
      serial: null | number;
      source: QualityLossSource;
      valid: true;
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

export function parseSerialFromPrefixedId(
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

export function resolveQualityLossTargetLocator(params: {
  pathId: string;
  pk: unknown;
  source: QualityLossSource;
}): QualityLossTargetLocatorResult {
  const { pathId, pk, source } = params;
  const identifier =
    normalizeQualityLossUpdateText(pk) ||
    normalizeQualityLossUpdateText(pathId);

  if (source === QUALITY_LOSS_SOURCE.MANUAL) {
    if (pathId.startsWith('QL-')) {
      return {
        identifier: pathId,
        lookup: 'manualLossId',
        serial: null,
        source: QUALITY_LOSS_SOURCE.MANUAL,
        valid: true,
      };
    }
    return {
      identifier,
      lookup: 'manualId',
      serial: null,
      source: QUALITY_LOSS_SOURCE.MANUAL,
      valid: true,
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
    return {
      identifier,
      lookup: 'internal',
      serial: parseSerialFromPrefixedId(identifier, 'INT-'),
      source: QUALITY_LOSS_SOURCE.INTERNAL,
      valid: true,
    };
  }

  if (source === QUALITY_LOSS_SOURCE.COMMISSIONING) {
    return {
      identifier,
      lookup: 'commissioning',
      serial: null,
      source: QUALITY_LOSS_SOURCE.COMMISSIONING,
      valid: true,
    };
  }

  return {
    identifier,
    lookup: 'external',
    serial: parseSerialFromPrefixedId(identifier, 'EXT-'),
    source: QUALITY_LOSS_SOURCE.EXTERNAL,
    valid: true,
  };
}
