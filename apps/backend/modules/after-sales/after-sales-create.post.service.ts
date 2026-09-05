import { defineEventHandler, getHeader, readBody } from 'h3';
import { z } from 'zod';
import { createScopedRepository } from '~/modules/data-scope';
import {
  normalizeIdempotencyKey,
  withRequestIdempotency,
} from '~/modules/idempotency';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { buildAfterSalesCreateRequestFingerprint } from './after-sales-create-fingerprint';
import { AfterSalesRouteService } from './after-sales-route.service';

const AFTER_SALES_CREATE_OPERATION_KEY = 'qms.after-sales.create';
// Mobile / weak-network duplicate submission only needs a short replay
// window; 5 minutes is enough for a user-initiated create.
const AFTER_SALES_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const createAfterSalesSchema = z
  .object({ workOrderNumber: z.unknown() })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  try {
    const idempotencyKey = normalizeIdempotencyKey(
      getHeader(event, 'Idempotency-Key'),
    );
    if (!idempotencyKey) {
      return badRequestResponse(
        event,
        '缺少有效的 Idempotency-Key 请求头（8-128 字符，仅字母数字与 . _ ~ -）',
      );
    }
    const body = createAfterSalesSchema.parse(await readBody(event));
    const missingFields = getMissingRequiredFields(body, ['workOrderNumber']);
    if (missingFields.length > 0) {
      return badRequestResponse(event, `缺少必填字段: ${missingFields[0]}`);
    }
    const actorKey = String(userinfo.id || '');
    if (!actorKey) {
      return badRequestResponse(event, '无法识别当前用户身份');
    }
    const outcome = await withRequestIdempotency({
      actorKey: `user:${actorKey}`,
      expiresAt: new Date(Date.now() + AFTER_SALES_IDEMPOTENCY_WINDOW_MS),
      idempotencyKey,
      operationKey: AFTER_SALES_CREATE_OPERATION_KEY,
      prisma,
      requestFingerprint: buildAfterSalesCreateRequestFingerprint(body),
      resourceGuard: async (client, resourceId) => {
        const row = await createScopedRepository(
          'after-sales',
          client.after_sales,
        ).findAccessible(
          { select: { id: true }, where: { id: resourceId, isDeleted: false } },
          {
            scope: event.context.dataScope,
            user: { id: actorKey, username: userinfo.username },
          },
        );
        return Boolean(row);
      },
      run: async (tx) => {
        const created = await AfterSalesRouteService.create(body, userinfo, tx);
        return {
          resourceId: created.id,
          resourceType: 'after_sales',
          response: created,
        };
      },
    });
    if (!outcome.replayed) {
      await AfterSalesRouteService.applyCreatePostCommit(
        body,
        outcome.response,
        userinfo,
      );
    }
    return useResponseSuccess(outcome.response);
  } catch (error: unknown) {
    logApiError('after-sales-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(
      event,
      `创建售后记录失败: ${errorMessage}`,
    );
  }
});
