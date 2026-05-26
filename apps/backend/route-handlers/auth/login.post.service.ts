import { LoginStatusEnum } from '@qgs/shared';
import { defineEventHandler, getHeader, readBody, setResponseStatus } from 'h3';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { AuthService } from '~/modules/user/auth.service';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { createModuleLogger } from '~/utils/logger';
import {
  forbiddenResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

const logger = createModuleLogger('AuthLoginAPI');

async function recordLoginLog(
  params: Parameters<typeof SystemLogService.recordLogin>[0],
  context: Record<string, unknown>,
) {
  try {
    await SystemLogService.recordLogin(params);
  } catch (error) {
    logger.warn(
      {
        context,
        err: error,
        username: params.username,
      },
      'Failed to record login log',
    );
  }
}

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

    void recordLoginLog(
      {
        username,
        ip: String(ip),
        userAgent,
        status: LoginStatusEnum.SUCCESS,
      },
      {
        path: event.path,
        requestId: event.context.requestId,
        traceId: event.context.traceId,
      },
    );

    setRefreshTokenCookie(event, refreshToken);

    return useResponseSuccess({
      ...userPayload,
      accessToken,
    });
  } catch (error: any) {
    void recordLoginLog(
      {
        username,
        ip: String(ip),
        userAgent,
        status: LoginStatusEnum.FAIL,
        message: error.message,
      },
      {
        path: event.path,
        requestId: event.context.requestId,
        traceId: event.context.traceId,
      },
    );

    clearRefreshTokenCookie(event);
    return forbiddenResponse(event, error.message || '登录失败');
  }
});
