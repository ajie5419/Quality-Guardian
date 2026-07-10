import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueAccessService } from '~/modules/inspection/inspection-issue-access.service';
import { RbacService } from '~/modules/rbac/rbac.service';

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    getUserPermissionCodes: vi.fn(),
  },
}));

describe('inspectionIssueAccessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a user with the required permission', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Issues:View',
    ]);

    await expect(
      InspectionIssueAccessService.ensurePermission(
        { id: 'user-1' } as never,
        'QMS:Inspection:Issues:View',
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects a user without the required permission', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([]);

    await expect(
      InspectionIssueAccessService.ensurePermission(
        { id: 'user-1' } as never,
        'QMS:Inspection:Issues:Edit',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
  });
});
