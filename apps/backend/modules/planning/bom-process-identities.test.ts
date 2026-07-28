import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { resolveBomRequiredProcessIdentities } from './bom-process-identities';

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalIdsByNames: vi.fn(),
    resolveCanonicalNamesByIds: vi.fn(),
  },
}));

describe('bOM process identities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires canonical IDs for online writes', async () => {
    await expect(
      resolveBomRequiredProcessIdentities(
        { requiredProcesses: ['Welding'] },
        'online',
      ),
    ).rejects.toMatchObject({ code: 'CANONICAL_ID_REQUIRED' });
  });

  it('hydrates canonical names from online IDs', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['process-1', 'Current Welding']]));

    await expect(
      resolveBomRequiredProcessIdentities(
        { requiredProcessIds: ['process-1'] },
        'online',
      ),
    ).resolves.toEqual([
      { processId: 'process-1', processName: 'Current Welding' },
    ]);
  });

  it('rejects invalid non-empty process IDs', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['invalid-process', null]]));

    await expect(
      resolveBomRequiredProcessIdentities(
        { requiredProcessIds: ['invalid-process'] },
        'online',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CANONICAL_ID' });
  });

  it('allows only exact canonical resolution for legacy imports', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).mockResolvedValue(new Map([['Welding', 'process-1']]));

    await expect(
      resolveBomRequiredProcessIdentities(
        { requiredProcesses: ['Welding'] },
        'legacy-import',
      ),
    ).resolves.toEqual([{ processId: 'process-1', processName: 'Welding' }]);
  });
});
