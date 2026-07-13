export function hasInspectionBatches(batchCount: null | number | undefined) {
  return Number(batchCount || 0) > 0;
}

export function hasIncomingQualifiedRate(
  batchCount: null | number | undefined,
  qualifiedRate: null | number | undefined,
) {
  if (
    !hasInspectionBatches(batchCount) ||
    qualifiedRate === null ||
    qualifiedRate === undefined
  ) {
    return false;
  }
  return Number.isFinite(Number(qualifiedRate));
}

export function formatIncomingQualifiedRate(
  batchCount: null | number | undefined,
  qualifiedRate: null | number | undefined,
): number | string {
  if (!hasIncomingQualifiedRate(batchCount, qualifiedRate)) return '-';

  return Number(qualifiedRate);
}
