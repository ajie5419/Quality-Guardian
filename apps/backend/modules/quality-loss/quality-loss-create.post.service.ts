import { defineEventHandler, getHeader, readBody } from 'h3';
import { z } from 'zod';
import { createScopedRepository } from '~/modules/data-scope';
import {
  normalizeIdempotencyKey,
  withRequestIdempotency,
} from '~/modules/idempotency';
import { resolveQualityLossDepartmentWrite } from '~/modules/quality-loss/quality-loss-department-write';
import { QualityLossIndexQueue } from '~/modules/quality-loss/quality-loss-index-queue.service';
import { resolveManualQualityLossContext } from '~/modules/quality-loss/quality-loss-manual-context';
import {
  buildQualityLossCreateDataWithCanonical,
  buildQualityLossCreateResponse,
  createQualityLossId,
} from '~/modules/quality-loss/quality-loss-payload';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { buildQualityLossCreateRequestFingerprint } from './quality-loss-create-fingerprint';

const QUALITY_LOSS_CREATE_OPERATION_KEY = 'qms.quality-loss.create';
// PHASE-0 recommendation: mobile / weak-network duplicate submission needs only
// a short replay window; 5 minutes is enough for a user-initiated create.
const QUALITY_LOSS_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

const bodySchema = z
  .object({
    partName: z.string().trim().min(1),
    responsibleDepartmentId: z.string().trim().min(1),
    type: z.string().trim().min(1),
    workOrderNumber: z.string().trim().min(1),
  })
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
    const parsedBody = bodySchema.safeParse(await readBody(event));
    if (!parsedBody.success) {
      const missingField = parsedBody.error.issues[0]?.path[0] || 'body';
      return badRequestResponse(event, `缺少必填字段: ${String(missingField)}`);
    }
    const body = parsedBody.data;
    const context = await resolveManualQualityLossContext(body);
    const actorKey = String(userinfo.id || '');
    if (!actorKey) {
      return badRequestResponse(event, '无法识别当前用户身份');
    }
    const requestFingerprint = buildQualityLossCreateRequestFingerprint(
      body,
      context,
    );
    const outcome = await withRequestIdempotency({
      actorKey: `user:${actorKey}`,
      expiresAt: new Date(Date.now() + QUALITY_LOSS_IDEMPOTENCY_WINDOW_MS),
      idempotencyKey,
      operationKey: QUALITY_LOSS_CREATE_OPERATION_KEY,
      prisma,
      requestFingerprint,
      resourceGuard: async (client, resourceId) => {
        const row = await createScopedRepository(
          'quality-loss',
          client.quality_losses,
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
        const lossId = createQualityLossId();
        const createData = await buildQualityLossCreateDataWithCanonical(
          { ...body, ...context },
          lossId,
          { createdBy: actorKey || undefined },
        );
        const departmentWrite = await resolveQualityLossDepartmentWrite(
          tx,
          body.responsibleDepartmentId,
        );
        const newItem = await tx.quality_losses.create({
          data: { ...createData, ...departmentWrite },
        });
        await QualityLossIndexQueue.enqueue(
          tx,
          [{ source: 'MANUAL', sourcePk: newItem.id }],
          'quality-loss.created',
        );
        return {
          resourceId: newItem.id,
          resourceType: 'quality_losses',
          response: buildQualityLossCreateResponse(newItem),
        };
      },
    });

    if (!outcome.replayed) {
      await SystemLogService.auditLog('quality-loss', 'create', {
        userId: actorKey,
        targetId: outcome.resourceId,
        detailsVariables: {
          amount: (outcome.response as { amount?: unknown }).amount,
          type: (outcome.response as { type?: unknown }).type,
        },
      });
    }
    return useResponseSuccess(outcome.response);
  } catch (error) {
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    logApiError('quality-loss', error, undefined, event);
    return internalServerErrorResponse(event, '创建质量损失记录失败');
  }
});
