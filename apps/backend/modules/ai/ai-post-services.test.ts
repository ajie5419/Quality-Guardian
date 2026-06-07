import { beforeEach, describe, expect, it, vi } from 'vitest';

const readBody = vi.fn();
const setResponseStatus = vi.fn();
const callAi = vi.fn();
const extractJson = vi.fn();
const listHistoryIssues = vi.fn();
const logApiError = vi.fn();

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
  setResponseStatus,
}));

vi.mock('~/modules/ai/ai', () => ({
  callAi,
  extractJson,
}));

vi.mock('~/modules/ai/ai-route.service', () => ({
  AiRouteService: {
    listHistoryIssues,
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError,
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

function event() {
  return { node: { res: { statusCode: 200 } } } as any;
}

describe('aI post service handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes issue text and maps standard AI JSON result', async () => {
    const mod = await import('~/modules/ai/analyze.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({
      defectType: 'crack',
      description: 'weld crack',
      partName: 'frame',
    });
    callAi.mockResolvedValue('{"rootCause":"cause","solution":"fix"}');
    extractJson.mockReturnValue({ rootCause: 'cause', solution: 'fix' });

    const result = await handler(event());

    expect(result).toEqual({
      code: 0,
      data: { rootCause: 'cause', solution: 'fix' },
      error: null,
      message: 'ok',
    });
    expect(callAi).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      { temperature: 0.3 },
    );
  });

  it('aggregates non-standard analyze JSON keys into readable root cause', async () => {
    const mod = await import('~/modules/ai/analyze.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ description: 'issue', defectType: 'type' });
    callAi.mockResolvedValue('{"material":"bad","process":"late"}');
    extractJson.mockReturnValue({ material: 'bad', process: 'late' });

    const result = await handler(event());

    expect(result.data.rootCause).toContain('AI 多维度分析结论');
    expect(result.data.solution).toContain('根据上述分析');
  });

  it('extracts tags and filters invalid AI tag values', async () => {
    const mod = await import('~/modules/ai/extract-tags.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ content: 'weld crack root cause' });
    callAi.mockResolvedValue('{"tags":[" 焊接裂纹 ","",12]}');
    extractJson.mockReturnValue({ tags: [' 焊接裂纹 ', '', 12] });

    const result = await handler(event());

    expect(result.data).toEqual(['焊接裂纹']);
  });

  it('returns empty tag list without calling AI when content is missing', async () => {
    const mod = await import('~/modules/ai/extract-tags.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({});

    const result = await handler(event());

    expect(result.data).toEqual([]);
    expect(callAi).not.toHaveBeenCalled();
  });

  it('generates normalized ITP items from AI response', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ fileContent: 'ITP text' });
    callAi.mockResolvedValue('[]');
    extractJson.mockReturnValue([
      {
        processStep: 'welding',
        activity: 'dimension',
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
      }),
    );
  });

  it('rejects ITP generation when no parseable content exists', async () => {
    const mod = await import('~/modules/ai/generate-itp.post.service');
    const handler = mod.default;
    const e = event();
    readBody.mockResolvedValue({});

    const result = await handler(e);

    expect(result.message).toBe('缺少可解析内容');
    expect(setResponseStatus).toHaveBeenCalledWith(e, 400);
  });

  it('matches historical cases through AI and sorts by score', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    listHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
      { id: 'old-2', partName: 'frame', description: 'crack B' },
    ]);
    callAi.mockResolvedValue('[]');
    extractJson.mockReturnValue([
      { id: 'old-2', similarityScore: 90, matchReason: 'closer' },
      { id: 'old-1', similarityScore: 70, matchReason: 'similar' },
    ]);

    const result = await handler(event());

    expect(result.data.map((item: any) => item.id)).toEqual(['old-2', 'old-1']);
  });

  it('falls back to keyword matches when AI case matching fails', async () => {
    const mod = await import('~/modules/ai/match-cases.post.service');
    const handler = mod.default;
    readBody.mockResolvedValue({ description: 'crack', partName: 'frame' });
    listHistoryIssues.mockResolvedValue([
      { id: 'old-1', partName: 'frame', description: 'crack A' },
      { id: 'old-2', partName: 'frame', description: 'crack B' },
      { id: 'old-3', partName: 'frame', description: 'crack C' },
      { id: 'old-4', partName: 'frame', description: 'crack D' },
    ]);
    callAi.mockRejectedValue(new Error('offline'));

    const result = await handler(event());

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        matchReason: '基于关键词匹配 (AI 离线)',
        similarityScore: 50,
      }),
    );
    expect(logApiError).toHaveBeenCalledWith(
      'match-cases',
      expect.any(Error),
      undefined,
      expect.any(Object),
    );
  });
});
