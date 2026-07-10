import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/inspection/inspection-issue-access.service', () => ({
  InspectionIssueAccessService: {
    ensurePermission: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-issue-list.service', () => ({
  InspectionIssueListService: {
    getIssueById: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('~/utils/route-param', () => ({
  getRequiredRouterParam: vi.fn(),
}));

describe('inspection-issue-id.get.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks view permission and passes the request data scope to the query', async () => {
    const { InspectionIssueAccessService } = await import(
      '~/modules/inspection/inspection-issue-access.service'
    );
    const { InspectionIssueListService } = await import(
      '~/modules/inspection/inspection-issue-list.service'
    );
    const { getCurrentUser } = await import('~/utils/current-user');
    const { getRequiredRouterParam } = await import('~/utils/route-param');
    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'user-1',
      username: 'inspector',
    } as never);
    vi.mocked(getRequiredRouterParam).mockReturnValue('issue-1' as never);
    vi.mocked(InspectionIssueListService.getIssueById).mockResolvedValue({
      id: 'issue-1',
    } as never);

    const { default: handler } = await import(
      '~/modules/inspection/inspection-issue-id.get.service'
    );
    const event = {
      context: {
        dataScope: {
          deptIds: ['dept-1'],
          module: 'inspection',
          scopeType: 'DEPT',
        },
      },
      node: { req: {} },
    } as never;

    const result = await handler(event);

    expect(InspectionIssueAccessService.ensurePermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'QMS:Inspection:Issues:View',
    );
    expect(InspectionIssueListService.getIssueById).toHaveBeenCalledWith({
      dataScope: expect.objectContaining({ scopeType: 'DEPT' }),
      id: 'issue-1',
      userContext: { userId: 'user-1', username: 'inspector' },
    });
    expect(result).toMatchObject({ code: 0, data: { id: 'issue-1' } });
  });
});
