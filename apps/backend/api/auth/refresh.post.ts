import type { H3Event } from 'h3';

import { ErrorCode } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { AuthService } from '~/modules/user/auth.service';
import { BusinessError, businessErrorResponse } from '~/utils/business-error';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { verifyRefreshToken } from '~/utils/jwt-utils';

function invalidRefreshResponse(event: H3Event) {
  return businessErrorResponse(
    event,
    new BusinessError(ErrorCode.UNAUTHORIZED, '登录已失效，请重新登录', 401),
  );
}

export default defineEventHandler(async (event) => {
  const refreshToken = getRefreshTokenFromCookie(event);
  if (!refreshToken) {
    return invalidRefreshResponse(event);
  }

  clearRefreshTokenCookie(event);

  const userinfo = verifyRefreshToken(refreshToken);
  if (!userinfo) {
    return invalidRefreshResponse(event);
  }

  const accessToken = await AuthService.refreshAccessToken(userinfo.username);
  if (!accessToken) return invalidRefreshResponse(event);

  setRefreshTokenCookie(event, refreshToken);

  return accessToken;
});
