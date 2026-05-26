import type { after_sales_claimStatus } from '@prisma/client';

const AFTER_SALES_CLAIM_STATUS_VALUES = new Set<string>([
  'CANCELLED',
  'CLOSED',
  'COMPLETED',
  'IN_PROGRESS',
  'NEGOTIATING',
  'OPEN',
  'RESOLVED',
  'SUBMITTED',
]);

export function isAfterSalesClaimStatus(
  value: string,
): value is after_sales_claimStatus {
  return AFTER_SALES_CLAIM_STATUS_VALUES.has(value);
}

export function normalizeAfterSalesClaimStatus(
  value: unknown,
): after_sales_claimStatus | undefined {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return isAfterSalesClaimStatus(normalized) ? normalized : undefined;
}
