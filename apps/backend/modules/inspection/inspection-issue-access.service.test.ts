import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyInspectionIssueWriteOwnership,
  InspectionIssueAccessService,
} from '~/modules/inspection/inspection-issue-access.service';
import { RbacService } from '~/modules/rbac/rbac.service';

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    getUserRoles: vi.fn(),
    getUserPermissionCodes: vi.fn(),
  },
}));

describe('inspectionIssueAccessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps write ownership filters for regular users', () => {
    expect(
      applyInspectionIssueWriteOwnership(
        { id: 'issue-1', isDeleted: false },
        { roles: ['quality_inspector'], userId: 'user-1' },
      ),
    ).toEqual({
      createdBy: 'user-1',
      id: 'issue-1',
      isDeleted: false,
    });
  });

  it('removes write ownership filters for administrators', () => {
    expect(
      applyInspectionIssueWriteOwnership(
        { id: 'issue-1', isDeleted: false },
        { roles: ['super_admin'], userId: 'admin-1' },
      ),
    ).toEqual({ id: 'issue-1', isDeleted: false });
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

  it('builds access context from current RBAC roles instead of token roles', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Issues:Edit',
    ]);
    vi.mocked(RbacService.getUserRoles).mockResolvedValue([
      { id: 'role-admin', name: 'admin' },
    ] as never);

    const context = await InspectionIssueAccessService.getAccessContext(
      {
        id: 'user-1',
        roles: ['quality_inspector'],
      } as never,
      'QMS:Inspection:Issues:Edit',
    );

    expect(context).toEqual({ roles: ['admin'], userId: 'user-1' });
    expect(RbacService.getUserRoles).toHaveBeenCalledWith('user-1');
  });
});
