import type { H3Event } from 'h3';

import { ErrorCode } from '@qgs/shared';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  isBusinessError,
} from '~/utils/business-error';

export const WORK_ORDER_MANAGED_EXTERNALLY_MESSAGE =
  '工单由履约系统维护，请到履约系统操作';

function managedExternallyError() {
  return new BusinessError(
    ErrorCode.FORBIDDEN,
    WORK_ORDER_MANAGED_EXTERNALLY_MESSAGE,
    403,
  );
}

/**
 * Work-order master data is maintained by the fulfillment system through
 * `/api/integration/fulfillment/work-orders`, so QMS grants no create / edit /
 * import / delete permission on it to anyone. Requirements and the other
 * work-order sub-features keep their own permissions.
 */
export function assertQmsWorkOrderWritePermission(): never {
  throw managedExternallyError();
}

/**
 * The QMS write endpoints stay mounted so stale clients get a clear 403
 * instead of a 404; no write path remains behind the authorization.
 */
export function rejectQmsWorkOrderWrite(
  event: H3Event,
  authorize: () => never,
) {
  try {
    authorize();
  } catch (error) {
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    logApiError('work-order-write-denied', error, undefined, event);
  }
  return businessErrorResponse(event, managedExternallyError());
}
