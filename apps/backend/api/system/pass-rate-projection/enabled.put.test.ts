import { describe, expect, it, vi } from 'vitest';

import handler from './enabled.put';

type EnabledHandler = (
  event: never,
  body: { enabled: boolean },
) => Promise<unknown>;
const enabledHandler = handler as unknown as EnabledHandler;

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
vi.mock('~/utils/current-user', () => ({ getCurrentUser }));
vi.mock('~/utils/define-validated-handler', () => ({
  defineValidatedHandler: (_schema: unknown, handler: unknown) => handler,
}));
vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn(),
  useResponseSuccess: (data: unknown) => ({ data }),
}));

describe('put /system/pass-rate-projection/enabled', () => {
  it('enforces admin access before passing a valid toggle to the service', async () => {
    getCurrentUser.mockReturnValue({ id: 'admin-1' });
    const denied = { code: 403 };
    requireSystemAdmin.mockReturnValue(denied);
    const result = await enabledHandler({} as never, { enabled: true });
    expect(result).toBe(denied);
    expect(setEnabled).not.toHaveBeenCalled();

    requireSystemAdmin.mockReturnValue(null);
    setEnabled.mockResolvedValue({ enabled: true, rolloutReady: true });
    const allowed = await enabledHandler({} as never, { enabled: true });
    expect(allowed).toEqual({
      data: { enabled: true, rolloutReady: true },
    });
    expect(setEnabled).toHaveBeenCalledWith(true);
  });
});
