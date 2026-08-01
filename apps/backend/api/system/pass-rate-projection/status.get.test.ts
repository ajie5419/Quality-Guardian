import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './status.get';

const { getCurrentUser, getStatus, requireSystemAdmin } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getStatus: vi.fn(),
  requireSystemAdmin: vi.fn(),
}));

vi.mock('h3', () => ({ defineEventHandler: (handler: unknown) => handler }));
vi.mock('~/modules/report', () => ({
  PassRateProjectionRolloutService: { getStatus },
}));
vi.mock('~/modules/user/system-auth', () => ({ requireSystemAdmin }));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/current-user', () => ({ getCurrentUser }));
vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: (data: unknown) => ({ data }),
}));

describe('get /system/pass-rate-projection/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'admin-1' });
    requireSystemAdmin.mockReturnValue(null);
  });

  it('rejects a non-administrator before reading rollout status', async () => {
    const denied = { code: 403 };
    requireSystemAdmin.mockReturnValue(denied);
    await expect(handler({} as never)).resolves.toBe(denied);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('returns rollout status for an administrator', async () => {
    getStatus.mockResolvedValue({ enabled: false, rolloutReady: true });
    await expect(handler({} as never)).resolves.toEqual({
      data: { enabled: false, rolloutReady: true },
    });
  });
});
