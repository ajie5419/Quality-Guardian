import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { QUALITY_LOSS_SOURCE } from '~/utils/quality-loss-status';
import {
  unAuthorizedResponse,
  useResponseError,
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
      const { manualLosses, internalLosses, externalLosses } =
        await QualityLossService.getDrillDown(range.start, range.end);

      interface LossDetail {
        id: string;
        date: string;
        type: 'EXTERNAL' | 'INTERNAL' | 'MANUAL';
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
      details.sort((a, b) => b._ts - a._ts);

      return useResponseSuccess({ drillDown: details, period });
    }

    return useResponseSuccess(
      await QualityLossService.getTrendData(granularity as 'month' | 'week'),
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('quality-loss-trend', error);
    setResponseStatus(event, 500);
    return useResponseError(
      `Failed to fetch quality loss trend: ${errorMessage}`,
    );
  }
});

function getPeriodRangeFromTrend(periodLabel: string, granularity: string) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  yearStart.setHours(0, 0, 0, 0);

  if (granularity === 'week') {
    const tempDate = new Date(yearStart);
    const d = tempDate.getDay() || 7;
    tempDate.setDate(tempDate.getDate() - d + 1);
    while (tempDate.getTime() <= now.getTime()) {
      const weekStart = new Date(tempDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (
        (weekEnd.getFullYear() === now.getFullYear() ||
          weekStart.getFullYear() === now.getFullYear()) &&
        `W${getWeekNumber(weekStart)}` === periodLabel
      )
        return { start: weekStart, end: weekEnd };
      tempDate.setDate(tempDate.getDate() + 7);
    }
  } else {
    const months = [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ];
    const monthIndex = months.indexOf(periodLabel);
    if (monthIndex !== -1) {
      const monthStart = new Date(now.getFullYear(), monthIndex, 1);
      const monthEnd = new Date(
        now.getFullYear(),
        monthIndex + 1,
        0,
        23,
        59,
        59,
      );
      return { start: monthStart, end: monthEnd };
    }
  }
  return null;
}

function getWeekNumber(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 604_800_000;
  return Math.ceil(diff / oneWeek + 1);
}
