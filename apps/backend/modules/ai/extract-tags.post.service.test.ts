import { beforeEach, describe, expect, it, vi } from 'vitest';

const readBody = vi.fn();
const callAi = vi.fn();
const extractJson = vi.fn();
const logApiError = vi.fn();

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
}));

vi.mock('~/modules/ai/ai', () => ({
  callAi,
  extractJson,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError,
}));

vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: (_event: unknown, message: string) => ({
    code: -1,
    data: null,
    error: message,
    message,
  }),
  useResponseSuccess: (data: unknown) => ({
    code: 0,
    data,
    error: null,
    message: 'ok',
  }),
}));

function event() {
  return { node: { res: { statusCode: 200 } } } as any;
}

describe('extractTagsPostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract and filter valid tags', async () => {
    const mod = await import('~/modules/ai/extract-tags.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ content: 'weld crack description' });
    callAi.mockResolvedValue('response');
    extractJson.mockReturnValue({ tags: [' 焊接裂纹 ', '', 12, '传感器失效'] });

    const result = await handler(event());

    expect(result.data).toEqual(['焊接裂纹', '传感器失效']);
  });

  it('should return empty array when content is missing', async () => {
    const mod = await import('~/modules/ai/extract-tags.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({});

    const result = await handler(event());

    expect(result.data).toEqual([]);
    expect(callAi).not.toHaveBeenCalled();
  });

  it('should handle AI returning array directly', async () => {
    const mod = await import('~/modules/ai/extract-tags.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ content: 'issue description' });
    callAi.mockResolvedValue('response');
    extractJson.mockReturnValue(['tag1', 'tag2']);

    const result = await handler(event());

    expect(result.data).toEqual(['tag1', 'tag2']);
  });

  it('should return error response when AI call fails', async () => {
    const mod = await import('~/modules/ai/extract-tags.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ content: 'description' });
    callAi.mockRejectedValue(new Error('AI failure'));

    const result = await handler(event());

    expect(result.code).toBe(-1);
    expect(result.message).toContain('AI 提取标签失败');
    expect(logApiError).toHaveBeenCalled();
  });
});
