import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './enabled.put';

const enabledHandler = handler as unknown as (
  event: never,
  body: { enabled: boolean },
) => Promise<unknown>;

const { getCurrentUser, requireSystemAdmin, setEnabled } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireSystemAdmin: vi.fn(),
  setEnabled: vi.fn(),
}));

vi.mock('~/modules/report', () => ({
  passRateProjectionToggleSchema: {},
  PassRateProjectionRolloutService: { setEnabled },
}));
vi.mock('~/modules/user/system-auth', () => ({ requireSystemAdmin }));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/business-error', () => ({
  businessErrorResponse: vi.fn(),
  isBusinessError: vi.fn(() => false),
}));
vi.mock('~/utils/current-user', () => ({ getCurrentUser }));
vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: (_schema: unknown, handler: unknown) => handler,
}));
vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: (data: unknown) => ({ data }),
}));

describe('put /system/pass-rate-projection/enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'admin-1' });
    requireSystemAdmin.mockReturnValue(null);
  });

  it('rejects a non-administrator before changing the rollout flag', async () => {
    const denied = { code: 403 };
    requireSystemAdmin.mockReturnValue(denied);
    await expect(enabledHandler({} as never, { enabled: true })).resolves.toBe(
      denied,
    );
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it('passes the validated toggle to the strict rollout service', async () => {
    setEnabled.mockResolvedValue({ enabled: true, rolloutReady: true });
    await expect(
      enabledHandler({} as never, { enabled: true }),
    ).resolves.toEqual({
      data: { enabled: true, rolloutReady: true },
    });
    expect(setEnabled).toHaveBeenCalledWith(true);
  });
});
