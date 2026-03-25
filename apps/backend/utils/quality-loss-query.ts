function normalizeQueryText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function normalizeGranularity(value: unknown): 'month' | 'week' | 'year' {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (normalized === 'week') return 'week';
  if (normalized === 'year') return 'year';
  return 'month';
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function parseQualityLossCommonQuery(query: Record<string, unknown>) {
  const yearRaw = normalizeQueryText(query.year);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;
  return {
    granularity: normalizeGranularity(query.granularity),
    lossSource: normalizeQueryText(query.lossSource),
    status: normalizeQueryText(query.status),
    workOrderNumber: normalizeQueryText(query.workOrderNumber),
    year: Number.isNaN(year ?? Number.NaN) ? undefined : year,
  };
}

export function parseQualityLossListQuery(query: Record<string, unknown>) {
  return {
    ...parseQualityLossCommonQuery(query),
    page: parsePositiveNumber(query.page),
    pageSize: parsePositiveNumber(query.pageSize),
  };
}
