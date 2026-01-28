import { defineEventHandler, getQuery } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { verifyAccessToken } from '~/utils/jwt-utils';
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

      const { manualLosses, internalLosses, externalLosses } =
        await QualityLossService.getDrillDown(range.start, range.end);

      const formatDate = (date: Date) => date.toISOString().split('T')[0];
      const details: any[] = [];

      manualLosses.forEach((item) => {
        details.push({
          id: item.lossId || item.id,
          date: formatDate(item.occurDate),
          type: '其他损失',
          amount: Number(item.amount),
          dept: item.respDept || '-',
          desc: item.description || '-',
          source: 'Manual',
        });
      });
      internalLosses.forEach((item) => {
        details.push({
          id: `INT-${item.serialNumber}`,
          date: formatDate(item.date),
          type: '内部损失',
          amount: Number(item.lossAmount),
          dept: item.responsibleDepartment,
          desc: item.description || '-',
          source: 'Internal',
        });
      });
      externalLosses.forEach((item) => {
        const amount =
          Number(item.materialCost || 0) + Number(item.laborTravelCost || 0);
        details.push({
          id: `EXT-${item.serialNumber}`,
          date: formatDate(item.occurDate),
          type: '外部损失',
          amount: Number(amount.toFixed(2)),
          dept: item.respDept || '-',
          desc: item.issueDescription || '-',
          source: 'External',
        });
      });
      details.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      return useResponseSuccess({ drillDown: details, period });
    }

    return useResponseSuccess(
      await QualityLossService.getTrendData(granularity as 'month' | 'week'),
    );
  } catch (error: any) {
    console.error('Failed to fetch quality loss trend:', error);
    return useResponseError(
      `Failed to fetch quality loss trend: ${error.message}`,
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
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), i, 1);
      const monthEnd = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
      if (
        monthStart.toLocaleDateString('zh-CN', { month: 'short' }) ===
        periodLabel
      )
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
