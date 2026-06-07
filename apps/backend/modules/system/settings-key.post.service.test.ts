import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreferenceService } from '~/modules/user/preference.service';

const {
  getRouterParam,
  readBody,
  setResponseStatus,
  useResponseError,
  useResponseSuccess,
} = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
  useResponseError: vi.fn((message) => ({ message, type: 'error' })),
  useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
}));

vi.mock('h3', () => ({
  eventHandler: (handler: unknown) => handler,
  getRouterParam,
  readBody,
  setResponseStatus,
}));

vi.mock('~/modules/user/preference.service', () => ({
  PreferenceService: {
    clearAllUserPreferences: vi.fn(),
    setSystemSetting: vi.fn(),
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

vi.mock('~/utils/response', () => ({
  useResponseError,
  useResponseSuccess,
}));

describe('settings key post service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadHandler() {
    vi.resetModules();
    const mod = await import('~/modules/system/settings-key.post.service');
    return mod.default as (event: unknown) => Promise<unknown>;
  }

  it('rejects missing setting key', async () => {
    const handler = await loadHandler();
    getRouterParam.mockReturnValueOnce(undefined);

    const result = await handler({ context: {} });

    expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
    expect(result).toEqual({ message: 'Missing key parameter', type: 'error' });
    expect(PreferenceService.setSystemSetting).not.toHaveBeenCalled();
  });

  it('saves string and object values as system settings', async () => {
    const handler = await loadHandler();
    getRouterParam.mockReturnValueOnce('qms:setting:string');
    readBody.mockResolvedValueOnce({
      description: 'String setting',
      value: 'enabled',
    });

    await handler({ context: {} });

    expect(PreferenceService.setSystemSetting).toHaveBeenCalledWith(
      'qms:setting:string',
      'enabled',
      'String setting',
    );

    getRouterParam.mockReturnValueOnce('qms:setting:object');
    readBody.mockResolvedValueOnce({
      description: 'Object setting',
      value: { visible: true },
    });

    const result = await handler({ context: {} });

    expect(PreferenceService.setSystemSetting).toHaveBeenLastCalledWith(
      'qms:setting:object',
      JSON.stringify({ visible: true }),
      'Object setting',
    );
    expect(result).toEqual({
      data: { message: 'System setting saved' },
      type: 'success',
    });
  });

  it('clears chart preferences when saving default chart settings', async () => {
    const handler = await loadHandler();
    const keys = [
      ['qms:after_sales:default_charts', 'after-sales-charts'],
      ['qms:inspection_issues:default_charts', 'inspection-issues-charts'],
      ['qms:quality_loss:default_charts', 'quality-loss-charts'],
    ];

    for (const [key, preferenceKey] of keys) {
      getRouterParam.mockReturnValueOnce(key);
      readBody.mockResolvedValueOnce({ value: [] });

      await handler({ context: {} });

      expect(PreferenceService.clearAllUserPreferences).toHaveBeenCalledWith(
        preferenceKey,
      );
    }
  });

  it('returns error response when persistence fails', async () => {
    const handler = await loadHandler();
    getRouterParam.mockReturnValueOnce('qms:setting');
    readBody.mockResolvedValueOnce({ value: 'enabled' });
    (PreferenceService.setSystemSetting as any).mockRejectedValueOnce(
      new Error('write failed'),
    );

    const result = await handler({ context: {} });

    expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 500);
    expect(result).toEqual({
      message: 'Failed to save system setting',
      type: 'error',
    });
  });
});
