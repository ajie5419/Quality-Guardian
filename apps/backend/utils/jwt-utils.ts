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

// Load secrets from environment variables
const ACCESS_TOKEN_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  (() => {
    throw new Error('JWT_ACCESS_SECRET not set');
  })();
const REFRESH_TOKEN_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  (() => {
    throw new Error('JWT_REFRESH_SECRET not set');
  })();

export function generateAccessToken(user: UserSession) {
  return jwt.sign(user, ACCESS_TOKEN_SECRET, { expiresIn: '7d' });
}

export function generateRefreshToken(user: UserSession) {
  return jwt.sign(user, REFRESH_TOKEN_SECRET, {
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
      ACCESS_TOKEN_SECRET,
    ) as unknown as UserPayload;

    return decoded;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): null | UserSession {
  try {
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as UserPayload;
    return decoded;
  } catch {
    return null;
  }
}
