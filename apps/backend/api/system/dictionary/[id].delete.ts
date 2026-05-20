import { defineEventHandler } from 'h3';
import { DictionaryService } from '~/services/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  badRequestResponse,
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
    await DictionaryService.delete(
      id,
      String(userinfo.username || userinfo.id),
    );
    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('dictionary-delete', error, undefined, event);
    const message = error instanceof Error ? error.message : '删除字典项失败';
    if (message === 'NOT_FOUND') {
      return notFoundResponse(event, '字典项不存在');
    }
    if (message === 'FORBIDDEN_SYSTEM_DICT') {
      return badRequestResponse(event, '系统内置字典项不允许删除');
    }
    return internalServerErrorResponse(event, '删除字典项失败');
  }
});
