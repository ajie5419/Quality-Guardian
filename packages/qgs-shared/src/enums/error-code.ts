/**
 * Unified error-code dictionary shared by frontend and backend.
 *
 * The backend throws `BusinessError(code, message, httpStatus)` with `code`
 * drawn from this dictionary; the response layer forwards `code` to the
 * response top level, and the frontend grades UX by code:
 *
 *   VALIDATION    → field-level warning
 *   NOT_FOUND     → not-found semantics (404)
 *   FORBIDDEN     → permission denied (403)
 *   UNAUTHORIZED  → expired / missing session → redirect to login
 *   CONFLICT      → state conflict / concurrent write → refresh and retry
 *   BAD_REQUEST   → malformed request
 *   DUPLICATE     → duplicate entity / unique violation (409)
 *   BUSINESS      → generic business failure → warning toast
 *   INTERNAL      → unexpected internal failure → error toast + log
 *
 * Rule: never invent ad-hoc string codes in business code. Add new codes
 * here (dictionary) first, then reference the constant.
 */
export const ErrorCode = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  DUPLICATE: 'DUPLICATE',
  BUSINESS: 'BUSINESS',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Map a code to the frontend UX bucket. */
export const ERROR_UX_LEVEL = {
  VALIDATION: 'warning',
  NOT_FOUND: 'error',
  FORBIDDEN: 'error',
  UNAUTHORIZED: 'error',
  CONFLICT: 'warning',
  BAD_REQUEST: 'error',
  DUPLICATE: 'warning',
  BUSINESS: 'warning',
  INTERNAL: 'error',
} as const satisfies Record<ErrorCodeValue, 'error' | 'warning'>;

export type ErrorUxLevel = (typeof ERROR_UX_LEVEL)[keyof typeof ERROR_UX_LEVEL];

/** Check whether a value is a declared error code. */
export function isErrorCode(value: unknown): value is ErrorCodeValue {
  return (
    typeof value === 'string' &&
    (Object.values(ErrorCode) as string[]).includes(value)
  );
}
