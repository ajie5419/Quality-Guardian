import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
import { requireSystemAdmin } from '~/utils/system-auth';

const schema = z.object({
  dictKey: z.string().optional(),
  dictValue: z.string().optional(),
  status: z.number().optional(),
  sort: z.number().optional(),
  remark: z.string().optional(),
});

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
    const updated = await DictionaryService.update(
      id,
      schema.parse(await readBody(event)),
      String(userinfo.username || userinfo.id),
    );
    return useResponseSuccess(updated);
  } catch (error: unknown) {
    logApiError('dictionary-update', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '字典键已存在');
    }
    return internalServerErrorResponse(event, '更新字典项失败');
  }
});
