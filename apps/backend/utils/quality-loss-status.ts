import type {
  after_sales_claimStatus,
  quality_records_status,
} from '@prisma/client';

export type UnifiedQualityLossStatus =
  | 'Confirmed'
  | 'Pending'
  | 'Processing'
  | 'Resolved';

export type QualityLossSource = 'External' | 'Internal' | 'Manual';

export const QUALITY_LOSS_SOURCE = {
  EXTERNAL: 'External',
  INTERNAL: 'Internal',
  MANUAL: 'Manual',
} as const;

export function normalizeQualityLossStatus(
  status: null | string | undefined,
): UnifiedQualityLossStatus {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();

  if (['CLOSED', 'COMPLETED', 'CONFIRMED'].includes(normalized)) {
    return 'Confirmed';
  }
  if (
    [
      'CLAIMING',
      'IN_PROGRESS',
      'NEGOTIATING',
      'PROCESSING',
      'SUBMITTED',
    ].includes(normalized)
  ) {
    return 'Processing';
  }
  if (normalized === 'RESOLVED') {
    return 'Resolved';
  }
  return 'Pending';
}

export function toAfterSalesClaimStatus(
  status: null | string | undefined,
): after_sales_claimStatus {
  const unified = normalizeQualityLossStatus(status);
  if (unified === 'Confirmed') return 'COMPLETED';
  if (unified === 'Processing') return 'IN_PROGRESS';
  if (unified === 'Resolved') return 'RESOLVED';
  return 'OPEN';
}

export function toQualityRecordStatus(
  status: null | string | undefined,
): quality_records_status {
  const unified = normalizeQualityLossStatus(status);
  if (unified === 'Confirmed') return 'CLOSED';
  if (unified === 'Processing') return 'IN_PROGRESS';
  if (unified === 'Resolved') return 'RESOLVED';
  return 'OPEN';
}

export function normalizeQualityLossSource(
  source: null | string | undefined,
): QualityLossSource {
  const normalized = String(source || '')
    .trim()
    .toUpperCase();
  if (normalized === 'INTERNAL') return QUALITY_LOSS_SOURCE.INTERNAL;
  if (normalized === 'EXTERNAL') return QUALITY_LOSS_SOURCE.EXTERNAL;
  return QUALITY_LOSS_SOURCE.MANUAL;
}

export function toQualityLossTargetType(
  source: QualityLossSource,
): 'after_sales' | 'inspection_issue' | 'quality_loss' {
  if (source === QUALITY_LOSS_SOURCE.INTERNAL) return 'inspection_issue';
  if (source === QUALITY_LOSS_SOURCE.EXTERNAL) return 'after_sales';
  return 'quality_loss';
}
