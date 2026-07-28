import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { resolveBomImportProcessIdentities } from './bom-import-governance';
import {
  hasBomRequiredProcessIdentityUpdate,
  resolveBomRequiredProcessIdentities,
} from './bom-process-identities';

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
      resolveBomRequiredProcessIdentities({ requiredProcesses: ['Welding'] }),
    ).rejects.toMatchObject({ code: 'CANONICAL_ID_REQUIRED' });
  });

  it('distinguishes an omitted identity update from an explicit clear', () => {
    expect(hasBomRequiredProcessIdentityUpdate({ quantity: 2 })).toBe(false);
    expect(
      hasBomRequiredProcessIdentityUpdate({ requiredProcessIds: [] }),
    ).toBe(true);
  });

  it('hydrates canonical names from online IDs', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['process-1', 'Current Welding']]));

    await expect(
      resolveBomRequiredProcessIdentities({
        requiredProcessIds: ['process-1'],
      }),
    ).resolves.toEqual([
      { processId: 'process-1', processName: 'Current Welding' },
    ]);
  });

  it('rejects invalid non-empty process IDs', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['invalid-process', null]]));

    await expect(
      resolveBomRequiredProcessIdentities({
        requiredProcessIds: ['invalid-process'],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CANONICAL_ID' });
  });

  it('allows only exact canonical resolution for legacy imports', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).mockResolvedValue(new Map([['Welding', 'process-1']]));
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['process-1', 'Welding']]));

    await expect(
      resolveBomImportProcessIdentities({
        requiredProcessIds: [],
        requiredProcesses: ['Welding'],
      }),
    ).resolves.toEqual([{ processId: 'process-1', processName: 'Welding' }]);
  });
});
