import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { SupervisionService } from '~/services/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
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
    logApiError('supervision-issues-create', error);
    return internalServerErrorResponse(
      event,
      'Failed to create supervision issue',
    );
  }
});
