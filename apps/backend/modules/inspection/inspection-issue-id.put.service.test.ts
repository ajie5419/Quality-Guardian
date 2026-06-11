import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/inspection/inspection-api.service', () => ({
  InspectionApiService: {
    updateIssue: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  findInspectionIssueAccessRecord: vi.fn(),
  hasInspectionIssueWriteAccess: vi.fn(),
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  forbiddenResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  notFoundResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: vi.fn().mockReturnValue(false),
}));

describe('inspection-issue-id.put.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return not found when record does not exist', async () => {
    const { findInspectionIssueAccessRecord } = await import(
      '~/modules/inspection/inspection-issue'
    );
    const { notFoundResponse } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
      roles: [],
    } as any);
    vi.mocked(getRequiredRouterParam).mockReturnValue('rec-1' as any);
    vi.mocked(findInspectionIssueAccessRecord).mockResolvedValue(null);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-id.put.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    const result = await handler(event);

    expect(notFoundResponse).toHaveBeenCalledWith(event, '记录不存在');
    expect(result).toBe(notFoundResponse(event, '记录不存在'));
  });

  it('should return forbidden when user has no write access', async () => {
    const { findInspectionIssueAccessRecord, hasInspectionIssueWriteAccess } =
      await import('~/modules/inspection/inspection-issue');
    const { forbiddenResponse } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'other',
      roles: [],
    } as any);
    vi.mocked(getRequiredRouterParam).mockReturnValue('rec-1' as any);
    vi.mocked(findInspectionIssueAccessRecord).mockResolvedValue({
      inspector: 'admin',
      nonConformanceNumber: 'NC-001',
      inspectionId: null,
    } as any);
    vi.mocked(hasInspectionIssueWriteAccess).mockReturnValue(false);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-id.put.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler(event);

    expect(forbiddenResponse).toHaveBeenCalledWith(
      event,
      '无权修改：您只能修改自己创建的数据',
    );
  });
});
