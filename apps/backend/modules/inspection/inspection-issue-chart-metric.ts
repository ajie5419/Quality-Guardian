import { Prisma } from '@prisma/client';

export type InspectionIssueChartMetric = 'count' | 'lossAmount' | 'quantity';

/**
 * Reads the numeric metric value out of a Prisma groupBy row that carries an
 * optional `_count` / `_sum` payload. The row is intentionally typed as a
 * loose record because the groupBy payload shape depends on the metric.
 */
export function getIssueChartMetricValue(
  metric: InspectionIssueChartMetric,
  group: Record<string, unknown>,
) {
  const count = group._count as undefined | { id?: number };
  const sum = group._sum as
    | undefined
    | {
        lossAmount?: null | number | Prisma.Decimal;
        quantity?: null | number | Prisma.Decimal;
      };
  switch (metric) {
    case 'count': {
      return Number(count?.id || 0);
    }
    case 'lossAmount': {
      return Number(sum?.lossAmount || 0);
    }
    case 'quantity': {
      return Number(sum?.quantity || 0);
    }
    default: {
      return 0;
    }
  }
}
