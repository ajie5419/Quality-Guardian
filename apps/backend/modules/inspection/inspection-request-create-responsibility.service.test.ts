import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierIdentityService } from '~/modules/supplier-identity';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { resolveV2RequestResponsibility } from './inspection-request-create-responsibility.service';
import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { resolveTeamById: vi.fn() },
}));

vi.mock('./inspection-issue-responsibility.service', () => ({
  resolveInspectionIssueResponsibility: vi.fn(),
}));

vi.mock('./inspection-request-responsibility-policy.service', () => ({
  assertInspectionRequestResponsibilityPolicy: vi.fn(),
}));

describe('resolveV2RequestResponsibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: null,
      supplierName: null,
    });
  });

  it('accepts direct internal responsibility without an execution TEAM', async () => {
    const result = await resolveV2RequestResponsibility(
      {
        category: 'PROCESS',
        v2Responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-machining',
          supplierId: '',
        },
      },
      {} as any,
    );

    expect(result).toMatchObject({
      supplierId: null,
      team: '',
      teamId: null,
    });
    expect(SupplierIdentityService.resolveTeamById).not.toHaveBeenCalled();
    expect(assertInspectionRequestResponsibilityPolicy).toHaveBeenCalledWith({
      client: expect.any(Object),
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-machining',
      teamId: undefined,
    });
  });
});
