import { SUPERVISION_PERMISSION_CODES as SPC } from '@qgs/shared';
import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { authorizeWrite } from '~/modules/rbac';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
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
  const u = await authorizeWrite(event, SPC.EDIT);
  const uid = String(u.id);
  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造问题ID');
  try {
    const body = createIssueActionBodySchema.parse(await readBody(event));
    const data = await SupervisionService.createIssueAction(id, body, uid);
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
    return internalServerErrorResponse(
      event,
      'Failed to create supervision issue action',
    );
  }
});
