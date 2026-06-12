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

describe('analyzePostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return root cause and solution from standard AI response', async () => {
    const mod = await import('~/modules/ai/analyze.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({
      description: 'crack in frame',
      defectType: 'crack',
      partName: 'frame',
    });
    callAi.mockResolvedValue('response');
    extractJson.mockReturnValue({
      rootCause: 'root cause',
      solution: 'fix it',
    });

    const result = await handler(event());

    expect(result.code).toBe(0);
    expect(result.data.rootCause).toBe('root cause');
    expect(result.data.solution).toBe('fix it');
  });

  it('should aggregate non-standard keys into readable text', async () => {
    const mod = await import('~/modules/ai/analyze.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ description: 'issue', defectType: 'type' });
    callAi.mockResolvedValue('response');
    extractJson.mockReturnValue({ material: 'bad', process: 'late' });

    const result = await handler(event());

    expect(result.data.rootCause).toContain('AI 多维度分析结论');
    expect(result.data.rootCause).toContain('bad');
    expect(result.data.solution).toContain('根据上述分析');
  });

  it('should provide default solution when solution is missing', async () => {
    const mod = await import('~/modules/ai/analyze.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ description: 'issue', defectType: 'type' });
    callAi.mockResolvedValue('response');
    extractJson.mockReturnValue({ rootCause: 'cause' });

    const result = await handler(event());

    expect(result.data.rootCause).toBe('cause');
    expect(result.data.solution).toContain('预防措施');
  });

  it('should return error response when AI call fails', async () => {
    const mod = await import('~/modules/ai/analyze.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ description: 'issue', defectType: 'type' });
    callAi.mockRejectedValue(new Error('AI error'));

    const result = await handler(event());

    expect(result.code).toBe(-1);
    expect(logApiError).toHaveBeenCalled();
  });
});
