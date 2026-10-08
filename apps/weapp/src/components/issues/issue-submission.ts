import type { InspectionIssuePayload } from '@/api/issues';

import { createInspectionIssue } from '@/api/issues';
import { ErrorCode } from '@qgs/shared';

/** Native randomness is available on devices where browser crypto is absent. */
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

/** Preserve the mounted form's operation after an uncertain network outcome. */
export function createIssueSubmission(generateKey = generateOperationId) {
  let operationId: string | undefined;
  return async (payload: InspectionIssuePayload) => {
    operationId ??= await generateKey();
    const response = await createInspectionIssue(payload, operationId);
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
