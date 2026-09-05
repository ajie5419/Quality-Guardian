import { createHash } from 'node:crypto';

/**
 * Stable request fingerprint (IDEMPOTENCY-KEY-001).
 *
 * Callers pass only the business-semantic stable fields that decide the
 * create outcome (workOrderNumber, type, amount, date, ...). Field order is
 * canonicalized and undefined values are dropped, so the same logical request
 * always hashes identically. The fingerprint is used exclusively to detect
 * "same Idempotency-Key sent with a different payload" (409 REUSED); it must
 * never be used to decide whether two different keys are the same business
 * event.
 */
export function buildRequestFingerprint(
  fields: Record<string, unknown>,
): string {
  const canonicalJson = JSON.stringify(canonicalizeValue(fields));
  return createHash('sha256').update(canonicalJson).digest('hex');
}

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalizeValue(record[key])] as const);
    return Object.fromEntries(entries);
  }
  return value;
}
