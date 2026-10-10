import { defineEventHandler, getHeader, getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { FileStorageService } from '~/modules/file-storage';
import { normalizeIdempotencyKey } from '~/modules/idempotency';
import { buildSupervisionAccessContext } from '~/modules/supervision/supervision-access';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { businessErrorResponse, isBusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createIssueActionBodySchema = z
  .object({ attachments: z.array(z.any()).optional() })
  .passthrough();
export default defineEventHandler(async (event) => {
  try {
    const context = buildSupervisionAccessContext(getCurrentUser(event));
    const id = getRouterParam(event, 'id');
    if (!id) return badRequestResponse(event, '无效监造问题ID');
    const header = getHeader(event, 'Idempotency-Key');
    const key = normalizeIdempotencyKey(header);
    if (header && !key) return badRequestResponse(event, '无效幂等键');
    const body = createIssueActionBodySchema.parse(await readBody(event));
    const data = await SupervisionService.createIssueAction(
      id,
      body,
      context,
      key || undefined,
    );
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        bizId: String(data.id),
        bizType: 'supervision_issue_action',
        fieldName: 'attachments',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
      logApiError('supervision-attachment-registration', error);
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-issue-actions-create', error, undefined, event);
    if (isBusinessError(error)) return businessErrorResponse(event, error);
    return internalServerErrorResponse(
      event,
      'Failed to create supervision issue action',
    );
  }
});
