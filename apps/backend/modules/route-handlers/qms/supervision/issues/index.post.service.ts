import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createIssueBodySchema = z
  .object({
    description: z.unknown().optional(),
    photos: z.array(z.any()).optional(),
    projectId: z.unknown().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  try {
    const body = createIssueBodySchema.parse(await readBody(event));
    if (!String(body.projectId || '').trim()) {
      return badRequestResponse(event, '监造项目不能为空');
    }
    if (!String(body.description || '').trim()) {
      return badRequestResponse(event, '问题描述不能为空');
    }
    const data = await SupervisionService.createIssue(
      body,
      String(userinfo.id),
    );
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: Array.isArray(body.photos) ? body.photos : [],
        bizId: String(data.id),
        bizType: 'supervision_issue',
        fieldName: 'photos',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-issues-create', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to create supervision issue',
    );
  }
});
