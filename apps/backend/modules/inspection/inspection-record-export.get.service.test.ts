import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-record-export.get.service';

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    findAllForExport: vi.fn(),
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
  const authenticatedEvent = (query: Record<string, unknown> = {}) =>
    ({
      context: { user: { id: 'user-1', username: 'tester' } },
      query,
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return success with result data', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAllForExport as any).mockResolvedValue({
      items: [{ id: '1' }],
      total: 1,
    });

    const result: any = await handler(authenticatedEvent());

    expect(result.data.total).toBe(1);
    expect(result.data.items).toHaveLength(1);
  });

  it('should return badRequestResponse when total exceeds limit', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    const overLimitItems = Array.from({ length: 20_001 }, (_, i) => ({
      id: `inspection-${i}`,
    }));
    (InspectionService.findAllForExport as any).mockResolvedValue({
      items: overLimitItems,
      total: 30_000,
    });

    const result: any = await handler(authenticatedEvent());

    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('超过上限');
  });

  it('should return internalServerErrorResponse on error', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAllForExport as any).mockRejectedValue(
      new Error('db error'),
    );

    const result: any = await handler(authenticatedEvent());

    expect(result.statusCode).toBe(500);
  });

  it('should pass query params to findAllForExport', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAllForExport as any).mockResolvedValue({
      items: [],
      total: 0,
    });

    await handler(
      authenticatedEvent({ type: 'INCOMING', year: 2024, keyword: 'test' }),
    );

    expect(InspectionService.findAllForExport).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INCOMING',
        year: 2024,
        keyword: 'test',
      }),
      undefined,
    );
  });

  it('exports the team label already resolved by the shared list query', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAllForExport as any).mockResolvedValue({
      items: [{ id: 'legacy-inspection', team: 'Machining BU' }],
      total: 1,
    });

    const result: any = await handler(
      authenticatedEvent({ team: 'Machining BU' }),
    );

    expect(result.data.items).toEqual([
      { id: 'legacy-inspection', team: 'Machining BU' },
    ]);
    expect(InspectionService.findAllForExport).toHaveBeenCalledWith(
      expect.objectContaining({ team: 'Machining BU' }),
      undefined,
    );
  });

  it('should handle zero total without error', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    (InspectionService.findAllForExport as any).mockResolvedValue({
      items: [],
      total: 0,
    });

    const result: any = await handler(authenticatedEvent());

    expect(result.data.total).toBe(0);
  });
});
