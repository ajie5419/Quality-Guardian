import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-record-export.get.service';

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    findAll: vi.fn(),
  },
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: vi.fn((_schema: any, handler: any) => {
    return (event: any) => handler(event, (event as any).query);
  }),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiDebug: vi.fn(),
  logApiError: vi.fn(),
  logApiWarn: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 400,
      message: msg,
    })),
  internalServerErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 500,
      message: msg,
    })),
  useResponseSuccess: vi.fn().mockImplementation((data: any) => ({
    data,
    statusCode: 200,
  })),
}));

describe('inspectionRecordExportGetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success with result data', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAll as any).mockResolvedValue({
      items: [{ id: '1' }],
      total: 1,
    });

    const result: any = await handler({ query: {} } as any);

    expect(result.data.total).toBe(1);
    expect(result.data.items).toHaveLength(1);
  });

  it('should return badRequestResponse when total exceeds limit', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAll as any).mockResolvedValue({
      items: [],
      total: 30_000,
    });

    const result: any = await handler({ query: {} } as any);

    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('超过上限');
  });

  it('should return internalServerErrorResponse on error', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAll as any).mockRejectedValue(new Error('db error'));

    const result: any = await handler({ query: {} } as any);

    expect(result.statusCode).toBe(500);
  });

  it('should pass query params to findAll', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAll as any).mockResolvedValue({
      items: [],
      total: 0,
    });

    await handler({
      query: { type: 'INCOMING', year: 2024, keyword: 'test' },
    } as any);

    expect(InspectionService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        forExport: true,
        type: 'INCOMING',
        year: 2024,
        keyword: 'test',
      }),
    );
  });

  it('should handle zero total without error', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAll as any).mockResolvedValue({
      items: [],
      total: 0,
    });

    const result: any = await handler({ query: {} } as any);

    expect(result.data.total).toBe(0);
  });
});
