import { defineEventHandler, getRequestURL } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse } from '~/utils/response';

const PUBLIC_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/register',
  '/api/auth/departments',
  '/api/index',
  '/api/qms/public/',
  '/api/status',
  '/api/telegram/',
  '/api/uploads/',
];

const PUBLIC_PATHS = new Set(['/api', '/api/']);

function isPublicPath(pathname: string) {
  if (!pathname.startsWith('/api/')) return true;
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default defineEventHandler((event) => {
  if (event.method === 'OPTIONS') return;

  const pathname = getRequestURL(event).pathname;
  if (isPublicPath(pathname)) return;

  const user = verifyAccessToken(event);
  if (!user) {
    return unAuthorizedResponse(event);
  }

  event.context.user = user;
  const userId = user.id ?? user.userId;
  if (userId !== undefined && userId !== null) {
    event.context.userId = String(userId);
  }
});
