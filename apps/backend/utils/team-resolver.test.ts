import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import {
  __resetTeamResolverRuntimeForTest,
  resolveTeamIdForWrite,
} from './team-resolver';

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalIdForWrite: vi.fn(),
    resolveCanonicalIdsByNames: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ warn: vi.fn() }),
}));

describe('team resolver writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetTeamResolverRuntimeForTest();
  });

  it('returns the canonical TEAM ID after governance validation', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockResolvedValue('team-1');

    await expect(
      resolveTeamIdForWrite({
        explicitTeamId: 'team-1',
        team: 'Team A',
      }),
    ).resolves.toBe('team-1');
  });

  it('fails closed when governance validation is unavailable', async () => {
    const lookup = vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    );
    lookup.mockRejectedValueOnce(new Error('database unavailable'));
    lookup.mockResolvedValueOnce('team-1');

    await expect(
      resolveTeamIdForWrite({ explicitTeamId: 'unverified-team' }),
    ).rejects.toThrow('database unavailable');

    await expect(
      resolveTeamIdForWrite({ explicitTeamId: 'team-1' }),
    ).resolves.toBe('team-1');
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
