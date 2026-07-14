import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './audit.get';

const { auditGovernance, getCurrentUser, requireSystemAdmin } = vi.hoisted(
  () => ({
    auditGovernance: vi.fn(),
    getCurrentUser: vi.fn(),
    requireSystemAdmin: vi.fn(),
  }),
);

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
}));

vi.mock('~/modules/user/system-auth', () => ({ requireSystemAdmin }));
vi.mock('~/utils/current-user', () => ({ getCurrentUser }));
vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: { auditGovernance },
}));

describe('get /qms/admin/master-data/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'admin-1' });
    requireSystemAdmin.mockReturnValue(null);
  });

  it('returns the real governance audit report', async () => {
    const report = {
      invalid: [{ configKey: 'division', invalidCanonicalId: 1 }],
      missing: [{ configKey: 'division', missingCanonicalId: 2 }],
      orphans: [{ configKey: 'division', count: 3 }],
      summary: { status: 'warn' },
    };
    auditGovernance.mockResolvedValue(report);

    await expect(handler({} as never)).resolves.toEqual({
      code: 0,
      data: report,
      error: null,
      message: 'ok',
    });
    expect(auditGovernance).toHaveBeenCalledTimes(1);
  });
});
