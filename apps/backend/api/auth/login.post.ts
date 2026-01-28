import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { AuthService } from '~/services/auth.service';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import {
  forbiddenResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const { password, username } = await readBody(event);

  if (!password || !username) {
    setResponseStatus(event, 400);
    return useResponseError(
      'BadRequestException',
      'Username and password are required',
    );
  }

  try {
    const { userPayload, accessToken, refreshToken } = await AuthService.login(
      username,
      password,
    );

    setRefreshTokenCookie(event, refreshToken);

    return useResponseSuccess({
      ...userPayload,
      accessToken,
    });
  } catch (error: any) {
    clearRefreshTokenCookie(event);
    return forbiddenResponse(event, error.message || 'Login failed');
  }
});
