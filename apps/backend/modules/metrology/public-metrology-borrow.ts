import type { EventHandlerRequest, H3Event } from 'h3';

import {
  PUBLIC_METROLOGY_BORROW_OPERATOR,
  readPublicMetrologyBorrowExpectedToken,
  verifyPublicMetrologyBorrowToken,
} from '@qgs/shared';
import { getHeader } from 'h3';
import { forbiddenResponse } from '~/utils/response';

export { PUBLIC_METROLOGY_BORROW_OPERATOR };

export function verifyPublicMetrologyBorrowAccess(
  event: H3Event<EventHandlerRequest>,
  payloadToken?: unknown,
) {
  const expectedToken = readPublicMetrologyBorrowExpectedToken();

  if (!expectedToken) {
    // This is a mutation-capable public capability, not a login fallback.
    // Missing runtime configuration must not turn it into an anonymous writer.
    return forbiddenResponse(event, '扫码借用入口未配置访问凭证');
  }

  if (
    verifyPublicMetrologyBorrowToken({
      expectedToken,
      headerToken: getHeader(event, 'x-metrology-borrow-token'),
      payloadToken,
    })
  ) {
    return true;
  }

  return forbiddenResponse(event, '扫码借用入口无效或已过期');
}
