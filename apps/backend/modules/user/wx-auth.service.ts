import type { UserSession } from '~/utils/jwt-utils';

import process from 'node:process';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { RbacService } from '~/modules/rbac';
import { BusinessError } from '~/utils/business-error';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '~/utils/jwt-utils';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('wx-auth');
const DEV_WX_OPENID = 'dev_openid_local';

function getWxAppId(): string {
  const val = process.env.WX_APPID;
  if (!val)
    throw new BusinessError('WX_CONFIG_MISSING', 'WX_APPID not set', 500);
  return val;
}

function getWxAppSecret(): string {
  const val = process.env.WX_APP_SECRET;
  if (!val)
    throw new BusinessError('WX_CONFIG_MISSING', 'WX_APP_SECRET not set', 500);
  return val;
}

function getWxSessionSecret(): string {
  const val = process.env.WX_SESSION_SECRET;
  if (!val)
    throw new BusinessError(
      'WX_CONFIG_MISSING',
      'WX_SESSION_SECRET not set',
      500,
    );
  return val;
}

interface WxSessionResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

async function fetchWxOpenId(
  code: string,
): Promise<{ openid: string; session_key: string }> {
  if (
    process.env.NODE_ENV === 'development' &&
    code.startsWith('the code is a mock')
  ) {
    logger.info('dev mode: using mock openid');
    return { openid: DEV_WX_OPENID, session_key: 'mock_sk' };
  }

  const url =
    `https://api.weixin.qq.com/sns/jscode2session` +
    `?appid=${getWxAppId()}&secret=${getWxAppSecret()}` +
    `&js_code=${code}&grant_type=authorization_code`;

  const res = await fetch(url);
  const data = (await res.json()) as WxSessionResponse;

  if (data.errcode || !data.openid || !data.session_key) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn(
        { errcode: data.errcode, errmsg: data.errmsg },
        'dev mode: WeChat code invalid, returning mock openid',
      );
      return { openid: DEV_WX_OPENID, session_key: 'mock_sk' };
    }
    logger.error(
      { errcode: data.errcode, errmsg: data.errmsg },
      'WeChat jscode2session failed',
    );
    throw new BusinessError(
      'WX_AUTH_FAILED',
      data.errmsg || 'WeChat login failed',
      401,
    );
  }
  return { openid: data.openid, session_key: data.session_key };
}

async function buildUserSession(userId: string): Promise<UserSession> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: { roles: true },
  });
  if (!user) throw new BusinessError('USER_NOT_FOUND', 'User not found', 404);

  let deptName = '';
  if (user.department) {
    const dept = await prisma.departments.findUnique({
      where: { id: user.department },
    });
    if (dept) deptName = dept.name;
  }

  return {
    avatar: '/uploads/avatar-v1.svg',
    deptName,
    id: user.id,
    realName: user.realName ?? '',
    roles: await resolveUserRoleNames(user.id, user.roles?.name),
    userId: user.id,
    username: user.username,
  };
}

async function resolveUserRoleNames(
  userId: string,
  fallbackRoleName?: null | string,
): Promise<string[]> {
  const rbacRoles = await RbacService.getUserRoles(userId);
  const roleNames = rbacRoles.map((role) => role.name?.trim()).filter(Boolean);
  if (roleNames.length > 0) return roleNames;
  return [fallbackRoleName?.trim() || 'user'];
}

export const WxAuthService = {
  async wxLogin(code: string) {
    const { openid } = await fetchWxOpenId(code);

    const user = await prisma.users.findFirst({
      where: { wxOpenId: openid, isDeleted: false },
    });

    if (!user) {
      const sessionToken = jwt.sign({ openid }, getWxSessionSecret(), {
        expiresIn: '5m',
      });
      logger.info(
        { openid },
        'wx login: no bound account, returning session token',
      );
      return { needBind: true as const, sessionToken };
    }

    if (user.status !== 'ACTIVE') {
      throw new BusinessError(
        'ACCOUNT_DISABLED',
        '账号已被禁用，请联系管理员',
        403,
      );
    }

    const userPayload = await buildUserSession(user.id);
    return {
      needBind: false as const,
      accessToken: generateAccessToken(userPayload),
      refreshToken: generateRefreshToken(userPayload),
      userPayload,
    };
  },

  async wxBind(sessionToken: string, username: string, password: string) {
    let openid: string;
    try {
      const payload = jwt.verify(sessionToken, getWxSessionSecret()) as {
        openid: string;
      };
      openid = payload.openid;
    } catch (error) {
      logger.error(error, 'wx bind: invalid session token');
      throw new BusinessError(
        'INVALID_SESSION_TOKEN',
        'Session token invalid or expired',
        401,
      );
    }

    const user = await prisma.users.findFirst({
      where: { username, isDeleted: false },
    });
    if (!user) {
      throw new BusinessError('INVALID_CREDENTIALS', '用户名或密码错误', 401);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new BusinessError('INVALID_CREDENTIALS', '用户名或密码错误', 401);
    }

    if (user.status !== 'ACTIVE') {
      throw new BusinessError(
        'ACCOUNT_DISABLED',
        '账号已被禁用，请联系管理员',
        403,
      );
    }

    if (user.wxOpenId && user.wxOpenId !== openid) {
      throw new BusinessError(
        'WX_ALREADY_BOUND',
        '该账号已绑定其他微信，请先解绑',
        409,
      );
    }

    await prisma.users.update({
      where: { id: user.id },
      data: { wxOpenId: openid },
    });

    const userPayload = await buildUserSession(user.id);
    logger.info({ userId: user.id }, 'wx bind: account bound successfully');
    return {
      accessToken: generateAccessToken(userPayload),
      refreshToken: generateRefreshToken(userPayload),
      userPayload,
    };
  },

  async wxRefresh(refreshToken: string) {
    const userinfo = verifyRefreshToken(refreshToken);
    if (!userinfo) {
      throw new BusinessError(
        'INVALID_REFRESH_TOKEN',
        'Refresh token invalid or expired',
        401,
      );
    }

    const accessToken = await import('~/modules/user/auth.service').then((m) =>
      m.AuthService.refreshAccessToken(userinfo.username),
    );
    if (!accessToken) {
      throw new BusinessError(
        'ACCOUNT_DISABLED',
        '账号不可用，请重新登录',
        403,
      );
    }

    return { accessToken };
  },

  async wxUnbind(userId: string) {
    await prisma.users.update({
      where: { id: userId },
      data: { wxOpenId: null },
    });
  },
};
