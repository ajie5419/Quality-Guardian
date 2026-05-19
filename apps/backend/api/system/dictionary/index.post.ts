import { defineEventHandler, readBody } from 'h3';
import { DictionaryService } from '~/services/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = await readBody(event);
    const created = await DictionaryService.create(
      body as Record<string, unknown>,
      String(userinfo.username || userinfo.id),
    );
    return useResponseSuccess(created);
  } catch (error: unknown) {
    logApiError('dictionary-create', error);
    const message = error instanceof Error ? error.message : '创建字典项失败';
    if (message.startsWith('VALIDATION:')) {
      return badRequestResponse(event, message.replace('VALIDATION:', ''));
    }
    if (message === 'DUPLICATE_DICT_KEY') {
      return conflictResponse(event, '字典键已存在');
    }
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '字典键已存在');
    }
    return internalServerErrorResponse(event, '创建字典项失败');
  }
});
