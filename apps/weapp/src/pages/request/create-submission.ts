import { submitInspectionRequest } from '@/api/inspection';
import { ErrorCode } from '@qgs/shared';

/** Native mini-program randomness; browser crypto is unavailable on devices. */
function generateOperationId(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getRandomValues({
      length: 16,
      success: ({ randomValues }) =>
        resolve(
          Array.from(new Uint8Array(randomValues), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join(''),
        ),
      fail: reject,
    });
  });
}

/** Each mounted form owns one key, retained after uncertain network outcomes. */
export function createRequestSubmission(generateKey = generateOperationId) {
  let operationId: string | undefined;
  return async (payload: Record<string, unknown>) => {
    operationId ??= await generateKey();
    const response = await submitInspectionRequest(payload, operationId);
    if (
      response.code === 0 ||
      (typeof response.error === 'object' &&
        response.error?.code === ErrorCode.IDEMPOTENCY_KEY_REUSED)
    ) {
      operationId = undefined;
    }
    return response;
  };
}
