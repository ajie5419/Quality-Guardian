import { defineEventHandler, getRequestURL } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse } from '~/utils/response';

const PUBLIC_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/register',
  '/api/auth/wx-login',
  '/api/auth/wx-bind',
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

/**
 * Account-status check with a 60s in-memory cache. A disabled/deleted
 * account loses API access within one minute instead of remaining valid
 * for the whole access-token lifetime.
 */
const ACCOUNT_STATUS_TTL_MS = 60_000;
const accountStatusCache = new Map<
  string,
  { active: boolean; expiresAt: number }
>();

export function clearAccountStatusCache() {
  accountStatusCache.clear();
}

async function isUserActive(userId: string): Promise<boolean> {
  const cached = accountStatusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.active;

  const { prisma } = await import('~/utils/prisma');
  const user = await prisma.users.findFirst({
    select: { status: true },
    where: { id: userId, isDeleted: false },
  });
  const active = user?.status === 'ACTIVE';
  accountStatusCache.set(userId, {
    active,
    expiresAt: Date.now() + ACCOUNT_STATUS_TTL_MS,
  });
  return active;
}

export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') return;

  const pathname = getRequestURL(event).pathname;
  if (isPublicPath(pathname)) return;

  const user = verifyAccessToken(event);
  if (!user) {
    return unAuthorizedResponse(event);
  }

  const userId = user.id ?? user.userId;
  if (userId !== undefined && userId !== null) {
    event.context.user = user;
    event.context.userId = String(userId);
    const active = await isUserActive(String(userId));
    if (!active) {
      return unAuthorizedResponse(event);
    }
  }
});
