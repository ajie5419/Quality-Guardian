/**
 * Resolve the canonical display name for a quality classification reference.
 * The current master-data name (resolved through the stored ID relation) wins;
 * the historical snapshot stored on the record is only a compatibility
 * fallback for rows whose reference is missing or was soft-deleted.
 */
export function resolveCanonicalClassificationName(
  currentName: null | string | undefined,
  snapshotName: null | string | undefined,
): string {
  const resolved =
    String(currentName || '').trim() || String(snapshotName || '').trim();
  return resolved;
}
