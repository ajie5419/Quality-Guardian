import { getRequestURL } from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authMiddleware, { clearAccountStatusCache } from '~/middleware/3.auth';
import { verifyAccessToken } from '~/utils/jwt-utils';

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getRequestURL: vi.fn(),
}));

vi.mock('~/utils/jwt-utils', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  prisma: {
    users: { findFirst: vi.fn() },
  },
  default: {
    users: { findFirst: vi.fn() },
  },
}));

vi.mock('~/utils/response', () => ({
  unAuthorizedResponse: vi.fn((_event: unknown) => ({ unauthorized: true })),
}));

const prismaModule = await import('~/utils/prisma');
const mockPrisma = vi.mocked(
  prismaModule.prisma as never as {
    users: { findFirst: ReturnType<typeof vi.fn> };
  },
);

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountStatusCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeEvent(pathname: string, token: null | object, method = 'GET') {
    vi.mocked(verifyAccessToken).mockReturnValue(token as never);
    vi.mocked(getRequestURL).mockReturnValue({
      pathname,
    } as never);
    return {
      method,
      node: {
        req: {},
        res: { setHeader: vi.fn() },
      },
      context: {},
    } as unknown as Parameters<typeof authMiddleware>[0];
  }

  it('skips public paths without a token', async () => {
    const event = makeEvent('/api/auth/login', null);
    await authMiddleware(event);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('bypasses the legacy bearer only for the three exact machine POST paths', async () => {
    for (const action of ['exchange', 'identity', 'revoke']) {
      vi.mocked(verifyAccessToken).mockClear();
      const event = makeEvent(`/api/identity-bridge/${action}`, null, 'POST');
      await authMiddleware(event);
      expect(verifyAccessToken).not.toHaveBeenCalled();
      const wrongMethod = makeEvent(`/api/identity-bridge/${action}`, null);
      expect(await authMiddleware(wrongMethod)).toEqual({ unauthorized: true });
      const suffix = makeEvent(
        `/api/identity-bridge/${action}/extra`,
        null,
        'POST',
      );
      expect(await authMiddleware(suffix)).toEqual({ unauthorized: true });
    }
    for (const pathname of [
      '/api/auth/identity-bridge',
      '/api/identity-bridge/authorize',
    ]) {
      const event = makeEvent(pathname, null, 'POST');
      expect(await authMiddleware(event)).toEqual({ unauthorized: true });
    }
  });

  it('leaves only GET fulfillment sync feeds to their own client authentication', async () => {
    const feed = makeEvent('/api/integration/fulfillment/users', null);
    await authMiddleware(feed);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    for (const [pathname, method] of [
      ['/api/integration/fulfillment/users', 'POST'],
      ['/api/integration/other', 'GET'],
    ]) {
      const event = makeEvent(pathname, null, method);
      expect(await authMiddleware(event)).toEqual({ unauthorized: true });
    }
  });

  it('rejects missing or invalid tokens', async () => {
    const event = makeEvent('/api/qms/inspection/records', null);
    const result = await authMiddleware(event);
    expect(result).toEqual({ unauthorized: true });
  });

  it('rejects a token for a disabled account', async () => {
    const event = makeEvent('/api/qms/inspection/records', {
      id: 'user-1',
      userId: 'user-1',
    });
    mockPrisma.users.findFirst.mockResolvedValue({
      status: 'INACTIVE',
    } as never);
    const result = await authMiddleware(event);
    expect(result).toEqual({ unauthorized: true });
    expect(mockPrisma.users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', isDeleted: false },
      }),
    );
  });

  it('allows an active account and sets context', async () => {
    const event = makeEvent('/api/qms/inspection/records', {
      id: 'user-1',
      userId: 'user-1',
      username: 'u',
    });
    mockPrisma.users.findFirst.mockResolvedValue({
      status: 'ACTIVE',
    } as never);
    await authMiddleware(event);
    expect(event.context).toMatchObject({ userId: 'user-1' });
  });

  it('caches the account status within the TTL window', async () => {
    const event = makeEvent('/api/qms/inspection/records', {
      id: 'user-1',
      userId: 'user-1',
    });
    mockPrisma.users.findFirst.mockResolvedValue({
      status: 'ACTIVE',
    } as never);
    await authMiddleware(event);
    await authMiddleware(event);
    expect(mockPrisma.users.findFirst).toHaveBeenCalledTimes(1);
  });
});
