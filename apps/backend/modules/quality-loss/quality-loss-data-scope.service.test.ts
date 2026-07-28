import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';

vi.mock('~/modules/data-scope/data-scope.service', () => ({
  DataScopeService: {
    buildQualityLossWhere: vi.fn(),
    getScopeForModule: vi.fn(),
  },
}));

describe('quality-loss-data-scope.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return all items when no userContext', async () => {
    const { QualityLossDataScopeService } = await import(
      '~/modules/quality-loss/quality-loss-data-scope.service'
    );

    const items = [
      { amount: 1, responsibleDepartment: 'QA' },
      { amount: 2, responsibleDepartment: 'ENG' },
    ] as any[];

    const result = await QualityLossDataScopeService.apply(items);
    expect(result).toEqual(items);
  });

  it('should return all items when scope is ALL', async () => {
    const { QualityLossDataScopeService } = await import(
      '~/modules/quality-loss/quality-loss-data-scope.service'
    );

    vi.mocked(DataScopeService.getScopeForModule).mockResolvedValue({
      scopeType: 'ALL',
    } as never);

    const items = [{ amount: 1, responsibleDepartment: 'QA' }] as any[];
    const result = await QualityLossDataScopeService.apply(items, {
      userId: 'u-1',
    });

    expect(result).toEqual(items);
  });

  it('should filter items by DEPT scope', async () => {
    const { QualityLossDataScopeService } = await import(
      '~/modules/quality-loss/quality-loss-data-scope.service'
    );

    vi.mocked(DataScopeService.getScopeForModule).mockResolvedValue({
      deptIds: ['d1'],
      scopeType: 'DEPT',
    } as never);
    const items = [
      {
        amount: 1,
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'd1',
      },
      {
        amount: 2,
        responsibleDepartment: 'ENG',
        responsibleDepartmentId: 'd2',
      },
      { amount: 3, responsibleDepartment: 'QA' },
    ] as any[];

    const result = await QualityLossDataScopeService.apply(items, {
      userId: 'u-1',
    });

    expect(result).toEqual([
      {
        amount: 1,
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'd1',
      },
    ]);
  });

  it('should fallback to supplier scope for CUSTOM type', async () => {
    const { QualityLossDataScopeService } = await import(
      '~/modules/quality-loss/quality-loss-data-scope.service'
    );

    vi.mocked(DataScopeService.getScopeForModule)
      .mockResolvedValueOnce({ deptIds: ['d1'], scopeType: 'CUSTOM' } as never)
      .mockResolvedValueOnce({ deptIds: ['d2'], scopeType: 'DEPT' } as never);
    const items = [
      {
        amount: 1,
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'd1',
      },
      {
        amount: 2,
        responsibleDepartment: 'ENG',
        responsibleDepartmentId: 'd2',
      },
    ] as any[];

    const result = await QualityLossDataScopeService.apply(items, {
      userId: 'u-1',
    });

    expect(result).toEqual([
      {
        amount: 2,
        responsibleDepartment: 'ENG',
        responsibleDepartmentId: 'd2',
      },
    ]);
  });

  it('should sort filtered items via sortFilteredByScope', async () => {
    const { QualityLossDataScopeService } = await import(
      '~/modules/quality-loss/quality-loss-data-scope.service'
    );

    vi.mocked(DataScopeService.getScopeForModule).mockResolvedValue({
      deptIds: ['d1'],
      scopeType: 'DEPT',
    } as never);
    const items = [
      {
        amount: 2,
        responsibleDepartment: 'ENG',
        responsibleDepartmentId: 'd1',
      },
      {
        amount: 1,
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'd1',
      },
    ] as any[];

    const result = await QualityLossDataScopeService.sortFilteredByScope(
      items,
      (input) => [...input].sort((a, b) => a.amount - b.amount),
      { userId: 'u-1' },
    );

    expect(result).toEqual([
      {
        amount: 1,
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'd1',
      },
      {
        amount: 2,
        responsibleDepartment: 'ENG',
        responsibleDepartmentId: 'd1',
      },
    ]);
  });

  it('applyManualWhere delegates to DataScopeService.buildQualityLossWhere', async () => {
    const { QualityLossDataScopeService } = await import(
      '~/modules/quality-loss/quality-loss-data-scope.service'
    );

    vi.mocked(DataScopeService.buildQualityLossWhere).mockResolvedValue({
      AND: [{ isDeleted: false }, { createdBy: 'u-1' }],
    } as never);

    const where = await QualityLossDataScopeService.applyManualWhere({
      baseWhere: { isDeleted: false },
      dataScope: { scopeType: 'SELF', deptIds: [] },
      userContext: { userId: 'u-1', username: 'tester' },
    });

    expect(DataScopeService.buildQualityLossWhere).toHaveBeenCalledWith(
      { isDeleted: false },
      { userId: 'u-1', username: 'tester' },
      { scopeType: 'SELF', deptIds: [] },
    );
    expect(where).toEqual({
      AND: [{ isDeleted: false }, { createdBy: 'u-1' }],
    });
  });
});
