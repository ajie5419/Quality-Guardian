import { defineEventHandler } from 'h3';
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { generateAccessToken, verifyRefreshToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
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

  // 从数据库查询真实用户
  const dbUser = await prisma.users.findUnique({
    where: { username: userinfo.username },
    include: { roles: true },
  });

  if (!dbUser) {
    return forbiddenResponse(event);
  }

  // Security: Check user status during refresh
  if (dbUser.status !== 'ACTIVE') {
    return forbiddenResponse(event);
  }

  // 构造与 generateAccessToken 兼容的负载
  const userPayload = {
    id: dbUser.id,
    realName: dbUser.realName,
    roles: [dbUser.roles?.name || 'user'],
    username: dbUser.username,
  };

  const accessToken = generateAccessToken(userPayload);

  setRefreshTokenCookie(event, refreshToken);

  return accessToken;
});
