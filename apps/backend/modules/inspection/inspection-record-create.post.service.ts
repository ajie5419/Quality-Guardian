import { defineEventHandler, getHeader, readBody } from 'h3';
import { createScopedRepository } from '~/modules/data-scope';
import {
  normalizeIdempotencyKey,
  withRequestIdempotency,
} from '~/modules/idempotency';
import {
  runInspectionRecordPostCommitTask,
  syncLinkedIssuePostCommitEffects,
} from '~/modules/inspection/inspection-record-create-effects.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemService } from '~/modules/system/system.service';
import { logApiError, logApiWarn } from '~/utils/api-logger';
import {
  BusinessError,
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { buildInspectionRecordCreateRequestFingerprint } from './inspection-record-create-fingerprint';
import { isInspectionSerialNumberConflict } from './inspection-record-types';

const INSPECTION_RECORD_CREATE_OPERATION_KEY = 'qms.inspection-record.create';
// Mobile / weak-network duplicate submission only needs a short replay
// window; 5 minutes is enough for a user-initiated create.
const INSPECTION_RECORD_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

export default defineEventHandler(async (event) => {
  try {
    const userinfo = getCurrentUser(event);
    const idempotencyKey = normalizeIdempotencyKey(
      getHeader(event, 'Idempotency-Key'),
    );
    if (!idempotencyKey) {
      return badRequestResponse(
        event,
        '缺少有效的 Idempotency-Key 请求头（8-128 字符，仅字母数字与 . _ ~ -）',
      );
    }
    const body = await readBody(event);

    const isEnabled = await SystemService.isInspectionManualCreateEnabled();
    if (!isEnabled) {
      throw new BusinessError(
        'INSPECTION_MANUAL_CREATE_DISABLED',
        'Manual creation of inspection records is disabled',
        403,
      );
    }

    const actorKey = String(userinfo?.id || '');
    if (!actorKey) {
      return badRequestResponse(event, '无法识别当前用户身份');
    }

    // The business create retries on inspection serial-number conflicts; with
    // the caller-provided idempotency transaction the retry restarts the whole
    // claim+create so the claim row rolls back together with the failed write.
    let outcome: Awaited<ReturnType<typeof withRequestIdempotency>> | null =
      null;
    for (let attempt = 1; ; attempt++) {
      try {
        outcome = await withRequestIdempotency({
          actorKey: `user:${actorKey}`,
          expiresAt: new Date(
            Date.now() + INSPECTION_RECORD_IDEMPOTENCY_WINDOW_MS,
          ),
          idempotencyKey,
          operationKey: INSPECTION_RECORD_CREATE_OPERATION_KEY,
          prisma,
          requestFingerprint:
            buildInspectionRecordCreateRequestFingerprint(body),
          resourceGuard: async (client, resourceId) => {
            const row = await createScopedRepository(
              'inspection',
              client.inspections,
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
            const result = await InspectionService.create(body, tx, userinfo);
            return {
              resourceId: result.id,
              resourceType: 'inspections',
              response: result,
            };
          },
        });
        break;
      } catch (error) {
        if (attempt >= 5 || !isInspectionSerialNumberConflict(error)) {
          throw error;
        }
        logApiWarn(
          'inspection-record-create',
          'inspection serial number conflict, retrying idempotent create',
          { attempt },
        );
      }
    }

    if (!outcome.replayed) {
      const result = outcome.response as {
        id: string;
        linkedIssue?: null | {
          id: string;
          nonConformanceNumber: null | string;
          partName: string;
        };
        projectName?: null | string;
        workOrderNumber?: null | string;
      };
      await runInspectionRecordPostCommitTask('audit-log', () =>
        recordBusinessAuditLog(event, {
          userId: userinfo?.id,
          action: 'CREATE',
          targetType: 'inspection_record',
          targetId: String(result.id),
          detailsTemplate: '新增检验记录: {{record}}',
          detailsVariables: {
            record: result.projectName || result.workOrderNumber || result.id,
          },
        }),
      );
      const linkedIssue = result.linkedIssue;
      if (linkedIssue) {
        await syncLinkedIssuePostCommitEffects({
          issue: linkedIssue,
          photos: body.linkedIssue?.photos,
          userinfo,
        });
      }
    }
    return useResponseSuccess(outcome.response);
  } catch (error: unknown) {
    logApiError('inspection-create', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    return internalServerErrorResponse(
      event,
      'Failed to create inspection record',
    );
  }
});
