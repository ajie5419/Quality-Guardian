import { defineEventHandler, getHeader, readBody } from 'h3';
import { createScopedRepository } from '~/modules/data-scope';
import {
  normalizeIdempotencyKey,
  withRequestIdempotency,
} from '~/modules/idempotency';
import { logApiError } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  isBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { mapInspectionRequest } from './inspection-request';
import { buildInspectionRequestCreateRequestFingerprint } from './inspection-request-create-fingerprint';
import { retryInspectionRequestCreate } from './inspection-request-create-retry.service';
import {
  inspectionRequestCreateV2BodySchema,
  validateInspectionRequestCreateV2Body,
} from './inspection-request-create.schema';
import { InspectionRequestCreateService } from './inspection-request-create.service';

const INSPECTION_REQUEST_CREATE_OPERATION_KEY = 'qms.inspection-request.create';
// Mobile / weak-network duplicate submission only needs a short replay
// window; 5 minutes is enough for a user-initiated create.
const INSPECTION_REQUEST_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

export default defineEventHandler(async (event) => {
  return businessErrorResponse(
    event,
    new BusinessError(
      'INSPECTION_REQUEST_V2_REQUIRED',
      'Use POST /api/qms/inspection/requests/v2 with category, partId and processId',
      410,
    ),
  );
});

export const inspectionRequestCreateV2Handler = defineEventHandler(
  async (event) => {
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
      const body = inspectionRequestCreateV2BodySchema.parse(
        await readBody(event),
      );
      if (!validateInspectionRequestCreateV2Body(body).isValid) {
        return badRequestResponse(
          event,
          'workOrderNumber, category, material identity, processId, responsible identity, reporter and attachments are required',
        );
      }
      const actorKey = String(userinfo.id || '');
      if (!actorKey) {
        return badRequestResponse(event, '无法识别当前用户身份');
      }
      const prepared =
        await InspectionRequestCreateService.prepareCreateRequest(
          body,
          'V2',
          false,
        );
      let createdRow: Awaited<
        ReturnType<
          typeof InspectionRequestCreateService.createRequestInTransaction
        >
      > | null = null;
      const outcome = await retryInspectionRequestCreate(() =>
        withRequestIdempotency({
          actorKey: `user:${actorKey}`,
          expiresAt: new Date(
            Date.now() + INSPECTION_REQUEST_IDEMPOTENCY_WINDOW_MS,
          ),
          idempotencyKey,
          operationKey: INSPECTION_REQUEST_CREATE_OPERATION_KEY,
          prisma,
          requestFingerprint:
            buildInspectionRequestCreateRequestFingerprint(body),
          resourceGuard: async (client, resourceId) => {
            const row = await createScopedRepository(
              'inspection',
              client.qms_inspection_requests,
            ).findAccessible(
              {
                select: { id: true },
                where: { id: resourceId, isDeleted: false },
              },
              {
                scope: event.context.dataScope,
                user: { id: actorKey, username: userinfo.username },
              },
            );
            return Boolean(row);
          },
          run: async (tx) => {
            createdRow =
              await InspectionRequestCreateService.createRequestInTransaction({
                body,
                identityContract: 'V2',
                payload: prepared.payload,
                tx,
                userinfo,
              });
            return {
              resourceId: createdRow.id,
              resourceType: 'qms_inspection_requests',
              response: mapInspectionRequest(createdRow),
            };
          },
        }),
      );
      if (!outcome.replayed && createdRow) {
        await InspectionRequestCreateService.applyCreateRequestPostCommitEffects(
          {
            body,
            created: createdRow,
            event,
            isPublic: false,
            payload: prepared.payload,
            userinfo,
          },
        );
      }
      return useResponseSuccess(outcome.response);
    } catch (error) {
      logApiError('inspection-request-create-v2', error, undefined, event);
      if (isBusinessError(error)) return businessErrorResponse(event, error);
      return internalServerErrorResponse(event, 'Failed to create request');
    }
  },
);
