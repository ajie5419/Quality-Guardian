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
  sessionToken: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    return badRequestResponse(
      event,
      'sessionToken, username and password are required',
      'BadRequest',
    );
  }

  try {
    const result = await WxAuthService.wxBind(
      parsed.data.sessionToken,
      parsed.data.username,
      parsed.data.password,
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('wx-bind', error, {}, event);
    if (isBusinessError(error)) {
      setResponseStatus(event, error.httpStatus);
      return useResponseError(error.message, { code: error.code });
    }
    setResponseStatus(event, 500);
    return useResponseError('Internal server error');
  }
});
