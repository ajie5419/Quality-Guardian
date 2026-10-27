import type { H3Event } from 'h3';
import type { z } from 'zod';

import { ErrorCode } from '@qgs/shared';
import { getRouterParam, readBody, setHeader } from 'h3';
import { assertIdentityClientHeaders } from '~/modules/identity-bridge';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  isBusinessError,
} from '~/utils/business-error';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import {
  describeIntegrationValidationError,
  fulfillmentWorkOrderCancelSchema,
  fulfillmentWorkOrderCreateSchema,
  fulfillmentWorkOrderNumberParamSchema,
  fulfillmentWorkOrderUpdateSchema,
} from './work-order-integration.schema';
import { WorkOrderIntegrationService } from './work-order-integration.service';

type IntegrationAction = 'cancel' | 'create' | 'update';

async function parseBody<T extends z.ZodTypeAny>(
  event: H3Event,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await readBody(event);
  } catch (error) {
    logApiError('fulfillment-work-order-body', error, undefined, event);
    throw new BusinessError(ErrorCode.BAD_REQUEST, '参数错误：请求体', 400);
  }
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new BusinessError(
      ErrorCode.BAD_REQUEST,
      describeIntegrationValidationError(parsed.error),
      400,
    );
  }
  return parsed.data;
}

function parseWorkOrderNumberParam(event: H3Event) {
  const parsed = fulfillmentWorkOrderNumberParamSchema.safeParse(
    getRouterParam(event, 'workOrderNumber', { decode: true }),
  );
  if (!parsed.success) {
    throw new BusinessError(ErrorCode.BAD_REQUEST, '参数错误：工单号', 400);
  }
  return parsed.data;
}

async function runAction(event: H3Event, action: IntegrationAction) {
  if (action === 'create') {
    const input = await parseBody(event, fulfillmentWorkOrderCreateSchema);
    return WorkOrderIntegrationService.create(event, input);
  }
  const workOrderNumber = parseWorkOrderNumberParam(event);
  if (action === 'update') {
    const input = await parseBody(event, fulfillmentWorkOrderUpdateSchema);
    return WorkOrderIntegrationService.update(event, workOrderNumber, input);
  }
  const input = await parseBody(event, fulfillmentWorkOrderCancelSchema);
  return WorkOrderIntegrationService.cancel(event, workOrderNumber, input);
}

/**
 * Authorization for fulfillment work-order writes: the caller must present
 * the identity-bridge confidential client headers (503 when unconfigured,
 * 401 on mismatch). Acting-user checks happen in the service.
 */
export function assertFulfillmentWorkOrderPermission(event: H3Event) {
  assertIdentityClientHeaders(event);
}

/**
 * Fulfillment work-order writes (create / update / cancel). The paths are
 * exempt from JWT in `middleware/3.auth.ts`; `authorize` runs before the body
 * is read or the database touched.
 */
export async function handleFulfillmentWorkOrderWrite(
  event: H3Event,
  action: IntegrationAction,
  authorize: (event: H3Event) => void,
) {
  setHeader(event, 'Cache-Control', 'no-store');
  try {
    authorize(event);
    return useResponseSuccess(await runAction(event, action));
  } catch (error) {
    logApiError(`fulfillment-work-order-${action}`, error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, '工单写入失败，请稍后重试');
  }
}
