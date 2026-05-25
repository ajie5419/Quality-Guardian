import { defineEventHandler } from 'h3';
import { AuthService } from '~/modules/user/auth.service';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { verifyRefreshToken } from '~/utils/jwt-utils';
import { forbiddenResponse } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const refreshToken = getRefreshTokenFromCookie(event);
  if (!refreshToken) {
    return forbiddenResponse(event);
  }

  clearRefreshTokenCookie(event);

  const userinfo = verifyRefreshToken(refreshToken);
  if (!userinfo) {
    return forbiddenResponse(event);
  }

  const accessToken = await AuthService.refreshAccessToken(userinfo.username);
  if (!accessToken) return forbiddenResponse(event);

  setRefreshTokenCookie(event, refreshToken);

  return accessToken;
});
