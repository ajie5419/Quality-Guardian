import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildGovernedCanonicalWritePairForTable } from './governed-write';

const { resolveCanonicalIdForWrite, resolveCanonicalNameById } = vi.hoisted(
  () => ({
    resolveCanonicalIdForWrite: vi.fn(),
    resolveCanonicalNameById: vi.fn(),
  }),
);

vi.mock('./canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalIdForWrite,
    resolveCanonicalNameById,
  },
}));

describe('buildGovernedCanonicalWritePairForTable', () => {
  beforeEach(() => {
    resolveCanonicalIdForWrite.mockReset();
    resolveCanonicalNameById.mockReset();
  });

  it('passes an explicit canonical ID and name to the kernel', async () => {
    resolveCanonicalIdForWrite.mockImplementation(
      ({ configKey }: { configKey: string }) =>
        Promise.resolve(configKey === 'division' ? 'division-1' : undefined),
    );

    await expect(
      buildGovernedCanonicalWritePairForTable('work_orders', {
        division: 'Vehicle Division',
        divisionId: 'division-1',
      }),
    ).resolves.toEqual({ divisionId: 'division-1' });

    expect(resolveCanonicalIdForWrite).toHaveBeenCalledWith({
      configKey: 'division',
      explicitCanonicalId: 'division-1',
      keepExistingWhenNameMissing: true,
      name: 'Vehicle Division',
    });
    expect(resolveCanonicalNameById).not.toHaveBeenCalled();
  });

  it('does not swallow canonical validation failures', async () => {
    resolveCanonicalIdForWrite.mockImplementation(
      ({ configKey }: { configKey: string }) =>
        configKey === 'division'
          ? Promise.reject(new Error('INVALID_CANONICAL_ID:division:dept-1'))
          : Promise.resolve(undefined),
    );

    await expect(
      buildGovernedCanonicalWritePairForTable('work_orders', {
        division: 'Vehicle Division',
        divisionId: 'dept-1',
      }),
    ).rejects.toThrow('INVALID_CANONICAL_ID:division:dept-1');
  });
});
