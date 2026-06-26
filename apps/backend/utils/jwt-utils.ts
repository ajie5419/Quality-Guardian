import type { EventHandlerRequest, H3Event } from 'h3';

import process from 'node:process';

import { getHeader } from 'h3';
import jwt from 'jsonwebtoken';

// 定义通用的用户信息接口
export interface UserSession {
  id: number | string;
  userId?: number | string;
  username: string;
  realName: string;
  roles: string[];
  password?: string;
  homePath?: string;
  avatar?: string;
  deptName?: string;
}

export interface UserPayload extends UserSession {
  iat: number;
  exp: number;
}

function getRequiredJwtSecret(
  name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
) {
  const secret = process.env[name];
  if (!secret) throw new Error(`${name} not set`);
  return secret;
}

export function generateAccessToken(user: UserSession) {
  return jwt.sign(user, getRequiredJwtSecret('JWT_ACCESS_SECRET'), {
    expiresIn: '7d',
  });
}

export function generateRefreshToken(user: UserSession) {
  return jwt.sign(user, getRequiredJwtSecret('JWT_REFRESH_SECRET'), {
    expiresIn: '30d',
  });
}

export function verifyAccessToken(
  event: H3Event<EventHandlerRequest>,
): null | UserSession {
  const authHeader = getHeader(event, 'Authorization');
  if (!authHeader?.startsWith('Bearer')) {
    return null;
  }

  const tokenParts = authHeader.split(' ');
  if (tokenParts.length !== 2) {
    return null;
  }
  const token = tokenParts[1] as string;
  try {
    const decoded = jwt.verify(
      token,
      getRequiredJwtSecret('JWT_ACCESS_SECRET'),
    ) as unknown as UserPayload;
    const resolvedUserId = decoded.id ?? decoded.userId;
    if (resolvedUserId !== undefined && resolvedUserId !== null) {
      event.context.userId = String(resolvedUserId);
    }

    return decoded;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): null | UserSession {
  try {
    const decoded = jwt.verify(
      token,
      getRequiredJwtSecret('JWT_REFRESH_SECRET'),
    ) as UserPayload;
    return decoded;
  } catch {
    return null;
  }
}
