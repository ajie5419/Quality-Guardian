import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readBody, setResponseStatus, useResponseError, useResponseSuccess } =
  vi.hoisted(() => ({
    readBody: vi.fn(),
    setResponseStatus: vi.fn(),
    useResponseError: vi.fn((message) => ({ message, type: 'error' })),
    useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
  }));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
  setResponseStatus,
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

describe('ai settings test post service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  async function loadHandler() {
    vi.resetModules();
    const mod = await import('~/modules/system/ai-settings-test.post.service');
    return mod.default as (event: unknown) => Promise<unknown>;
  }

  it('rejects missing API key or base URL before calling upstream', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({ apiKey: '', baseUrl: '' });

    const result = await handler({ context: {} });

    expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
    expect(result).toEqual({
      message: 'API Key 和 Base URL 不能为空',
      type: 'error',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls chat completions endpoint and returns success for ok response', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({
      apiKey: 'test-key',
      baseUrl: 'https://ai.example.com/v1/',
      model: 'test-model',
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await handler({ context: {} });

    expect(fetch).toHaveBeenCalledWith(
      'https://ai.example.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
        signal: expect.any(AbortSignal),
      },
    );
    expect(result).toEqual({
      data: {
        success: true,
        message: '连接测试成功：服务器响应正常',
      },
      type: 'success',
    });
  });

  it('maps non-ok upstream response to response error', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({
      apiKey: 'test-key',
      baseUrl: 'https://ai.example.com/v1',
      model: 'test-model',
    });
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('invalid token'.repeat(20)),
    });

    const result = await handler({ context: {} });

    expect(fetch).toHaveBeenCalledWith(
      'https://ai.example.com/v1/chat/completions',
      expect.any(Object),
    );
    expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 401);
    expect(result).toEqual({
      message: expect.stringContaining('连接失败 (401): invalid token'),
      type: 'error',
    });
  });

  it('maps abort errors and generic fetch errors', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValue({
      apiKey: 'test-key',
      baseUrl: 'https://ai.example.com/v1',
      model: 'test-model',
    });
    (fetch as any).mockRejectedValueOnce(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );

    await expect(handler({ context: {} })).resolves.toEqual({
      message: '连接超时：无法访问该 API 地址，请检查 Base URL 是否正确。',
      type: 'error',
    });
    expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 504);

    (fetch as any).mockRejectedValueOnce(new Error('network down'));

    await expect(handler({ context: {} })).resolves.toEqual({
      message: '连接测试异常: network down',
      type: 'error',
    });
    expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 500);
  });
});
