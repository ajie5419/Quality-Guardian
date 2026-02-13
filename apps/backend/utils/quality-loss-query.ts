function normalizeQueryText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
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
  return {
    lossSource: normalizeQueryText(query.lossSource),
    status: normalizeQueryText(query.status),
    workOrderNumber: normalizeQueryText(query.workOrderNumber),
  };
}

export function parseQualityLossListQuery(query: Record<string, unknown>) {
  return {
    ...parseQualityLossCommonQuery(query),
    page: parsePositiveNumber(query.page),
    pageSize: parsePositiveNumber(query.pageSize),
  };
}
