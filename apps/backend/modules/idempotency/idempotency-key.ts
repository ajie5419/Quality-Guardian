/**
 * Idempotency-Key header contract (IDEMPOTENCY-KEY-001 / PHASE-1).
 *
 * The client generates one key per user-initiated create attempt and reuses
 * it across network retries / button retries of the same attempt; a genuinely
 * new create gets a fresh key. Keys are opaque tokens (never DB primary keys)
 * with a bounded, restricted charset.
 */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[\w.~-]+$/;

export function normalizeIdempotencyKey(value: unknown): null | string {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < IDEMPOTENCY_KEY_MIN_LENGTH) return null;
  if (trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH) return null;
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) return null;
  return trimmed;
}
