import type { after_sales_claimStatus } from '@prisma/client';
import type { AfterSalesStatus } from '@qgs/shared';

import {
  AFTER_SALES_STATUS,
  AFTER_SALES_STATUS_COLOR_MAP,
  mapAfterSalesStatus as mapAfterSalesStatusRule,
} from '@qgs/shared';

export { AFTER_SALES_STATUS };

export type { AfterSalesStatus };

export function mapAfterSalesStatus(
  frontendStatus?: null | string,
): after_sales_claimStatus {
  return mapAfterSalesStatusRule(frontendStatus) as after_sales_claimStatus;
}

export const STATUS_COLOR_MAP: Record<AfterSalesStatus, string> =
  AFTER_SALES_STATUS_COLOR_MAP;
