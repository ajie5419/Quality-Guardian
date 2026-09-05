import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/api/qms/metric-governance/definitions/index.get';

const {
  getCurrentUser,
  getMetricGovernanceActor,
  listDefinitions,
  requireSystemAdmin,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMetricGovernanceActor: vi.fn(),
  listDefinitions: vi.fn(),
  requireSystemAdmin: vi.fn(),
}));

vi.mock('h3', () => ({
  defineEventHandler: (value: unknown) => value,
}));

vi.mock('~/modules/metric-governance', () => ({
  MetricGovernanceService: { listDefinitions },
}));
vi.mock('~/modules/metric-governance/metric-governance-route', () => ({
  getMetricGovernanceActor,
}));
vi.mock('~/modules/user/system-auth', () => ({ requireSystemAdmin }));
vi.mock('~/utils/api-logger', () => ({ logApiError: vi.fn() }));
vi.mock('~/utils/current-user', () => ({ getCurrentUser }));
vi.mock('~/utils/response', () => ({
  internalServerErrorResponse: vi.fn(),
  useListResponseSuccess: (data: unknown) => ({ code: 0, data }),
}));

describe('metric governance registry metadata access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockReturnValue({ id: 'admin-1' });
    getMetricGovernanceActor.mockReturnValue({ userId: 'admin-1' });
    requireSystemAdmin.mockReturnValue(null);
  });

  it('rejects an unauthorized registry metadata read before querying definitions', async () => {
    const denied = { code: 403, message: 'forbidden' };
    requireSystemAdmin.mockReturnValue(denied);

    await expect(handler({} as never)).resolves.toBe(denied);
    expect(listDefinitions).not.toHaveBeenCalled();
  });

  it('returns registry metadata without passing a value DataScope to the service', async () => {
    listDefinitions.mockResolvedValue([
      { id: 'metric-1', metricCode: 'BM-PASS-RATE' },
    ]);

    await expect(
      handler({ context: { dataScope: { scope: 'SELF' } } } as never),
    ).resolves.toEqual({
      code: 0,
      data: [{ id: 'metric-1', metricCode: 'BM-PASS-RATE' }],
    });
    expect(listDefinitions).toHaveBeenCalledWith();
  });
});
