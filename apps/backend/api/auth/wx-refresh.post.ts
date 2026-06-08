import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { z } from 'zod';
import { WxAuthService } from '~/modules/user/wx-auth.service';
import { logApiError } from '~/utils/api-logger';
import { isBusinessError } from '~/utils/business-error';
import {
  badRequestResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({
  refreshToken: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    return badRequestResponse(event, 'refreshToken is required', 'BadRequest');
  }

  try {
    const result = await WxAuthService.wxRefresh(parsed.data.refreshToken);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('wx-refresh', error, {}, event);
    if (isBusinessError(error)) {
      setResponseStatus(event, error.httpStatus);
      return useResponseError(error.message, { code: error.code });
    }
    setResponseStatus(event, 500);
    return useResponseError('Internal server error');
  }
});
