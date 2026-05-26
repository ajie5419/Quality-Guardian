import { defineEventHandler } from 'h3';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { requireSystemAdmin } from '~/modules/user/system-auth';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

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
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    return internalServerErrorResponse(event, '删除字典项失败');
  }
});
