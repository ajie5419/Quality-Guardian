import type { EventHandlerRequest, H3Event } from 'h3';

import process from 'node:process';

import { getHeader } from 'h3';
import { forbiddenResponse } from '~/utils/response';

export const PUBLIC_METROLOGY_BORROW_OPERATOR = 'PUBLIC_QR';

export function verifyPublicMetrologyBorrowAccess(
  event: H3Event<EventHandlerRequest>,
  payloadToken?: unknown,
) {
  const expectedToken = String(
    process.env.METROLOGY_PUBLIC_BORROW_TOKEN || '',
  ).trim();

  if (!expectedToken) {
    return true;
  }

  const headerToken = String(
    getHeader(event, 'x-metrology-borrow-token') || '',
  ).trim();
  const token = String(payloadToken || '').trim() || headerToken;

  if (token === expectedToken) {
    return true;
  }

  return forbiddenResponse(event, '扫码借用入口无效或已过期');
}
