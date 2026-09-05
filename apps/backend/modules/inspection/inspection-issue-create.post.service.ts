import { defineEventHandler, getHeader, readBody } from 'h3';
import { createScopedRepository } from '~/modules/data-scope';
import { FileStorageService } from '~/modules/file-storage';
import {
  normalizeIdempotencyKey,
  withRequestIdempotency,
} from '~/modules/idempotency';
import { SystemLogService } from '~/modules/system-log';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

import { buildInspectionIssueCreateRequestFingerprint } from './inspection-issue-create-fingerprint';
import {
  assertIssueCreateSourceContext,
  createIssueWithSerialRetry,
  InspectionIssueMutationService,
} from './inspection-issue-mutation.service';
import { parseInspectionIssueCreateBody } from './inspection-issue.schema';

const INSPECTION_ISSUE_CREATE_OPERATION_KEY = 'qms.inspection-nc.create';
// Mobile / weak-network duplicate submission only needs a short replay
// window; 5 minutes is enough for a user-initiated create.
const INSPECTION_ISSUE_IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

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
    const body = parseInspectionIssueCreateBody(await readBody(event));
    assertIssueCreateSourceContext(body);
    const actorKey = String(userinfo.id || '');
    if (!actorKey) {
      return badRequestResponse(event, '无法识别当前用户身份');
    }
    const outcome = await createIssueWithSerialRetry(() =>
      withRequestIdempotency({
        actorKey: `user:${actorKey}`,
        expiresAt: new Date(
          Date.now() + INSPECTION_ISSUE_IDEMPOTENCY_WINDOW_MS,
        ),
        idempotencyKey,
        operationKey: INSPECTION_ISSUE_CREATE_OPERATION_KEY,
        prisma,
        requestFingerprint: buildInspectionIssueCreateRequestFingerprint(body),
        resourceGuard: async (client, resourceId) => {
          const row = await createScopedRepository(
            'inspection',
            client.quality_records,
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
          const newRecord =
            await InspectionIssueMutationService.createIssueInTransaction(
              userinfo,
              body,
              tx,
            );
          return {
            resourceId: newRecord.record.id,
            resourceType: 'quality_records',
            response: {
              ...newRecord.record,
              ncNumber: newRecord.ncNumber,
            },
          };
        },
      }),
    );
    if (!outcome.replayed) {
      const created = outcome.response as {
        id: string;
        nonConformanceNumber: null | string;
        partName: string;
      };
      try {
        await FileStorageService.registerReferencesFromAttachments({
          attachments: body.photos,
          bizId: String(created.id),
          bizType: 'inspection_issue',
          fieldName: 'photos',
        });
      } catch (error) {
        logApiError(
          'inspection-issue attachment references after create',
          error,
        );
      }
      try {
        await SystemLogService.auditLog('inspection', 'issueCreate', {
          userId: String(userinfo.id),
          targetId: String(created.id),
          detailsVariables: {
            nonConformanceNumber: created.nonConformanceNumber || '无编号',
            partName: created.partName,
          },
        });
      } catch (error) {
        logApiError('inspection-issue audit after create', error);
      }
    }
    return useResponseSuccess(outcome.response);
  } catch (error) {
    logApiError('issues', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, 'NC number already exists');
    }
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
