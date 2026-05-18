import { defineEventHandler, getRouterParam, readBody } from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) return badRequestResponse(event, '无效监造问题ID');

  try {
    const body = (await readBody(event)) as Record<string, unknown>;
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
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-issues-update', error);
    return internalServerErrorResponse(
      event,
      'Failed to update supervision issue',
    );
  }
});
