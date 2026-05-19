import { defineEventHandler, readBody } from 'h3';
import { DictionaryService } from '~/services/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
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

  const id = getRequiredRouterParam(event, 'id', '缺少字典项ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updated = await DictionaryService.update(
      id,
      body as Record<string, unknown>,
      String(userinfo.username || userinfo.id),
    );
    return useResponseSuccess(updated);
  } catch (error: unknown) {
    logApiError('dictionary-update', error);
    const message = error instanceof Error ? error.message : '更新字典项失败';
    if (message === 'NOT_FOUND') {
      return notFoundResponse(event, '字典项不存在');
    }
    if (message === 'FORBIDDEN_SYSTEM_DICT') {
      return badRequestResponse(event, '系统内置字典项不允许禁用');
    }
    if (message.startsWith('VALIDATION:')) {
      return badRequestResponse(event, message.replace('VALIDATION:', ''));
    }
    if (message === 'DUPLICATE_DICT_KEY') {
      return conflictResponse(event, '字典键已存在');
    }
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '字典键已存在');
    }
    return internalServerErrorResponse(event, '更新字典项失败');
  }
});
