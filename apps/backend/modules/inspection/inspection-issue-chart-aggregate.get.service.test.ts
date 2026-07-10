import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/inspection/inspection-issue', () => ({
  parseInspectionIssueDateMode: vi.fn().mockReturnValue(undefined),
  parseInspectionIssueDateValue: vi.fn().mockReturnValue(undefined),
  parseOptionalIssueYear: vi.fn().mockReturnValue(2024),
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    getIssueChartAggregation: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-issue-access.service', () => ({
  InspectionIssueAccessService: {
    ensurePermission: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: vi.fn((_schema: any, handler: any) => {
    return (event: any) => handler(event, (event as any).query);
  }),
}));

vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

vi.mock('~/utils/business-error', () => ({
  businessErrorResponse: vi.fn(),
  legacyErrorToBusinessError: vi.fn().mockReturnValue(null),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

describe('inspection-issue-chart-aggregate.get.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return chart data on success', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    const { InspectionIssueAccessService } = await import(
      '~/modules/inspection/inspection-issue-access.service'
    );
    const { useResponseSuccess } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
    } as any);
    vi.mocked(InspectionService.getIssueChartAggregation).mockResolvedValue([
      { name: 'Weld', value: 5 },
    ]);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler({
      ...event,
      query: { dimension: 'defectType', metric: 'count' },
    });

    expect(useResponseSuccess).toHaveBeenCalledWith({
      items: [{ name: 'Weld', value: 5 }],
    });
    expect(InspectionIssueAccessService.ensurePermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      'QMS:Inspection:Issues:List',
    );
  });

  it('should return error for invalid dimension', async () => {
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
    } as any);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler({
      ...event,
      query: { dimension: 'invalid', metric: 'count' },
    });

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.objectContaining({ node: { req: {} } }),
      'Invalid chart aggregate params',
    );
  });

  it('should return error for invalid metric', async () => {
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
    } as any);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler({
      ...event,
      query: { dimension: 'defectType', metric: 'invalid' },
    });

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.objectContaining({ node: { req: {} } }),
      'Invalid chart aggregate params',
    );
  });

  it('should return error for invalid metric (missing handler)', async () => {
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    const { internalServerErrorResponse } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
    } as any);
    vi.mocked(InspectionService.getIssueChartAggregation).mockRejectedValue(
      new Error('db error'),
    );

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-chart-aggregate.get.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler({
      ...event,
      query: { dimension: 'defectType', metric: 'count' },
    });

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.objectContaining({ node: { req: {} } }),
      'Failed to fetch inspection issue chart aggregate',
    );
  });
});
