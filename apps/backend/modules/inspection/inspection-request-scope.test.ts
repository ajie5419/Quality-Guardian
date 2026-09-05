import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataScopeService } from '~/modules/data-scope';

import { buildScopedInspectionRequestWhere } from './inspection-request-scope';

vi.mock('~/modules/data-scope', () => ({
  DataScopeService: { getDeptCandidates: vi.fn() },
  requireAnalyticsUser: (access?: AnalyticsAccessContext) => {
    const userId = access?.user?.userId;
    if (!userId) throw new Error('Analytics access context is missing a user');
    return { userId, username: access?.user?.username };
  },
}));

const baseWhere = { isDeleted: false, status: 'SUBMITTED' as const };

function accessFor(
  dataScope: AnalyticsAccessContext['dataScope'],
): AnalyticsAccessContext {
  return { dataScope, user: { userId: 'user-1', username: 'inspector' } };
}

describe('buildScopedInspectionRequestWhere', () => {
  beforeEach(() => {
    vi.mocked(DataScopeService.getDeptCandidates).mockReset();
  });

  it('limits DEPT analytics to resolved department candidates', async () => {
    vi.mocked(DataScopeService.getDeptCandidates).mockResolvedValue([
      'dept-quality',
      'Quality Department',
    ]);

    await expect(
      buildScopedInspectionRequestWhere(
        baseWhere,
        accessFor({
          deptIds: ['dept-quality'],
          module: 'inspection',
          scopeType: 'DEPT',
        }),
      ),
    ).resolves.toEqual({
      AND: [
        baseWhere,
        {
          responsibleDepartment: {
            in: ['dept-quality', 'Quality Department'],
          },
        },
      ],
    });
  });

  it('limits SELF analytics to requests reported by or assigned to the user', async () => {
    await expect(
      buildScopedInspectionRequestWhere(
        baseWhere,
        accessFor({ deptIds: [], module: 'inspection', scopeType: 'SELF' }),
      ),
    ).resolves.toEqual({
      AND: [
        baseWhere,
        {
          OR: [{ inspectorId: 'user-1' }, { reporterId: 'user-1' }],
        },
      ],
    });
    expect(DataScopeService.getDeptCandidates).not.toHaveBeenCalled();
  });

  it('fails closed when analytics access has no resolved DataScope', async () => {
    await expect(
      buildScopedInspectionRequestWhere(baseWhere, accessFor(undefined)),
    ).resolves.toEqual({ AND: [baseWhere, { id: '__none__' }] });
    expect(DataScopeService.getDeptCandidates).not.toHaveBeenCalled();
  });
});
