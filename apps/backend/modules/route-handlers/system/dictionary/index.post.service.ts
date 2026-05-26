import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { DictionaryService } from '~/modules/dictionary/dictionary.service';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

const schema = z.object({
  dictType: z.string().optional(),
  dictKey: z.string().optional(),
  dictValue: z.string().optional(),
  status: z.number().optional(),
  sort: z.number().optional(),
  remark: z.string().optional(),
  isSystem: z.boolean().optional(),
});

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
    const created = await DictionaryService.create(
      schema.parse(await readBody(event)),
      String(userinfo.username || userinfo.id),
    );
    return useResponseSuccess(created);
  } catch (error: unknown) {
    logApiError('dictionary-create', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) {
      return businessErrorResponse(event, businessError);
    }
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '字典键已存在');
    }
    return internalServerErrorResponse(event, '创建字典项失败');
  }
});
