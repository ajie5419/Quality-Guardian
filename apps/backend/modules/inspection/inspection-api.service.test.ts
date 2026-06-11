import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';

vi.mock('~/modules/inspection/inspection-issue-mutation.service', () => ({
  InspectionIssueMutationService: {
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    batchDeleteIssues: vi.fn(),
    importIssues: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-public-query.service', () => ({
  InspectionPublicQueryService: {
    getPublicProcesses: vi.fn(),
    getPublicTeams: vi.fn(),
    getPublicWorkOrders: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-request-create.service', () => ({
  InspectionRequestCreateService: {
    createRequest: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-request-delete.service', () => ({
  InspectionRequestDeleteService: {
    deleteRequest: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-request-dispatch.service', () => ({
  InspectionRequestDispatchService: {
    dispatchRequest: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-request-query.service', () => ({
  InspectionRequestQueryService: {
    getRequestList: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

describe('inspectionApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate createIssue to InspectionIssueMutationService', async () => {
    const { InspectionIssueMutationService } = await import(
      '~/modules/inspection/inspection-issue-mutation.service'
    );
    vi.mocked(InspectionIssueMutationService.createIssue).mockResolvedValue(
      {} as any,
    );

    await InspectionApiService.createIssue({ id: 'u1' } as any, {
      partName: 'Part',
    });

    expect(InspectionIssueMutationService.createIssue).toHaveBeenCalledWith(
      { id: 'u1' },
      { partName: 'Part' },
    );
  });

  it('should delegate updateIssue to InspectionIssueMutationService', async () => {
    const { InspectionIssueMutationService } = await import(
      '~/modules/inspection/inspection-issue-mutation.service'
    );
    vi.mocked(InspectionIssueMutationService.updateIssue).mockResolvedValue(
      undefined as any,
    );

    await InspectionApiService.updateIssue(
      { id: 'u1' } as any,
      'rec-1',
      { partName: 'Updated' },
      'NC-001',
    );

    expect(InspectionIssueMutationService.updateIssue).toHaveBeenCalledWith(
      { id: 'u1' },
      'rec-1',
      { partName: 'Updated' },
      'NC-001',
    );
  });

  it('should delegate batchDeleteIssues to InspectionIssueMutationService', async () => {
    const { InspectionIssueMutationService } = await import(
      '~/modules/inspection/inspection-issue-mutation.service'
    );
    vi.mocked(
      InspectionIssueMutationService.batchDeleteIssues,
    ).mockResolvedValue(2);

    const result = await InspectionApiService.batchDeleteIssues(
      {} as any,
      { id: 'u1' } as any,
      ['r1', 'r2'],
    );

    expect(result).toBe(2);
  });

  it('should delegate importIssues to InspectionIssueMutationService', async () => {
    const { InspectionIssueMutationService } = await import(
      '~/modules/inspection/inspection-issue-mutation.service'
    );
    vi.mocked(InspectionIssueMutationService.importIssues).mockResolvedValue(
      {} as any,
    );

    await InspectionApiService.importIssues({} as any, { id: 'u1' } as any, [
      { partName: 'Part' },
    ]);

    expect(InspectionIssueMutationService.importIssues).toHaveBeenCalled();
  });

  it('should delegate getRequestList to InspectionRequestQueryService', async () => {
    const { InspectionRequestQueryService } = await import(
      '~/modules/inspection/inspection-request-query.service'
    );
    vi.mocked(InspectionRequestQueryService.getRequestList).mockResolvedValue(
      {} as any,
    );

    await InspectionApiService.getRequestList({ id: 'u1' } as any, { page: 1 });

    expect(InspectionRequestQueryService.getRequestList).toHaveBeenCalled();
  });

  it('should delegate getPublicProcesses', async () => {
    const { InspectionPublicQueryService } = await import(
      '~/modules/inspection/inspection-public-query.service'
    );
    vi.mocked(
      InspectionPublicQueryService.getPublicProcesses,
    ).mockResolvedValue([] as any);

    await InspectionApiService.getPublicProcesses('WO-1');

    expect(
      InspectionPublicQueryService.getPublicProcesses,
    ).toHaveBeenCalledWith('WO-1');
  });

  it('should delegate getPublicTeams', async () => {
    const { InspectionPublicQueryService } = await import(
      '~/modules/inspection/inspection-public-query.service'
    );
    vi.mocked(InspectionPublicQueryService.getPublicTeams).mockResolvedValue(
      [] as any,
    );

    await InspectionApiService.getPublicTeams('weld');

    expect(InspectionPublicQueryService.getPublicTeams).toHaveBeenCalledWith(
      'weld',
    );
  });

  it('should delegate getPublicWorkOrders', async () => {
    const { InspectionPublicQueryService } = await import(
      '~/modules/inspection/inspection-public-query.service'
    );
    vi.mocked(
      InspectionPublicQueryService.getPublicWorkOrders,
    ).mockResolvedValue({} as any);

    await InspectionApiService.getPublicWorkOrders({ keyword: 'WO' });

    expect(InspectionPublicQueryService.getPublicWorkOrders).toHaveBeenCalled();
  });
});
