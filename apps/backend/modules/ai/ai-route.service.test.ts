import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAi, extractJson, getAiConfig } from '~/modules/ai/ai';
import { AiRouteService } from '~/modules/ai/ai-route.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_records: {
      findMany: vi.fn(),
    },
    system_settings: {
      findUnique: vi.fn(),
    },
  },
}));

describe('aiRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('queries recent history issues by part name and description', async () => {
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([
      { id: 'qr-1' },
    ] as never);

    await AiRouteService.listHistoryIssues('wheel');

    expect(prisma.quality_records.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        OR: [
          { partName: { contains: 'wheel' } },
          { description: { contains: 'wheel' } },
        ],
      },
      take: 15,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        partName: true,
        description: true,
        rootCause: true,
        solution: true,
        createdAt: true,
      },
    });
  });

  it('extracts structured JSON from model text', () => {
    const result = extractJson<{ risk: string }>(
      'Result:\n```json\n{"risk":"high"}\n```',
    );

    expect(result).toEqual({ risk: 'high' });
  });

  it('uses active provider configuration from system settings', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: JSON.stringify({
        provider: 'openai',
        configs: {
          deepseek: {
            apiKey: 'deepseek-key',
            baseUrl: 'https://deepseek.local',
            model: 'deepseek-chat',
          },
          openai: {
            apiKey: 'openai-key',
            baseUrl: 'https://openai.local',
            model: 'gpt-test',
          },
        },
      }),
    } as never);

    await expect(getAiConfig()).resolves.toEqual({
      apiKey: 'openai-key',
      baseUrl: 'https://openai.local',
      model: 'gpt-test',
    });
  });

  it('falls back to environment AI settings when db config is missing or placeholder', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: JSON.stringify({
        apiKey: 'xxx-placeholder',
        baseUrl: 'https://db.local',
        model: 'db-model',
      }),
    } as never);

    const result = await getAiConfig();

    expect(result).toEqual(
      expect.objectContaining({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
      }),
    );
  });

  it('calls chat completion API with configured model and returns content', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: JSON.stringify({
        apiKey: 'ai-key',
        baseUrl: 'https://ai.local/v1',
        model: 'deepseek-chat',
      }),
    } as never);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'answer' } }],
      }),
    } as any);

    const result = await callAi([{ role: 'user', content: 'hello' }], {
      max_tokens: 128,
      temperature: 0.2,
    });

    expect(result).toBe('answer');
    expect(fetch).toHaveBeenCalledWith(
      'https://ai.local/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ai-key',
        }),
        body: expect.stringContaining('"model":"deepseek-chat"'),
      }),
    );
  });

  it('moves system prompt into user prompt for reasoner models', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: JSON.stringify({
        apiKey: 'ai-key',
        baseUrl: 'https://ai.local/v1/',
        model: 'deepseek-reasoner',
      }),
    } as never);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { reasoning_content: 'reasoning only' } }],
      }),
    } as any);

    const result = await callAi([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'user task' },
    ]);

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(result).toBe('reasoning only');
    expect(body.messages).toEqual([
      { role: 'user', content: 'system rules\n\n指令要求：\nuser task' },
    ]);
    expect(body.temperature).toBeUndefined();
  });

  it('maps non-ok and empty AI responses to explicit errors', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: JSON.stringify({
        apiKey: 'ai-key',
        baseUrl: 'https://ai.local/v1',
        model: 'deepseek-chat',
      }),
    } as never);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('upstream failed'),
    } as any);

    await expect(callAi([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'AI 服务返回错误 (500): upstream failed',
    );

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ finish_reason: 'content_filter', message: {} }],
      }),
    } as any);

    await expect(callAi([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      'AI 返回内容被内容安全过滤器拦截。',
    );
  });
});
