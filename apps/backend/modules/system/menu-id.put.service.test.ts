import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacService } from '~/modules/rbac/rbac.service';

const {
  getRequiredRouterParam,
  internalServerErrorResponse,
  isPrismaNotFoundError,
  notFoundResponse,
  readBody,
  useResponseSuccess,
} = vi.hoisted(() => ({
  getRequiredRouterParam: vi.fn(),
  internalServerErrorResponse: vi.fn((_event, message) => ({
    message,
    type: 'internal_server_error',
  })),
  isPrismaNotFoundError: vi.fn(() => false),
  notFoundResponse: vi.fn((_event, message) => ({
    message,
    type: 'not_found',
  })),
  readBody: vi.fn(),
  useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    updateMenu: vi.fn(),
  },
}));

vi.mock('~/modules/user/system-auth', () => ({
  requireSystemAdmin: vi.fn(() => null),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({ id: 'u1', username: 'admin' })),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError,
}));

vi.mock('~/utils/response', () => ({
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam,
}));

describe('menu id put service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredRouterParam.mockReturnValue('menu-1');
  });

  async function loadHandler() {
    vi.resetModules();
    const mod = await import('~/modules/system/menu-id.put.service');
    return mod.default as (event: unknown) => Promise<unknown>;
  }

  it('updates menu with parsed payload and returns success', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({
      component: 'Layout',
      icon: 'icon',
      meta: { keepAlive: true },
      name: 'MenuName',
      orderNo: 10,
      path: '/menu',
      status: 1,
      title: 'Menu',
    });

    const result = await handler({ context: {} });

    expect(RbacService.updateMenu).toHaveBeenCalledWith('menu-1', {
      component: 'Layout',
      icon: 'icon',
      meta: { keepAlive: true },
      name: 'MenuName',
      orderNo: 10,
      path: '/menu',
      status: 1,
      title: 'Menu',
    });
    expect(result).toEqual({ data: null, type: 'success' });
  });

  it('returns route-param response when menu id is missing', async () => {
    const handler = await loadHandler();
    getRequiredRouterParam.mockReturnValueOnce({
      message: '缺少菜单ID',
      type: 'bad_request',
    });

    const result = await handler({ context: {} });

    expect(result).toEqual({
      message: '缺少菜单ID',
      type: 'bad_request',
    });
    expect(RbacService.updateMenu).not.toHaveBeenCalled();
  });

  it('maps not found and generic update errors', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValue({});
    const notFoundError = new Error('not found');
    (RbacService.updateMenu as any).mockRejectedValueOnce(notFoundError);
    isPrismaNotFoundError.mockReturnValueOnce(true);

    await expect(handler({ context: {} })).resolves.toEqual({
      message: '菜单不存在',
      type: 'not_found',
    });

    (RbacService.updateMenu as any).mockRejectedValueOnce(new Error('db down'));

    await expect(handler({ context: {} })).resolves.toEqual({
      message: '更新菜单失败',
      type: 'internal_server_error',
    });
  });
});
