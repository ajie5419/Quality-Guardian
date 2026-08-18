import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';
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

const updateIssueBodySchema = z
  .object({ photos: z.array(z.any()).optional() })
  .passthrough();

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, SUPERVISION_PERMISSION_CODES.EDIT);
  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造问题ID');

  try {
    const body = updateIssueBodySchema.parse(await readBody(event));
    const data = await SupervisionService.updateIssue(id, body);
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: Array.isArray(body.photos) ? body.photos : [],
        bizId: String(data.id),
        bizType: 'supervision_issue',
        fieldName: 'photos',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
      logApiError('supervision-attachment-registration', error);
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-issues-update', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to update supervision issue',
    );
  }
});
