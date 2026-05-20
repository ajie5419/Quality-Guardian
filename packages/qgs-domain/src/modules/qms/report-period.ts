export type ReportPeriodGranularity = 'month' | 'week';

export function resolveReportWeekNumber(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneWeek = 604_800_000;
  return Math.ceil(diff / oneWeek + 1);
}

export function resolveReportPeriodRange(params: {
  anchorDate: Date;
  granularity: ReportPeriodGranularity;
}) {
  const currentStart = new Date(params.anchorDate);
  const currentEnd = new Date(params.anchorDate);

  if (params.granularity === 'week') {
    const day = currentStart.getDay() || 7;
    currentStart.setDate(currentStart.getDate() - day + 1);
    currentStart.setHours(0, 0, 0, 0);
    currentEnd.setDate(currentStart.getDate() + 6);
    currentEnd.setHours(23, 59, 59, 999);
    return { end: currentEnd, start: currentStart };
  }

  currentStart.setDate(1);
  currentStart.setHours(0, 0, 0, 0);
  currentEnd.setMonth(currentStart.getMonth() + 1, 0);
  currentEnd.setHours(23, 59, 59, 999);
  return { end: currentEnd, start: currentStart };
}

export function shiftReportAnchorDate(params: {
  amount: number;
  anchorDate: Date;
  granularity: ReportPeriodGranularity;
}) {
  const date = new Date(params.anchorDate);
  if (params.granularity === 'week') {
    date.setDate(date.getDate() + params.amount * 7);
  } else {
    date.setMonth(date.getMonth() + params.amount);
  }
  return date;
}

export function resolveReportShortLabel(params: {
  date: Date;
  granularity: ReportPeriodGranularity;
}) {
  if (params.granularity === 'week') {
    return `W${resolveReportWeekNumber(params.date)}`;
  }
  return `${params.date.getMonth() + 1}月`;
}

export function resolveReportPeriodRangeFromLabel(params: {
  granularity: ReportPeriodGranularity;
  label: string;
  referenceDate?: Date;
}) {
  const now = params.referenceDate
    ? new Date(params.referenceDate)
    : new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  yearStart.setHours(0, 0, 0, 0);

  if (params.granularity === 'week') {
    const tempDate = new Date(yearStart);
    const day = tempDate.getDay() || 7;
    tempDate.setDate(tempDate.getDate() - day + 1);
    while (tempDate.getTime() <= now.getTime()) {
      const weekStart = new Date(tempDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      if (
        (weekEnd.getFullYear() === now.getFullYear() ||
          weekStart.getFullYear() === now.getFullYear()) &&
        `W${resolveReportWeekNumber(weekStart)}` === params.label
      ) {
        return { end: weekEnd, start: weekStart };
      }
      tempDate.setDate(tempDate.getDate() + 7);
    }
    return null;
  }

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
  const monthIndex = months.indexOf(params.label);
  if (monthIndex === -1) return null;
  const monthStart = new Date(now.getFullYear(), monthIndex, 1);
  const monthEnd = new Date(now.getFullYear(), monthIndex + 1, 0, 23, 59, 59);
  return { end: monthEnd, start: monthStart };
}
