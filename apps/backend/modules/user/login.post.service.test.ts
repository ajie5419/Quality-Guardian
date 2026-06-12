import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadBody = vi.fn();
const mockGetHeader = vi.fn();
const mockSetResponseStatus = vi.fn();
const mockSetRefreshTokenCookie = vi.fn();
const mockClearRefreshTokenCookie = vi.fn();
const mockRecordLogin = vi.fn();

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getHeader: mockGetHeader,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
}));

vi.mock('~/modules/user/auth.service', () => ({
  AuthService: {
    login: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    recordLogin: mockRecordLogin,
  },
}));

vi.mock('~/utils/cookie-utils', () => ({
  clearRefreshTokenCookie: mockClearRefreshTokenCookie,
  setRefreshTokenCookie: mockSetRefreshTokenCookie,
}));

vi.mock('~/utils/response', () => ({
  forbiddenResponse: (_event: unknown, message: string) => ({
    code: -1,
    data: null,
    error: message,
    message,
  }),
  useResponseError: (message: string, error?: unknown) => ({
    code: -1,
    data: null,
    error: error || null,
    message,
  }),
  useResponseSuccess: (data: unknown) => ({
    code: 0,
    data,
    error: null,
    message: 'ok',
  }),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

function mockEvent() {
  return {
    node: {
      req: { socket: { remoteAddress: '127.0.0.1' } },
      res: { statusCode: 200 },
    },
    path: '/api/auth/login',
    context: { requestId: 'req-1', traceId: 'trace-1' },
  } as any;
}

describe('loginPostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHeader.mockReturnValue(null);
  });

  it('should return success on valid login', async () => {
    const { AuthService } = await import('~/modules/user/auth.service');
    (AuthService.login as any).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      userPayload: {
        id: 'u1',
        username: 'admin',
        realName: 'Admin',
        roles: ['admin'],
      },
    });
    mockReadBody.mockResolvedValue({ password: 'pass', username: 'admin' });

    const mod = await import('~/modules/user/login.post.service');
    const handler = mod.default;
    const result = await handler(mockEvent());

    expect(result.code).toBe(0);
    expect(result.data.accessToken).toBe('access');
    expect(mockSetRefreshTokenCookie).toHaveBeenCalled();
  });

  it('should return 400 when username or password missing', async () => {
    mockReadBody.mockResolvedValue({ password: '', username: '' });

    const mod = await import('~/modules/user/login.post.service');
    const handler = mod.default;
    const result = await handler(mockEvent());

    expect(result.message).toBe('BadRequestException');
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
  });

  it('should return 403 on invalid credentials', async () => {
    const { AuthService } = await import('~/modules/user/auth.service');
    (AuthService.login as any).mockRejectedValue(new Error('用户名或密码错误'));
    mockReadBody.mockResolvedValue({ password: 'wrong', username: 'admin' });

    const mod = await import('~/modules/user/login.post.service');
    const handler = mod.default;
    const result = await handler(mockEvent());

    expect(result.code).toBe(-1);
    expect(result.message).toBe('用户名或密码错误');
    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
  });

  it('should extract IP from x-forwarded-for header', async () => {
    const { AuthService } = await import('~/modules/user/auth.service');
    (AuthService.login as any).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      userPayload: { id: 'u1' },
    });
    mockReadBody.mockResolvedValue({ password: 'pass', username: 'admin' });
    mockGetHeader.mockImplementation((_: unknown, name: string) => {
      if (name === 'x-forwarded-for') return '10.0.0.1, 10.0.0.2';
      return null;
    });

    const mod2 = await import('~/modules/user/login.post.service');
    const handler = mod2.default;
    await handler(mockEvent());

    expect(mockRecordLogin).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '10.0.0.1' }),
    );
  });

  it('should strip ::ffff: prefix from IP', async () => {
    const { AuthService } = await import('~/modules/user/auth.service');
    (AuthService.login as any).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      userPayload: { id: 'u1' },
    });
    mockReadBody.mockResolvedValue({ password: 'pass', username: 'admin' });

    const event = mockEvent();
    event.node.req.socket.remoteAddress = '::ffff:192.168.1.1';

    const mod3 = await import('~/modules/user/login.post.service');
    const handler = mod3.default;
    await handler(event);

    expect(mockRecordLogin).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '192.168.1.1' }),
    );
  });
});
