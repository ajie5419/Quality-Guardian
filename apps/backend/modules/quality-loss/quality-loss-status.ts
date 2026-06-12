import type {
  after_sales_claimStatus,
  quality_records_status,
} from '@prisma/client';
import type { QualityLossSource, UnifiedQualityLossStatus } from '@qgs/shared';

import {
  normalizeQualityLossSource as normalizeQualityLossSourceRule,
  normalizeQualityLossStatus as normalizeQualityLossStatusRule,
  parseQualityLossStatus as parseQualityLossStatusRule,
  QUALITY_LOSS_SOURCE,
  toAfterSalesClaimStatus as toAfterSalesClaimStatusRule,
  toQualityLossTargetType as toQualityLossTargetTypeRule,
  toQualityRecordStatus as toQualityRecordStatusRule,
} from '@qgs/shared';

export type { QualityLossSource, UnifiedQualityLossStatus };

export { QUALITY_LOSS_SOURCE };

export function normalizeQualityLossStatus(
  status: null | string | undefined,
): UnifiedQualityLossStatus {
  return normalizeQualityLossStatusRule(status);
}

export function parseQualityLossStatus(
  status: null | string | undefined,
): null | UnifiedQualityLossStatus {
  return parseQualityLossStatusRule(status);
}

export function toAfterSalesClaimStatus(
  status: null | string | undefined,
): after_sales_claimStatus {
  return toAfterSalesClaimStatusRule(status) as after_sales_claimStatus;
}

export function toQualityRecordStatus(
  status: null | string | undefined,
): quality_records_status {
  return toQualityRecordStatusRule(status) as quality_records_status;
}

export function normalizeQualityLossSource(
  source: null | string | undefined,
): QualityLossSource {
  return normalizeQualityLossSourceRule(source);
}

export function toQualityLossTargetType(
  source: QualityLossSource,
):
  | 'after_sales'
  | 'inspection_issue'
  | 'quality_loss'
  | 'vehicle_commissioning_issue' {
  return toQualityLossTargetTypeRule(source);
}
