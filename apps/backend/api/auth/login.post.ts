import { LoginStatusEnum } from '@qgs/shared';
import { defineEventHandler, getHeader, readBody, setResponseStatus } from 'h3';
import { AuthService } from '~/services/auth.service';
import { SystemLogService } from '~/services/system-log.service';
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
  let ip =
    getHeader(event, 'x-forwarded-for') || event.node.req.socket.remoteAddress;
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (typeof ip === 'string') {
    ip = ip.replace(/^::ffff:/, '');
  }
  const userAgent = getHeader(event, 'user-agent');

  if (!password || !username) {
    setResponseStatus(event, 400);
    return useResponseError('BadRequestException', '请输入用户名和密码');
  }

  try {
    const { userPayload, accessToken, refreshToken } = await AuthService.login(
      username,
      password,
    );

    // Record success log
    await SystemLogService.recordLogin({
      username,
      ip: String(ip),
      userAgent,
      status: LoginStatusEnum.SUCCESS,
    });

    setRefreshTokenCookie(event, refreshToken);

    return useResponseSuccess({
      ...userPayload,
      accessToken,
    });
  } catch (error: any) {
    // Record failure log
    await SystemLogService.recordLogin({
      username,
      ip: String(ip),
      userAgent,
      status: LoginStatusEnum.FAIL,
      message: error.message,
    });

    clearRefreshTokenCookie(event);
    return forbiddenResponse(event, error.message || '登录失败');
  }
});
