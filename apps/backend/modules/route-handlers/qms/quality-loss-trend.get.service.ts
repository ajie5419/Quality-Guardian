import { resolveReportPeriodRangeFromLabel } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { QUALITY_LOSS_SOURCE } from '~/utils/quality-loss-status';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const query = getQuery(event);
  const granularity = (query.granularity as string) || 'week';
  const period = query.period as string;

  try {
    if (period) {
      const range = getPeriodRangeFromTrend(period, granularity);
      if (!range) return useResponseSuccess({ drillDown: [], period });

      const formatDate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };
      const {
        manualLosses,
        internalLosses,
        externalLosses,
        commissioningLosses,
      } = await QualityLossService.getDrillDown(range.start, range.end);

      interface LossDetail {
        id: string;
        date: string;
        type: 'COMMISSIONING' | 'EXTERNAL' | 'INTERNAL' | 'MANUAL';
        amount: number;
        dept: string;
        desc: string;
        workOrderNumber: string;
        source: (typeof QUALITY_LOSS_SOURCE)[keyof typeof QUALITY_LOSS_SOURCE];
        _ts: number;
      }
      const details: LossDetail[] = [];

      manualLosses.forEach((item) => {
        const amount = Number(item.amount);
        if (amount <= 0) return;
        details.push({
          id: item.lossId || item.id,
          date: formatDate(item.occurDate),
          type: 'MANUAL',
          amount,
          dept: item.respDept || '-',
          desc: item.description || '-',
          workOrderNumber: '-',
          source: QUALITY_LOSS_SOURCE.MANUAL,
          _ts: item.occurDate.getTime(),
        });
      });
      internalLosses.forEach((item) => {
        const amount = Number(item.lossAmount);
        if (amount <= 0) return;
        details.push({
          id: `INT-${item.serialNumber}`,
          date: formatDate(item.date),
          type: 'INTERNAL',
          amount,
          dept: item.responsibleDepartment || '-',
          desc: item.description || '-',
          workOrderNumber: item.workOrderNumber || '-',
          source: QUALITY_LOSS_SOURCE.INTERNAL,
          _ts: item.date.getTime(),
        });
      });
      externalLosses.forEach((item) => {
        const amount =
          Number(item.materialCost || 0) + Number(item.laborTravelCost || 0);
        if (amount <= 0) return;
        details.push({
          id: `EXT-${item.serialNumber}`,
          date: formatDate(item.occurDate),
          type: 'EXTERNAL',
          amount: Number(amount.toFixed(2)),
          dept: item.respDept || '-',
          desc: item.issueDescription || '-',
          workOrderNumber: item.workOrderNumber || '-',
          source: QUALITY_LOSS_SOURCE.EXTERNAL,
          _ts: item.occurDate.getTime(),
        });
      });
      commissioningLosses.forEach((item) => {
        const amount = Number(item.lossAmount || 0);
        details.push({
          id: item.id,
          date: formatDate(item.date),
          type: 'COMMISSIONING',
          amount: Number(amount.toFixed(2)),
          dept: item.responsibleDepartment || '-',
          desc: item.description || '-',
          workOrderNumber: item.workOrderNumber || '-',
          source: QUALITY_LOSS_SOURCE.COMMISSIONING,
          _ts: item.date.getTime(),
        });
      });
      details.sort((a, b) => b._ts - a._ts);

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
