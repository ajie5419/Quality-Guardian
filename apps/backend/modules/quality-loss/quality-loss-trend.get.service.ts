import { resolveReportPeriodRangeFromLabel } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { QUALITY_LOSS_SOURCE } from '~/modules/quality-loss/quality-loss-status';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

type SourceLabel =
  (typeof QUALITY_LOSS_SOURCE)[keyof typeof QUALITY_LOSS_SOURCE];

const TYPE_BY_SOURCE: Record<
  SourceLabel,
  'COMMISSIONING' | 'EXTERNAL' | 'INTERNAL' | 'MANUAL'
> = {
  Commissioning: 'COMMISSIONING',
  External: 'EXTERNAL',
  Internal: 'INTERNAL',
  Manual: 'MANUAL',
};

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const granularity = (query.granularity as string) || 'week';
  const period = query.period as string;

  try {
    if (period) {
      const range = getPeriodRangeFromTrend(period, granularity);
      if (!range) return useResponseSuccess({ drillDown: [], period });

      const rows = await QualityLossService.getDrillDown(
        range.start,
        range.end,
      );
      const details = rows
        .filter((row) => Number(row.amount) > 0)
        .map((row) => ({
          id: row.id,
          date: formatDate(row.occurDate),
          type:
            TYPE_BY_SOURCE[row.source as SourceLabel] ??
            (row.source as
              | 'COMMISSIONING'
              | 'EXTERNAL'
              | 'INTERNAL'
              | 'MANUAL'),
          amount: Number(Number(row.amount).toFixed(2)),
          dept: row.respDept || '-',
          desc: row.description || '-',
          workOrderNumber: row.workOrderNumber || '-',
          source: row.source as SourceLabel,
          _ts: row.occurDate.getTime(),
        }))
        .sort((a, b) => b._ts - a._ts);

      return useResponseSuccess({ drillDown: details, period });
    }

    return useResponseSuccess(
      await QualityLossService.getTrendData(granularity as 'month' | 'week'),
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('quality-loss-trend', error, undefined, event);
    return internalServerErrorResponse(
      event,
      `Failed to fetch quality loss trend: ${errorMessage}`,
    );
  }
});

function getPeriodRangeFromTrend(periodLabel: string, granularity: string) {
  if (granularity !== 'week' && granularity !== 'month') {
    return null;
  }
  return resolveReportPeriodRangeFromLabel({
    granularity,
    label: periodLabel,
  });
}
