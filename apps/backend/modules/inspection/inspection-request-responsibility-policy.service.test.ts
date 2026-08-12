import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import { TeamIdentityService } from '~/modules/team';

import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveByIdsOrNames: vi.fn() },
}));

vi.mock('~/modules/team', () => ({
  TeamIdentityService: {
    resolveActiveDepartmentSourceIdsByTeamIds: vi.fn(),
  },
}));

describe('inspection request responsibility policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows any active canonical department for an external responsibility type', async () => {
    await expect(
      assertInspectionRequestResponsibilityPolicy({
        client: {} as any,
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-other',
      }),
    ).resolves.toBeUndefined();
    expect(DeptService.findActiveByIdsOrNames).not.toHaveBeenCalled();
  });

  it('rejects an internal TEAM whose unique department differs from the payload', async () => {
    vi.mocked(
      TeamIdentityService.resolveActiveDepartmentSourceIdsByTeamIds,
    ).mockResolvedValue(new Map([['team-1', ['dept-assembly']]]));
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-assembly', name: '装配部' },
    ]);

    await expect(
      assertInspectionRequestResponsibilityPolicy({
        client: {} as any,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-other',
        teamId: 'team-1',
      }),
    ).rejects.toMatchObject({
      code: 'INSPECTION_REQUEST_RESPONSIBILITY_POLICY_MISMATCH',
    });
  });

  it('accepts the unique canonical department of an internal TEAM', async () => {
    vi.mocked(
      TeamIdentityService.resolveActiveDepartmentSourceIdsByTeamIds,
    ).mockResolvedValue(new Map([['team-1', ['dept-assembly']]]));
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-assembly', name: '装配部' },
    ]);

    await expect(
      assertInspectionRequestResponsibilityPolicy({
        client: {} as any,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
        teamId: 'team-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts a direct internal department when no execution TEAM is provided', async () => {
    await expect(
      assertInspectionRequestResponsibilityPolicy({
        client: {} as any,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-machining',
      }),
    ).resolves.toBeUndefined();

    expect(
      TeamIdentityService.resolveActiveDepartmentSourceIdsByTeamIds,
    ).not.toHaveBeenCalled();
  });
});
