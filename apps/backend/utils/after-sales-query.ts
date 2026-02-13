import { mapAfterSalesStatus } from '~/utils/after-sales-status';

function normalizeQueryText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function parseAfterSalesListQuery(query: Record<string, unknown>) {
  const yearRaw = normalizeQueryText(query.year);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;

  return {
    year: Number.isNaN(year ?? Number.NaN) ? undefined : year,
    workOrderNumber: normalizeQueryText(query.workOrderNumber),
    projectName: normalizeQueryText(query.projectName),
    status: query.status
      ? mapAfterSalesStatus(normalizeQueryText(query.status))
      : undefined,
    supplierBrand: normalizeQueryText(query.supplierBrand),
  };
}
