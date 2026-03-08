import type {
  DashboardData,
  PassRateTrendResponse,
  QualityLossTrendResponse,
  VehicleFailureResponse,
} from '@qgs/shared';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

// Re-export shared types
export * from '@qgs/shared';

/**
 * Get QMS Dashboard data
 */
export async function getQmsDashboardData() {
  return requestClient.get<DashboardData>(QMS_API.DASHBOARD);
}

/**
 * Get pass rate trend data
 * @param granularity - 'week' or 'month'
 * @param period - Optional, for drill-down (e.g., 'W2' or '2024-01')
 */
export async function getPassRateTrend(
  granularity: 'month' | 'week' = 'week',
  period?: string,
) {
  const params: Record<string, string> = { granularity };
  if (period) {
    params.period = period;
  }
  return requestClient.get<PassRateTrendResponse>(QMS_API.PASS_RATE_TREND, {
    params,
  });
}

/**
 * Get quality loss trend data
 * @param granularity - 'week' or 'month'
 * @param period - Optional, for drill-down
 */
export async function getQualityLossTrend(
  granularity: 'month' | 'week' = 'week',
  period?: string,
) {
  const params: Record<string, string> = { granularity };
  if (period) {
    params.period = period;
  }
  return requestClient.get<QualityLossTrendResponse>(
    QMS_API.QUALITY_LOSS_TREND,
    {
      params,
    },
  );
}

/**
 * Get vehicle failure rate data
 * @param params
 * @param params.month
 * @param params.model
 * @param params.range
 */
export async function getVehicleFailureRate(params?: {
  model?: string;
  month?: string;
  range?: string;
}) {
  return requestClient.get<VehicleFailureResponse>(
    QMS_API.VEHICLE_FAILURE_RATE,
    { params },
  );
}

export namespace QmsDashboardApi {
  export type PassRateTrendItem = import('@qgs/shared').PassRateTrendItem;
  export type PassRateDrillDownItem =
    import('@qgs/shared').PassRateDrillDownItem;
  export type QualityLossTrendItem = import('@qgs/shared').QualityLossTrendItem;
  export type QualityLossDrillDownItem =
    import('@qgs/shared').QualityLossDrillDownItem;
}
