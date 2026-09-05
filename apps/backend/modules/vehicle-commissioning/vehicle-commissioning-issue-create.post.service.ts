import { defineEventHandler, getHeader, readBody } from 'h3';
import { z } from 'zod';
import {
  normalizeIdempotencyKey,
  withRequestIdempotency,
} from '~/modules/idempotency';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { applyIssueCreatePostCommit } from './vehicle-commissioning-issue-create-effects.service';
import { buildVehicleCommissioningIssueCreateRequestFingerprint } from './vehicle-commissioning-issue-create-fingerprint';

const VEHICLE_COMMISSIONING_ISSUE_CREATE_OPERATION_KEY =
  'qms.vehicle-commissioning-issue.create';
// Mobile / weak-network duplicate submission only needs a short replay
// window; 5 minutes is enough for a user-initiated create.
const VEHICLE_COMMISSIONING_ISSUE_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const bodySchema = z.record(z.string(), z.unknown());

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
    const body = bodySchema.parse(await readBody(event));
    if (!body.description && !body.title) {
      return badRequestResponse(event, '缺少问题描述');
    }
    const actorKey = String(userinfo.id || '');
    if (!actorKey) {
      return badRequestResponse(event, '无法识别当前用户身份');
    }
    const photos = Array.isArray(body.photos)
      ? body.photos.map(String).filter(Boolean)
      : [];
    const outcome = await withRequestIdempotency({
      actorKey: `user:${actorKey}`,
      expiresAt: new Date(
        Date.now() + VEHICLE_COMMISSIONING_ISSUE_IDEMPOTENCY_WINDOW_MS,
      ),
      idempotencyKey,
      operationKey: VEHICLE_COMMISSIONING_ISSUE_CREATE_OPERATION_KEY,
      prisma,
      requestFingerprint:
        buildVehicleCommissioningIssueCreateRequestFingerprint(body),
      resourceGuard: async (client, resourceId) => {
        const row = await client.vehicle_commissioning_issues.findFirst({
          select: { id: true },
          where: { id: resourceId, isDeleted: false },
        });
        return Boolean(row);
      },
      run: async (tx) => {
        const created = await VehicleCommissioningService.createIssueFromBody(
          body,
          actorKey,
          tx,
        );
        return {
          resourceId: created.id,
          resourceType: 'vehicle_commissioning_issues',
          response: created,
        };
      },
    });
    if (!outcome.replayed) {
      const created = outcome.response as { description: string; id: string };
      await applyIssueCreatePostCommit({
        description: created.description,
        operatorUserId: actorKey,
        photos,
        issueId: created.id,
      });
    }
    return useResponseSuccess(outcome.response);
  } catch (error) {
    logApiError('vehicle-commissioning-issues-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
