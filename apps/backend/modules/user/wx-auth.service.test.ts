import process from 'node:process';

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '~/modules/user/auth.service';
import { WxAuthService } from '~/modules/user/wx-auth.service';
import { verifyRefreshToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';

// ── mock declarations ────────────────────────────────────────────────────────

vi.mock('~/utils/prisma', () => ({
  default: {
    users: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    departments: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('~/utils/jwt-utils', () => ({
  generateAccessToken: vi.fn(() => 'mock-access-token'),
  generateRefreshToken: vi.fn(() => 'mock-refresh-token'),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('~/modules/user/auth.service', () => ({
  AuthService: {
    refreshAccessToken: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-session-token'),
    verify: vi.fn(),
  },
}));

// ── helpers / fixtures ───────────────────────────────────────────────────────

const mockUser = {
  id: 'user-cuid-1',
  username: 'testuser',
  password: 'hashed-password',
  realName: 'Test User',
  wxOpenId: null as null | string,
  status: 'ACTIVE',
  department: null as null | string,
  roles: { id: 'role-1', name: 'operator' },
};

function mockFetch(data: object, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(data),
  } as any);
}

// ── wxLogin ───────────────────────────────────────────────────────────────────

describe('wxAuthService.wxLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.WX_APPID = 'test-appid';
    process.env.WX_APP_SECRET = 'test-secret';
    process.env.WX_SESSION_SECRET = 'test-session-secret';
  });

  it('returns tokens and userPayload when openid is bound to an active account', async () => {
    const boundUser = { ...mockUser, wxOpenId: 'wx-openid-123' };
    mockFetch({ openid: 'wx-openid-123', session_key: 'sk' });
    (prisma.users.findFirst as any).mockResolvedValue(boundUser);
    (prisma.users.findUnique as any).mockResolvedValue(boundUser);
    (prisma.departments.findUnique as any).mockResolvedValue(null);

    const result = await WxAuthService.wxLogin('auth-code');

    expect(result.needBind).toBe(false);
    expect((result as any).accessToken).toBe('mock-access-token');
    expect((result as any).refreshToken).toBe('mock-refresh-token');
    expect((result as any).userPayload).toMatchObject({
      username: 'testuser',
      realName: 'Test User',
    });
  });

  it('returns needBind:true and sessionToken when openid has no bound account', async () => {
    mockFetch({ openid: 'wx-unbound-openid', session_key: 'sk' });
    (prisma.users.findFirst as any).mockResolvedValue(null);
    (jwt.sign as any).mockReturnValue('mock-session-token');

    const result = await WxAuthService.wxLogin('auth-code');

    expect(result.needBind).toBe(true);
    expect((result as any).sessionToken).toBe('mock-session-token');
    expect(jwt.sign).toHaveBeenCalledWith(
      { openid: 'wx-unbound-openid' },
      'test-session-secret',
      { expiresIn: '5m' },
    );
  });

  it('uses a stable local openid for WeChat devtool mock codes', async () => {
    process.env.NODE_ENV = 'development';
    (prisma.users.findFirst as any).mockResolvedValue(null);
    (jwt.sign as any).mockReturnValue('mock-session-token');

    await WxAuthService.wxLogin('the code is a mock one');
    await WxAuthService.wxLogin('the code is a mock two');

    expect(jwt.sign).toHaveBeenNthCalledWith(
      1,
      { openid: 'dev_openid_local' },
      'test-session-secret',
      { expiresIn: '5m' },
    );
    expect(jwt.sign).toHaveBeenNthCalledWith(
      2,
      { openid: 'dev_openid_local' },
      'test-session-secret',
      { expiresIn: '5m' },
    );
  });

  it('uses a stable local openid when WeChat rejects codes in development', async () => {
    process.env.NODE_ENV = 'development';
    mockFetch({ errcode: 40_029, errmsg: 'invalid code' });
    (prisma.users.findFirst as any).mockResolvedValue(null);
    (jwt.sign as any).mockReturnValue('mock-session-token');

    await WxAuthService.wxLogin('wx-code-a');
    await WxAuthService.wxLogin('wx-code-b');

    expect(jwt.sign).toHaveBeenNthCalledWith(
      1,
      { openid: 'dev_openid_local' },
      'test-session-secret',
      { expiresIn: '5m' },
    );
    expect(jwt.sign).toHaveBeenNthCalledWith(
      2,
      { openid: 'dev_openid_local' },
      'test-session-secret',
      { expiresIn: '5m' },
    );
  });

  it('throws WX_AUTH_FAILED when WeChat API returns errcode', async () => {
    mockFetch({ errcode: 40_029, errmsg: 'invalid code' });

    await expect(WxAuthService.wxLogin('bad-code')).rejects.toMatchObject({
      code: 'WX_AUTH_FAILED',
    });
  });

  it('throws ACCOUNT_DISABLED when bound user is not ACTIVE', async () => {
    const inactiveUser = {
      ...mockUser,
      wxOpenId: 'wx-openid-123',
      status: 'INACTIVE',
    };
    mockFetch({ openid: 'wx-openid-123', session_key: 'sk' });
    (prisma.users.findFirst as any).mockResolvedValue(inactiveUser);

    await expect(WxAuthService.wxLogin('auth-code')).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('throws WX_CONFIG_MISSING when WX_APPID env var is absent', async () => {
    delete process.env.WX_APPID;

    await expect(WxAuthService.wxLogin('auth-code')).rejects.toMatchObject({
      code: 'WX_CONFIG_MISSING',
    });
  });
});

// ── wxBind ────────────────────────────────────────────────────────────────────

describe('wxAuthService.wxBind', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WX_SESSION_SECRET = 'test-session-secret';
    // default: session token verifies cleanly
    (jwt.verify as any).mockReturnValue({ openid: 'wx-openid-123' });
  });

  it('updates wxOpenId and returns tokens on successful bind', async () => {
    const unboundUser = { ...mockUser, wxOpenId: null };
    (prisma.users.findFirst as any).mockResolvedValue(unboundUser);
    (bcrypt.compare as any).mockResolvedValue(true);
    (prisma.users.update as any).mockResolvedValue({});
    (prisma.users.findUnique as any).mockResolvedValue(unboundUser);
    (prisma.departments.findUnique as any).mockResolvedValue(null);

    const result = await WxAuthService.wxBind(
      'valid-session-token',
      'testuser',
      'pass',
    );

    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'user-cuid-1' },
      data: { wxOpenId: 'wx-openid-123' },
    });
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');
    expect(result.userPayload).toMatchObject({ username: 'testuser' });
  });

  it('throws INVALID_SESSION_TOKEN when jwt.verify throws', async () => {
    (jwt.verify as any).mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(
      WxAuthService.wxBind('expired-token', 'testuser', 'pass'),
    ).rejects.toMatchObject({ code: 'INVALID_SESSION_TOKEN' });
  });

  it('throws INVALID_CREDENTIALS when username does not exist', async () => {
    (prisma.users.findFirst as any).mockResolvedValue(null);

    await expect(
      WxAuthService.wxBind('valid-session-token', 'ghost', 'pass'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws INVALID_CREDENTIALS when password is wrong', async () => {
    (prisma.users.findFirst as any).mockResolvedValue(mockUser);
    (bcrypt.compare as any).mockResolvedValue(false);

    await expect(
      WxAuthService.wxBind('valid-session-token', 'testuser', 'wrong-pass'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws WX_ALREADY_BOUND when account is bound to a different openid', async () => {
    const alreadyBound = { ...mockUser, wxOpenId: 'different-openid' };
    (prisma.users.findFirst as any).mockResolvedValue(alreadyBound);
    (bcrypt.compare as any).mockResolvedValue(true);

    await expect(
      WxAuthService.wxBind('valid-session-token', 'testuser', 'pass'),
    ).rejects.toMatchObject({ code: 'WX_ALREADY_BOUND' });
  });

  it('throws ACCOUNT_DISABLED when user status is not ACTIVE', async () => {
    const disabledUser = { ...mockUser, wxOpenId: null, status: 'INACTIVE' };
    (prisma.users.findFirst as any).mockResolvedValue(disabledUser);
    (bcrypt.compare as any).mockResolvedValue(true);

    await expect(
      WxAuthService.wxBind('valid-session-token', 'testuser', 'pass'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });
});

// ── wxRefresh ─────────────────────────────────────────────────────────────────

describe('wxAuthService.wxRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns new accessToken when refresh token is valid', async () => {
    const session = {
      username: 'testuser',
      id: 'user-cuid-1',
      roles: ['operator'],
    };
    (verifyRefreshToken as any).mockReturnValue(session);
    (AuthService.refreshAccessToken as any).mockResolvedValue(
      'new-access-token',
    );

    const result = await WxAuthService.wxRefresh('valid-refresh-token');

    expect(verifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    expect(AuthService.refreshAccessToken).toHaveBeenCalledWith('testuser');
    expect(result).toEqual({ accessToken: 'new-access-token' });
  });

  it('throws INVALID_REFRESH_TOKEN when verifyRefreshToken returns null', async () => {
    (verifyRefreshToken as any).mockReturnValue(null);

    await expect(
      WxAuthService.wxRefresh('expired-token'),
    ).rejects.toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('throws ACCOUNT_DISABLED when refreshAccessToken returns null', async () => {
    const session = {
      username: 'testuser',
      id: 'user-cuid-1',
      roles: ['operator'],
    };
    (verifyRefreshToken as any).mockReturnValue(session);
    (AuthService.refreshAccessToken as any).mockResolvedValue(null);

    await expect(
      WxAuthService.wxRefresh('valid-refresh-token'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });
});
