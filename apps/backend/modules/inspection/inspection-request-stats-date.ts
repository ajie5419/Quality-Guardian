function getShanghaiTodayRange(now = new Date()) {
  const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(now);
  const start = new Date(`${shanghaiDate}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { end, start };
}

function parseShanghaiDate(value?: null | string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addInspectionRequestStatsDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function formatInspectionRequestStatsDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(date);
}

function getPeriodRange(period?: null | string, now = new Date()) {
  const today = getShanghaiTodayRange(now).start;
  const start = new Date(today);
  switch (period) {
    case 'halfYear': {
      start.setMonth(start.getMonth() - 5, 1);
      break;
    }
    case 'quarter': {
      start.setMonth(start.getMonth() - 2, 1);
      break;
    }
    case 'year': {
      start.setMonth(0, 1);
      break;
    }
    default: {
      start.setDate(1);
    }
  }
  return { end: addInspectionRequestStatsDays(today, 1), start };
}

export function resolveInspectionRequestStatsRange(query: {
  endDate?: string;
  period?: string;
  startDate?: string;
}) {
  const customStart = parseShanghaiDate(query.startDate || '');
  const customEnd = parseShanghaiDate(query.endDate || '');
  if (customStart && customEnd && customEnd >= customStart) {
    return {
      end: addInspectionRequestStatsDays(customEnd, 1),
      start: customStart,
    };
  }
  return query.period ? getPeriodRange(query.period) : getShanghaiTodayRange();
}

export function inspectionRequestDurationMinutes(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  return !Number.isFinite(diff) || diff < 0 ? 0 : Math.floor(diff / 60_000);
}
