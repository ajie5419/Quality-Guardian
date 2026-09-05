import { ref } from 'vue';

/**
 * Request-level idempotency (IDEMPOTENCY-KEY-001): one operation id per
 * user-initiated create attempt. `acquire()` generates a fresh UUID on the
 * first use and reuses it across network / button retries of the same
 * attempt; `reset()` clears it after a terminal outcome (success or a
 * key-reused conflict) so the next explicit save starts a new attempt.
 *
 * The operation id is sent as the `Idempotency-Key` header. The server keeps
 * it bound to the actor and operation key, so it never leaks across users.
 */
export function useCreateOperationId() {
  const operationId = ref<null | string>(null);

  function acquire(): string {
    if (!operationId.value) {
      operationId.value = crypto.randomUUID();
    }
    return operationId.value;
  }

  function reset() {
    operationId.value = null;
  }

  return { acquire, operationId, reset };
}

/**
 * Detects the server's 409 IDEMPOTENCY_KEY_REUSED response: the client reused
 * an operation id with a different payload. Views reset the operation id on
 * this error so the next explicit save starts a fresh attempt.
 */
export function isIdempotencyReusedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as {
    response?: {
      data?: { error?: string | { code?: string }; message?: string };
    };
  };
  const rawError = err?.response?.data?.error;
  return (
    typeof rawError === 'object' &&
    rawError !== null &&
    rawError.code === 'IDEMPOTENCY_KEY_REUSED'
  );
}
