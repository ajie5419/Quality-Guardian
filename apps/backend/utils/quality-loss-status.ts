import type {
  after_sales_claimStatus,
  quality_records_status,
} from '@prisma/client';

export type UnifiedQualityLossStatus =
  | 'Confirmed'
  | 'Pending'
  | 'Processing'
  | 'Resolved';

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
