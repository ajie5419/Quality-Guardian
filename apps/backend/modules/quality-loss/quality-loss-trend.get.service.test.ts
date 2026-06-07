import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

const {
  auditLog,
  badRequestResponse,
  buildQualityLossCreateDataWithCanonical,
  buildQualityLossCreateResponse,
  createQualityLossId,
  defineValidatedHandler,
  getCurrentUser,
  getMissingRequiredFields,
  getQuery,
  getLossSummary,
  getTrendData,
  getDrillDown,
  internalServerErrorResponse,
  logApiDebug,
  logApiError,
  logApiWarn,
  readBody,
  useResponseSuccess,
} = vi.hoisted(() => ({
  auditLog: vi.fn(),
  badRequestResponse: vi.fn((_event, message) => ({ message, type: 'bad' })),
  buildQualityLossCreateDataWithCanonical: vi.fn(async (_body, id) => ({
    amount: 100,
    lossId: id,
    type: 'Manual',
  })),
  buildQualityLossCreateResponse: vi.fn((item) => ({ id: item.lossId })),
  createQualityLossId: vi.fn(() => 'QL-2026-0001'),
  defineValidatedHandler: vi.fn((_schema, handler) => handler),
  getCurrentUser: vi.fn(),
  getDrillDown: vi.fn(),
  getLossSummary: vi.fn(),
  getMissingRequiredFields: vi.fn(),
  getQuery: vi.fn(),
  getTrendData: vi.fn(),
  internalServerErrorResponse: vi.fn((_event, message) => ({
    message,
    type: 'internal',
  })),
  logApiDebug: vi.fn(),
  logApiError: vi.fn(),
  logApiWarn: vi.fn(),
  readBody: vi.fn(),
  useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_losses: {
      create: vi.fn(),
    },
  },
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  getQuery,
  readBody,
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser,
}));

vi.mock('~/utils/request-validation', () => ({
  getMissingRequiredFields,
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
}));

vi.mock('~/utils/api-logger', () => ({
  logApiDebug,
  logApiError,
  logApiWarn,
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler,
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog,
  },
}));

vi.mock('~/modules/quality-loss/quality-loss-payload', () => ({
  buildQualityLossCreateDataWithCanonical,
  buildQualityLossCreateResponse,
  createQualityLossId,
}));

vi.mock('~/modules/quality-loss/quality-loss.service', () => ({
  QualityLossService: {
    getDrillDown,
    getLossSummary,
    getTrendData,
  },
}));

function event() {
  return { context: {} } as any;
}

describe('quality-loss route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'u-1', userId: 'u-1' });
    getMissingRequiredFields.mockReturnValue([]);
  });

  it('creates manual quality loss record and maps missing fields/internal errors', async () => {
    const mod = await import(
      '~/modules/quality-loss/quality-loss-create.post.service'
    );
    const handler = mod.default;
    readBody.mockResolvedValue({ amount: 100, type: 'Manual' });
    vi.mocked(prisma.quality_losses.create).mockResolvedValue({
      amount: 100,
      id: 'db-1',
      lossId: 'QL-2026-0001',
      type: 'Manual',
    } as never);

    expect(await handler(event())).toEqual({
      data: { id: 'QL-2026-0001' },
      type: 'success',
    });
    expect(auditLog).toHaveBeenCalledWith(
      'quality-loss',
      'create',
      expect.objectContaining({ targetId: 'db-1', userId: 'u-1' }),
    );

    getMissingRequiredFields.mockReturnValueOnce(['type']);
    expect(await handler(event())).toEqual({
      message: '缺少必填字段: type',
      type: 'bad',
    });

    getMissingRequiredFields.mockReturnValue([]);
    vi.mocked(prisma.quality_losses.create).mockRejectedValueOnce(
      new Error('db'),
    );
    expect(await handler(event())).toEqual({
      message: '创建质量损失记录失败',
      type: 'internal',
    });
  });

  it('exports quality loss data, enforces max rows, and maps failures', async () => {
    const mod = await import(
      '~/modules/quality-loss/quality-loss-export.get.service'
    );
    const handler = mod.default as any;
    getLossSummary.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
    expect(await handler(event(), { year: '2026' })).toEqual({
      data: { items: [{ id: '1' }, { id: '2' }], total: 2 },
      type: 'success',
    });

    getLossSummary.mockResolvedValueOnce(
      Array.from({ length: 20_001 }, (_, id) => ({
        id,
      })),
    );
    expect(await handler(event(), {})).toEqual({
      message: '导出数据量超过上限（20000 条），请缩小筛选范围后重试',
      type: 'bad',
    });

    getLossSummary.mockRejectedValueOnce(new Error('db'));
    expect(await handler(event(), {})).toEqual({
      message: 'Failed to export quality loss data',
      type: 'internal',
    });
  });

  it('returns trend data and period drill-down details', async () => {
    const mod = await import(
      '~/modules/quality-loss/quality-loss-trend.get.service'
    );
    const handler = mod.default;

    getQuery.mockReturnValueOnce({ granularity: 'week' });
    getTrendData.mockResolvedValueOnce({ trend: [{ period: 'W1' }] });
    expect(await handler(event())).toEqual({
      data: { trend: [{ period: 'W1' }] },
      type: 'success',
    });

    getQuery.mockReturnValueOnce({ granularity: 'month', period: '1月' });
    getDrillDown.mockResolvedValueOnce({
      commissioningLosses: [
        {
          date: new Date('2026-01-04T00:00:00.000Z'),
          description: 'Commissioning',
          id: 'vc-1',
          lossAmount: 30,
          responsibleDepartment: 'Debug',
          workOrderNumber: 'WO-3',
        },
      ],
      externalLosses: [
        {
          issueDescription: 'External',
          laborTravelCost: 5,
          materialCost: 15,
          occurDate: new Date('2026-01-03T00:00:00.000Z'),
          respDept: 'Service',
          serialNumber: 2,
          workOrderNumber: 'WO-2',
        },
      ],
      internalLosses: [
        {
          date: new Date('2026-01-02T00:00:00.000Z'),
          description: 'Internal',
          lossAmount: 20,
          responsibleDepartment: 'QA',
          serialNumber: 1,
          workOrderNumber: 'WO-1',
        },
      ],
      manualLosses: [
        {
          amount: 10,
          description: 'Manual',
          id: 'ql-1',
          lossId: 'QL-1',
          occurDate: new Date('2026-01-01T00:00:00.000Z'),
          respDept: 'QA',
        },
      ],
    });

    const response = await handler(event());
    expect(response.data.period).toBe('1月');
    expect(response.data.drillDown.map((item: any) => item.type)).toEqual([
      'COMMISSIONING',
      'EXTERNAL',
      'INTERNAL',
      'MANUAL',
    ]);

    getQuery.mockReturnValueOnce({ granularity: 'day', period: 'bad' });
    expect(await handler(event())).toEqual({
      data: { drillDown: [], period: 'bad' },
      type: 'success',
    });

    getQuery.mockReturnValueOnce({});
    getTrendData.mockRejectedValueOnce(new Error('db'));
    expect(await handler(event())).toEqual({
      message: 'Failed to fetch quality loss trend: db',
      type: 'internal',
    });
  });
});
