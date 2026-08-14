import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCloseRequestAccess } from './inspection-request-close-access.service';

const mocks = vi.hoisted(() => ({ getCodes: vi.fn() }));

vi.mock('~/modules/rbac', () => ({
  RbacService: { getUserPermissionCodes: mocks.getCodes },
}));

const inspector = {
  id: 'qc-1',
  realName: 'QC',
  roles: ['QC'],
  username: 'qc',
};

describe('ensureCloseRequestAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCodes.mockResolvedValue(['QMS:Inspection:Requests:Close']);
  });

  it('allows the assigned inspector with the close permission', async () => {
    await expect(
      ensureCloseRequestAccess({
        request: { inspectorId: 'qc-1' },
        userinfo: inspector,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a user without the close permission before task access', async () => {
    mocks.getCodes.mockResolvedValue([]);

    await expect(
      ensureCloseRequestAccess({
        request: { inspectorId: 'qc-1' },
        userinfo: inspector,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a permitted inspector assigned to a different request', async () => {
    await expect(
      ensureCloseRequestAccess({
        request: { inspectorId: 'qc-2' },
        userinfo: inspector,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
