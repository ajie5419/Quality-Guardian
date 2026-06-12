import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadBody = vi.fn();
const mockCallAi = vi.fn();
const mockExtractJson = vi.fn();
const mockListHistoryIssues = vi.fn();
const mockLogApiError = vi.fn();

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody: mockReadBody,
}));

vi.mock('~/modules/ai/ai', () => ({
  callAi: mockCallAi,
  extractJson: mockExtractJson,
}));

vi.mock('~/modules/ai/ai-route.service', () => ({
  AiRouteService: {
    listHistoryIssues: mockListHistoryIssues,
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: mockLogApiError,
}));

vi.mock('~/utils/response', () => ({
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

describe('matchCasesPostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should match historical cases and sort by score', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    mockListHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
      { id: 'old-2', partName: 'frame', description: 'crack B' },
    ]);
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue([
      { id: 'old-2', similarityScore: 90, matchReason: 'closer' },
      { id: 'old-1', similarityScore: 70, matchReason: 'similar' },
    ]);

    const result = await handler(event());

    expect(result.data.map((item: any) => item.id)).toEqual(['old-2', 'old-1']);
    expect(result.data[0].similarityScore).toBe(90);
  });

  it('should return empty array when no history issues found', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    mockListHistoryIssues.mockResolvedValue([]);

    const result = await handler(event());

    expect(result.data).toEqual([]);
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it('should fall back to keyword matches when AI fails', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    mockListHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
      { id: 'old-2', partName: 'frame', description: 'crack B' },
      { id: 'old-3', partName: 'frame', description: 'crack C' },
      { id: 'old-4', partName: 'frame', description: 'crack D' },
    ]);
    mockCallAi.mockRejectedValue(new Error('offline'));

    const result = await handler(event());

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        matchReason: '基于关键词匹配 (AI 离线)',
        similarityScore: 50,
      }),
    );
  });

  it('should handle AI returning wrapped matches object', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    mockListHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
    ]);
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue({
      matches: [{ id: 'old-1', similarityScore: 80, matchReason: 'match' }],
    });

    const result = await handler(event());

    expect(result.data).toHaveLength(1);
    expect(result.data[0].similarityScore).toBe(80);
  });

  it('should handle AI returning non-array non-object gracefully', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    mockListHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
    ]);
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue('invalid');

    const result = await handler(event());

    expect(result.data).toHaveLength(0);
    expect(mockLogApiError).toHaveBeenCalledWith(
      'ai-match-format',
      expect.any(Error),
    );
  });

  it('should filter out matches that do not exist in history', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    mockReadBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    mockListHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
    ]);
    mockCallAi.mockResolvedValue('[]');
    mockExtractJson.mockReturnValue([
      { id: 'old-1', similarityScore: 80, matchReason: 'match' },
      { id: 'nonexistent', similarityScore: 90, matchReason: 'nope' },
    ]);

    const result = await handler(event());

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('old-1');
  });
});
