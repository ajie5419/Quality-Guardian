import { ErrorCode } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '~/modules/user/auth.service';
import handler from '~/modules/user/login.post.service';
import { BusinessError } from '~/utils/business-error';

const {
  mockReadBody,
  mockGetHeader,
  mockSetResponseStatus,
  mockSetRefreshTokenCookie,
  mockClearRefreshTokenCookie,
  mockRecordLogin,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockReadBody: vi.fn(),
  mockGetHeader: vi.fn(),
  mockSetResponseStatus: vi.fn(),
  mockSetRefreshTokenCookie: vi.fn(),
  mockClearRefreshTokenCookie: vi.fn(),
  mockRecordLogin: vi.fn(),
  mockLoggerError: vi.fn(),
}));

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

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: mockLoggerError,
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

    const result = await handler(mockEvent());

    expect(result.code).toBe(0);
    expect(result.data.accessToken).toBe('access');
    expect(mockSetRefreshTokenCookie).toHaveBeenCalled();
  });

  it('should return 400 when username or password missing', async () => {
    mockReadBody.mockResolvedValue({ password: '', username: '' });

    const result = await handler(mockEvent());

    expect(result.message).toBe('BadRequestException');
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
  });

  it('should return 401 on invalid credentials', async () => {
    vi.mocked(AuthService.login).mockRejectedValue(
      new BusinessError(ErrorCode.UNAUTHORIZED, '用户名或密码错误', 401),
    );
    mockReadBody.mockResolvedValue({ password: 'wrong', username: 'admin' });

    const result = await handler(mockEvent());

    expect(result.code).toBe(-1);
    expect(result.error).toEqual({ code: ErrorCode.UNAUTHORIZED });
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
  });

  it.each([
    new Error('A2_PRIVATE_DATABASE_DIAGNOSTIC'),
    'A2_PRIVATE_DATABASE_DIAGNOSTIC',
  ])('returns a generic 500 for infrastructure failures', async (failure) => {
    vi.mocked(AuthService.login).mockRejectedValue(failure);
    mockReadBody.mockResolvedValue({ username: 'admin', password: 'pass' });

    const result = await handler(mockEvent());

    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 500);
    expect(result).toMatchObject({ code: -1, data: null, error: null });
    expect(JSON.stringify(result)).not.toContain(
      'A2_PRIVATE_DATABASE_DIAGNOSTIC',
    );
    expect(JSON.stringify(mockRecordLogin.mock.calls)).not.toContain(
      'A2_PRIVATE_DATABASE_DIAGNOSTIC',
    );
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: failure,
        requestId: 'req-1',
        traceId: 'trace-1',
      }),
      expect.any(String),
    );
    expect(mockSetRefreshTokenCookie).not.toHaveBeenCalled();
    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
  });

  it('should extract IP from x-forwarded-for header', async () => {
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

    await handler(mockEvent());

    expect(mockRecordLogin).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '10.0.0.1' }),
    );
  });

  it('should strip ::ffff: prefix from IP', async () => {
    (AuthService.login as any).mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      userPayload: { id: 'u1' },
    });
    mockReadBody.mockResolvedValue({ password: 'pass', username: 'admin' });

    const event = mockEvent();
    event.node.req.socket.remoteAddress = '::ffff:192.168.1.1';

    await handler(event);

    expect(mockRecordLogin).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '192.168.1.1' }),
    );
  });
});
