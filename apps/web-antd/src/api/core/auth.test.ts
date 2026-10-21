import type { AxiosAdapter } from '@vben/request';

import { AxiosError } from '@vben/request';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as clients from '#/api/request';

import { loginApi } from './auth';

const state = vi.hoisted(() => ({
  access: {
    accessToken: 'existing-session',
    isAccessChecked: false,
    setAccessToken: vi.fn(),
    setLoginExpired: vi.fn(),
  },
  logout: vi.fn(),
  refresh: vi.fn(),
  errorMessage: vi.fn(),
}));

vi.mock('@vben/hooks', () => ({
  useAppConfig: () => ({ apiURL: '/api' }),
}));
vi.mock('@vben/preferences', () => ({
  preferences: {
    app: {
      enableRefreshToken: false,
      locale: 'zh-CN',
      loginExpiredMode: 'page',
    },
  },
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => state.access }));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('#/store', () => ({ useAuthStore: () => ({ logout: state.logout }) }));
vi.mock('#/api/core', () => ({ refreshTokenApi: state.refresh }));
vi.mock('ant-design-vue', () => ({
  message: { error: state.errorMessage, warning: vi.fn() },
  notification: { error: vi.fn(), warning: vi.fn() },
}));

const adapter = vi.fn<AxiosAdapter>(async (config) => {
  const accepted =
    config.url === '/auth/login' &&
    JSON.parse(config.data).password === 'correct';
  const response = {
    config,
    data: accepted
      ? {
          code: 0,
          data: { accessToken: 'new-session' },
          error: null,
          message: 'ok',
        }
      : {
          code: -1,
          data: null,
          error: { code: 'UNAUTHORIZED' },
          message: '用户名或密码错误',
        },
    headers: {},
    status: accepted ? 200 : 401,
    statusText: accepted ? 'OK' : 'Unauthorized',
  };
  if (!accepted) {
    throw new AxiosError(
      'Unauthorized',
      'ERR_BAD_REQUEST',
      config,
      undefined,
      response,
    );
  }
  return response;
});

for (const client of Object.values(clients)) {
  client.addRequestInterceptor({
    fulfilled: (config) => {
      config.adapter = adapter;
      return config;
    },
  });
}

describe('login authentication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a rejected login without refreshing or logging out, then accepts a retry', async () => {
    await expect(
      loginApi({ username: 'employee', password: 'wrong' }),
    ).rejects.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });

    expect(state.logout).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.access.setAccessToken).not.toHaveBeenCalled();
    expect(state.errorMessage).toHaveBeenCalledWith('用户名或密码错误');
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(
      adapter.mock.calls[0]?.[0].headers.get('Authorization'),
    ).toBeUndefined();

    const result = await loginApi({
      username: 'employee',
      password: 'correct',
    });
    expect(result.accessToken).toBe('new-session');
    expect(state.logout).not.toHaveBeenCalled();
  });

  it('still reauthenticates when a protected request returns 401', async () => {
    await expect(clients.requestClient.get('/protected')).rejects.toMatchObject(
      {
        error: { code: 'UNAUTHORIZED' },
      },
    );

    expect(state.access.setAccessToken).toHaveBeenCalledWith(null);
    expect(state.logout).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0]?.[0].headers.get('Authorization')).toBe(
      'Bearer existing-session',
    );
  });
});
