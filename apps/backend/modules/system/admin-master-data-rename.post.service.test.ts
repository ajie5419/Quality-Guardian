import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  readBody,
} = vi.hoisted(() => ({
  badRequestResponse: vi.fn((_event, message, code) => ({
    code,
    message,
    type: 'bad_request',
  })),
  conflictResponse: vi.fn((_event, message) => ({
    message,
    type: 'conflict',
  })),
  internalServerErrorResponse: vi.fn((_event, message) => ({
    message,
    type: 'internal_server_error',
  })),
  readBody: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
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

vi.mock('~/utils/response', () => ({
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
}));

describe('admin master data rename post service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadHandler() {
    vi.resetModules();
    const mod = await import(
      '~/modules/system/admin-master-data-rename.post.service'
    );
    return mod.default as (event: unknown) => Promise<unknown>;
  }

  it('validates required old and new values', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({ newValue: 'new' });

    await expect(handler({ context: {} })).resolves.toEqual({
      code: undefined,
      message: '缺少参数: oldValue',
      type: 'bad_request',
    });

    readBody.mockResolvedValueOnce({ oldValue: 'old', newValue: ' ' });

    await expect(handler({ context: {} })).resolves.toEqual({
      code: undefined,
      message: '缺少参数: newValue',
      type: 'bad_request',
    });
  });

  it('always returns disabled response for valid rename request', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({
      configKey: 'supplier_status',
      newValue: 'new',
      oldValue: 'old',
    });

    const result = await handler({ context: {} });

    expect(result).toEqual({
      code: 'MasterDataRenameDisabled',
      message: '主数据改名功能已下线',
      type: 'bad_request',
    });
  });

  it('maps legacy validation, duplicate, and generic errors', async () => {
    const handler = await loadHandler();
    readBody
      .mockRejectedValueOnce(new Error('VALIDATION:字段不合法'))
      .mockRejectedValueOnce(new Error('Duplicate entry'))
      .mockRejectedValueOnce(new Error('db down'));

    await expect(handler({ context: {} })).resolves.toEqual({
      code: undefined,
      message: '字段不合法',
      type: 'bad_request',
    });
    await expect(handler({ context: {} })).resolves.toEqual({
      message: '新值已存在，无法完成改名',
      type: 'conflict',
    });
    await expect(handler({ context: {} })).resolves.toEqual({
      message: '主数据改名失败',
      type: 'internal_server_error',
    });
  });
});
