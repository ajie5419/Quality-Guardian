import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadBody = vi.fn();
const mockSetResponseStatus = vi.fn();
const mockCallAi = vi.fn();
const mockExtractJson = vi.fn();
const mockLogApiError = vi.fn();

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody: mockReadBody,
  setResponseStatus: mockSetResponseStatus,
}));

vi.mock('~/modules/ai/ai', () => ({
  callAi: mockCallAi,
  extractJson: mockExtractJson,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: mockLogApiError,
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'abc12',
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('file content'),
  },
  readFile: vi.fn().mockResolvedValue('file content'),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: (event: unknown, message: string) => {
    mockSetResponseStatus(event, 400);
    return { code: -1, data: null, error: message, message };
  },
  internalServerErrorResponse: (event: unknown, message: string) => {
    mockSetResponseStatus(event, 500);
    return { code: -1, data: null, error: message, message };
  },
  useResponseError: (message: string) => ({
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

describe('generateItpPostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should normalize ITP items from AI response', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ fileContent: 'ITP text' });
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue([
      {
        processStep: 'welding',
        activity: 'dimension check',
        standardValue: '10',
        upperTolerance: '0.2',
        lowerTolerance: '0.1',
        unit: 'mm',
      },
    ]);

    const result = await handler(event());

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'AI-ABC12',
        order: 1,
        processStep: 'welding',
        standardValue: 10,
        upperTolerance: 0.2,
        lowerTolerance: 0.1,
        isQuantitative: true,
        unit: 'mm',
      }),
    );
  });

  it('should return 400 when no content or prompt provided', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({});

    const result = await handler(event());

    expect(result.message).toBe('缺少可解析内容');
    expect(mockSetResponseStatus).toHaveBeenCalledWith(expect.anything(), 400);
  });

  it('should handle AI returning items wrapped in data field', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ fileContent: 'text' });
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue({
      data: [{ processStep: 'inspection', activity: 'visual' }],
    });

    const result = await handler(event());

    expect(result.data).toHaveLength(1);
    expect(result.data[0].processStep).toBe('inspection');
  });

  it('should handle AI returning single object instead of array', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ fileContent: 'text' });
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue({
      processStep: 'assembly',
      activity: 'torque',
    });

    const result = await handler(event());

    expect(result.data).toHaveLength(1);
  });

  it('should use prompt when fileContent is empty', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ prompt: 'Generate ITP for welding' });
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue([{ processStep: 'welding' }]);

    const result = await handler(event());

    expect(result.data).toHaveLength(1);
    expect(mockCallAi).toHaveBeenCalled();
  });

  it('should return error when AI returns empty parsed items', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    const e = event();
    mockReadBody.mockResolvedValue({ fileContent: 'text' });
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue([123, 'str', null]);

    const result = await handler(e);

    expect(mockSetResponseStatus).toHaveBeenCalledWith(e, 422);
    expect(result.code).toBe(-1);
  });
});
