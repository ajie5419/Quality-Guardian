import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/inspection/inspection-issue', () => ({
  findInspectionIssueAccessRecord: vi.fn(),
  hasInspectionIssueWriteAccess: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    deleteRecord: vi.fn(),
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

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  forbiddenResponse: vi.fn(),
  internalServerErrorResponse: vi.fn(),
  notFoundResponse: vi.fn(),
  useResponseSuccess: vi.fn(),
}));

vi.mock('~/utils/business-error', () => ({
  businessErrorResponse: vi.fn(),
  legacyErrorToBusinessError: vi.fn().mockReturnValue(null),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

describe('inspection-issue-id.delete.service', () => {
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
      '~/modules/inspection/inspection-issue-id.delete.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler(event);

    expect(notFoundResponse).toHaveBeenCalledWith(event, '记录不存在');
  });

  it('should return forbidden when user has no write access', async () => {
    const { findInspectionIssueAccessRecord, hasInspectionIssueWriteAccess } =
      await import('~/modules/inspection/inspection-issue');
    const { forbiddenResponse } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
      roles: ['admin'],
    } as any);
    vi.mocked(getRequiredRouterParam).mockReturnValue('rec-1' as any);
    vi.mocked(findInspectionIssueAccessRecord).mockResolvedValue({
      createdBy: 'other-user',
      nonConformanceNumber: 'NC-001',
      inspectionId: null,
    } as any);
    vi.mocked(hasInspectionIssueWriteAccess).mockReturnValue(false);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-id.delete.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler(event);

    expect(hasInspectionIssueWriteAccess).toHaveBeenCalledWith({
      createdBy: 'other-user',
      userId: 'u1',
    });
    expect(forbiddenResponse).toHaveBeenCalledWith(
      event,
      '无权删除：您只能删除自己创建的数据',
    );
  });

  it('should call InspectionService.deleteRecord on success', async () => {
    const { findInspectionIssueAccessRecord, hasInspectionIssueWriteAccess } =
      await import('~/modules/inspection/inspection-issue');
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    const { InspectionIssueAccessService } = await import(
      '~/modules/inspection/inspection-issue-access.service'
    );
    const { useResponseSuccess } = await import('~/utils/response');
    const { getCurrentUser } = await import('~/utils/current-user');
    const { getRequiredRouterParam } = await import('~/utils/route-param');

    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'u1',
      username: 'admin',
      roles: [],
    } as any);
    vi.mocked(getRequiredRouterParam).mockReturnValue('rec-1' as any);
    vi.mocked(findInspectionIssueAccessRecord).mockResolvedValue({
      createdBy: 'u1',
      nonConformanceNumber: 'NC-001',
      inspectionId: null,
    } as any);
    vi.mocked(hasInspectionIssueWriteAccess).mockReturnValue(true);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-id.delete.service'
    );
    const handler = handlerModule.default;
    const event = {
      context: {},
      node: { req: {} },
    } as any;

    await handler(event);

    expect(InspectionService.deleteRecord).toHaveBeenCalledWith('rec-1', 'u1');
    expect(InspectionIssueAccessService.ensurePermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      'QMS:Inspection:Issues:Delete',
    );
    expect(useResponseSuccess).toHaveBeenCalledWith(null);
  });

  it('returns a business error when the record is deleted concurrently', async () => {
    const { findInspectionIssueAccessRecord, hasInspectionIssueWriteAccess } =
      await import('~/modules/inspection/inspection-issue');
    const { InspectionService } = await import(
      '~/modules/inspection/inspection.service'
    );
    const { businessErrorResponse, legacyErrorToBusinessError } = await import(
      '~/utils/business-error'
    );
    const { getCurrentUser } = await import('~/utils/current-user');
    const { getRequiredRouterParam } = await import('~/utils/route-param');
    const notFoundError = { code: 'NOT_FOUND', httpStatus: 404 };

    vi.mocked(getCurrentUser).mockReturnValue({ id: 'u1' } as any);
    vi.mocked(getRequiredRouterParam).mockReturnValue('rec-1' as any);
    vi.mocked(findInspectionIssueAccessRecord).mockResolvedValue({
      createdBy: 'u1',
    } as any);
    vi.mocked(hasInspectionIssueWriteAccess).mockReturnValue(true);
    vi.mocked(InspectionService.deleteRecord).mockRejectedValue(notFoundError);
    vi.mocked(legacyErrorToBusinessError).mockReturnValue(notFoundError as any);

    const handlerModule = await import(
      '~/modules/inspection/inspection-issue-id.delete.service'
    );
    const event = { context: {}, node: { req: {} } } as any;

    await handlerModule.default(event);

    expect(businessErrorResponse).toHaveBeenCalledWith(event, notFoundError);
  });
});
