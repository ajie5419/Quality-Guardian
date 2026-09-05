import { BusinessError } from '~/utils/business-error';

/**
 * Optimistic-lock version guards (OPTIMISTIC-LOCK-001).
 *
 * User-driven edits and deletes of versioned records must carry the version
 * the client read; a missing or malformed version would silently degrade to
 * last-write-wins, so every user-facing write entry rejects it with a 400.
 * System/import writes never pass through these helpers: they are not part of
 * the interactive edit contract.
 */
function assertValidVersion(raw: unknown): number {
  const expectedVersion = Number(raw);
  if (
    raw === undefined ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1
  ) {
    throw new BusinessError(
      'BAD_REQUEST',
      '缺少有效的 version 参数，请刷新后重试',
      400,
    );
  }
  return expectedVersion;
}

/** Reads and validates `version` from a request body (PUT/POST payload). */
export function requireExpectedVersionBody(
  body: Record<string, unknown>,
): number {
  return assertValidVersion(body.version);
}

/** Reads and validates `version` from a query string (DELETE / query param). */
export function requireExpectedVersionQuery(
  query: Record<string, unknown>,
): number {
  return assertValidVersion(query.version);
}
