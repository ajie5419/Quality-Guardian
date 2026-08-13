import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
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

vi.mock('~/modules/quality-loss/quality-loss-manual-context', () => ({
  resolveManualQualityLossContext: vi.fn(async () => ({
    partId: 'part-1',
    partName: '主梁',
    projectId: 'project-1',
    projectName: '1000t 架桥机',
    workOrderNumber: 'WO-468624',
  })),
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
  useResponseError: vi.fn((message: string, options: { code: string }) => ({
    code: options.code,
    message,
  })),
  useResponseSuccess: vi.fn((data: any) => ({ data, success: true })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock('~/modules/quality-loss/quality-loss-index-queue.service', () => ({
  QualityLossIndexQueue: { enqueue: mocks.enqueue },
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

    vi.mocked(readBody).mockResolvedValue({
      amount: 100,
      partName: '主梁',
      responsibleDepartmentId: 'dept-qa',
      type: 'Material',
      workOrderNumber: 'WO-468624',
    });
    const create = vi.fn().mockResolvedValue({
      id: 'new-id',
      amount: 100,
      type: 'Material',
    });
    const findFirst = vi.fn().mockResolvedValue({
      id: 'dept-qa',
      name: 'Current Quality',
    });
    const tx = {
      departments: { findFirst },
      quality_losses: { create },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(tx),
    );

    const result = await handler({} as any);

    expect(result).toEqual({
      data: { id: 'new-id', amount: 100, type: 'Material' },
      success: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'dept-qa', isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        respDept: 'Current Quality',
        respDeptId: 'dept-qa',
        type: 'Material',
        lossId: 'QL-2026-001',
      }),
    });
    const { buildQualityLossCreateDataWithCanonical } = await import(
      '~/modules/quality-loss/quality-loss-payload'
    );
    expect(buildQualityLossCreateDataWithCanonical).toHaveBeenCalledWith(
      {
        amount: 100,
        partId: 'part-1',
        partName: '主梁',
        projectId: 'project-1',
        projectName: '1000t 架桥机',
        responsibleDepartmentId: 'dept-qa',
        type: 'Material',
        workOrderNumber: 'WO-468624',
      },
      'QL-2026-001',
      { createdBy: 'user-1' },
    );
    expect(mocks.enqueue).toHaveBeenCalledWith(
      tx,
      [{ source: 'MANUAL', sourcePk: 'new-id' }],
      'quality-loss.created',
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

    vi.mocked(readBody).mockResolvedValue({
      partName: '主梁',
      responsibleDepartmentId: 'dept-qa',
      type: 'Material',
      workOrderNumber: 'WO-468624',
    });
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('db error'));

    const result = await handler({} as any);
    expect(result).toEqual({ error: true, message: '创建质量损失记录失败' });
  });

  it('rejects an inactive department without creating a row', async () => {
    const { readBody } = await import('h3');
    const { default: handler } = await import(
      '~/modules/quality-loss/quality-loss-create.post.service'
    );
    const prismaModule = await import('~/utils/prisma');
    const prisma = prismaModule.default;
    const create = vi.fn();

    vi.mocked(readBody).mockResolvedValue({
      partName: '主梁',
      responsibleDepartmentId: 'dept-retired',
      type: 'Material',
      workOrderNumber: 'WO-468624',
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({
        departments: { findFirst: vi.fn().mockResolvedValue(null) },
        quality_losses: { create },
      }),
    );

    const result = await handler({} as any);
    expect(result).toEqual(
      expect.objectContaining({
        code: 'INVALID_RESPONSIBLE_DEPARTMENT_ID',
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });
});
