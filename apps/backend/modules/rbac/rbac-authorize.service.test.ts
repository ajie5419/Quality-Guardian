import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeWrite } from '~/modules/rbac/rbac-authorize.service';
import { RbacRoleService } from '~/modules/rbac/rbac-role.service';
import { BusinessError } from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';

vi.mock('~/modules/rbac/rbac-role.service', () => ({
  RbacRoleService: {
    getUserPermissionCodes: vi.fn(),
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

describe('authorizeWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 401 when the request has no session user', async () => {
    vi.mocked(getCurrentUser).mockReturnValue(null);

    await expect(
      authorizeWrite({} as never, 'QMS:Test:Write'),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', httpStatus: 401 });
  });

  it('throws 403 when the user lacks the permission code', async () => {
    vi.mocked(getCurrentUser).mockReturnValue({
      id: 'user-1',
      username: 'u',
      realName: 'U',
      roles: ['user'],
    } as never);
    vi.mocked(RbacRoleService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Other:Write',
    ]);

    const error = await authorizeWrite({} as never, 'QMS:Test:Write').catch(
      (error_: unknown) => error_,
    );

    expect(error).toBeInstanceOf(BusinessError);
    expect(error).toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
  });

  it('returns the session user when the permission code is granted', async () => {
    const user = {
      id: 'user-1',
      username: 'u',
      realName: 'U',
      roles: ['inspector'],
    };
    vi.mocked(getCurrentUser).mockReturnValue(user as never);
    vi.mocked(RbacRoleService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Test:Write',
    ]);

    const result = await authorizeWrite({} as never, 'QMS:Test:Write');

    expect(result).toEqual(user);
  });

  it('resolves the userId from the userId field when id is absent', async () => {
    vi.mocked(getCurrentUser).mockReturnValue({
      userId: 'user-9',
      username: 'u',
      realName: 'U',
      roles: ['user'],
    } as never);

    await authorizeWrite({} as never, 'QMS:Test:Write').catch(() => undefined);

    expect(RbacRoleService.getUserPermissionCodes).toHaveBeenCalledWith(
      'user-9',
    );
  });
});
