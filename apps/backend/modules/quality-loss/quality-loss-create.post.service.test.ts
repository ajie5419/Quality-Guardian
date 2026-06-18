import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_losses: {
      create: vi.fn(),
    },
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-payload', () => ({
  buildQualityLossCreateDataWithCanonical: vi.fn(
    async (body: Record<string, unknown>, lossId: string) => ({
      amount: body.amount ?? 0,
      lossId,
      type: body.type,
    }),
  ),
  buildQualityLossCreateResponse: vi.fn((item: any) => item),
  createQualityLossId: vi.fn(() => 'QL-2026-001'),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(() => ({
    id: 'user-1',
    userId: 'user-1',
    username: 'admin',
  })),
}));

vi.mock('~/utils/request-validation', () => ({
  getMissingRequiredFields: vi.fn(
    (body: Record<string, unknown>, fields: string[]) =>
      fields.filter((f) => !body[f]),
  ),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
  })),
  internalServerErrorResponse: vi.fn((_event: any, message: string) => ({
    error: true,
    message,
  })),
  useResponseSuccess: vi.fn((data: any) => ({ data, success: true })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

describe('quality-loss-create.post.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a quality loss record with valid body', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/quality-loss/quality-loss-create.post.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ amount: 100, type: 'Material' });
    (prisma.quality_losses.create as any).mockResolvedValue({
      id: 'new-id',
      amount: 100,
      type: 'Material',
    });

    const result = await handler({} as any);

    expect(result).toEqual({
      data: { id: 'new-id', amount: 100, type: 'Material' },
      success: true,
    });
    expect(prisma.quality_losses.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'Material',
        lossId: 'QL-2026-001',
      }),
    });
    const { buildQualityLossCreateDataWithCanonical } = await import(
      '~/modules/quality-loss/quality-loss-payload'
    );
    expect(buildQualityLossCreateDataWithCanonical).toHaveBeenCalledWith(
      { amount: 100, type: 'Material' },
      'QL-2026-001',
      { createdBy: 'user-1' },
    );
  });

  it('should return bad request when required fields are missing', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/quality-loss/quality-loss-create.post.service'
    );

    vi.mocked(readBody).mockResolvedValue({});

    const result = await handler({} as any);
    expect(result).toEqual({
      error: true,
      message: expect.stringContaining('缺少必填字段'),
    });
  });

  it('should return internal error when prisma throws', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/quality-loss/quality-loss-create.post.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;

    vi.mocked(readBody).mockResolvedValue({ type: 'Material' });
    (prisma.quality_losses.create as any).mockRejectedValue(
      new Error('db error'),
    );

    const result = await handler({} as any);
    expect(result).toEqual({ error: true, message: '创建质量损失记录失败' });
  });
});
