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
        Promise.resolve(configKey === 'division' ? 'dept-1' : undefined),
    );

    await expect(
      buildGovernedCanonicalWritePairForTable('work_orders', {
        division: 'Vehicle OBU',
        divisionId: 'dept-1',
      }),
    ).resolves.toEqual({ divisionId: 'dept-1' });

    expect(resolveCanonicalIdForWrite).toHaveBeenCalledWith({
      configKey: 'division',
      explicitCanonicalId: 'dept-1',
      keepExistingWhenNameMissing: true,
      name: 'Vehicle OBU',
    });
    expect(resolveCanonicalNameById).toHaveBeenCalledWith({
      canonicalId: 'dept-1',
      configKey: 'division',
      fallbackName: null,
    });
  });

  it('rebuilds a legacy division ID submitted in the name field', async () => {
    resolveCanonicalNameById.mockImplementation(
      ({ configKey }: { configKey: string }) =>
        Promise.resolve(configKey === 'division' ? 'Vehicle OBU' : null),
    );
    resolveCanonicalIdForWrite.mockImplementation(
      ({ configKey }: { configKey: string }) =>
        Promise.resolve(configKey === 'division' ? 'dept-1' : undefined),
    );

    await expect(
      buildGovernedCanonicalWritePairForTable('work_orders', {
        division: 'dept-1',
      }),
    ).resolves.toEqual({
      division: 'Vehicle OBU',
      divisionId: 'dept-1',
    });

    expect(resolveCanonicalIdForWrite).toHaveBeenCalledWith({
      configKey: 'division',
      explicitCanonicalId: 'dept-1',
      keepExistingWhenNameMissing: true,
      name: 'Vehicle OBU',
    });
  });

  it('does not swallow canonical validation failures', async () => {
    resolveCanonicalIdForWrite.mockImplementation(
      ({ configKey }: { configKey: string }) =>
        configKey === 'division'
          ? Promise.reject(
              new Error('INVALID_CANONICAL_ID:division:division-1'),
            )
          : Promise.resolve(undefined),
    );

    await expect(
      buildGovernedCanonicalWritePairForTable('work_orders', {
        division: 'Vehicle OBU',
        divisionId: 'division-1',
      }),
    ).rejects.toThrow('INVALID_CANONICAL_ID:division:division-1');
  });

  it('rejects online supplier names without a canonical ID', async () => {
    await expect(
      buildGovernedCanonicalWritePairForTable('supervision_projects', {
        supplierName: 'Supplier A',
      }),
    ).rejects.toMatchObject({ code: 'CANONICAL_ID_REQUIRED' });

    expect(resolveCanonicalIdForWrite).not.toHaveBeenCalled();
  });

  it('rebuilds the canonical name for an ID-only supplier write', async () => {
    resolveCanonicalIdForWrite.mockResolvedValue('supplier-1');
    resolveCanonicalNameById.mockResolvedValue('Supplier A');

    await expect(
      buildGovernedCanonicalWritePairForTable('supervision_projects', {
        supplierId: 'supplier-1',
      }),
    ).resolves.toMatchObject({
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });

  it('allows explicit legacy imports only when the name resolves uniquely', async () => {
    resolveCanonicalIdForWrite.mockImplementation(
      ({ configKey, name }: { configKey: string; name?: string }) =>
        Promise.resolve(
          configKey === 'supplierBrand' && name ? 'supplier-1' : undefined,
        ),
    );
    resolveCanonicalNameById.mockImplementation(
      ({ canonicalId }: { canonicalId?: string }) =>
        Promise.resolve(canonicalId === 'supplier-1' ? 'Supplier A' : null),
    );

    await expect(
      buildGovernedCanonicalWritePairForTable(
        'after_sales',
        { supplierBrand: 'Supplier A' },
        { mode: 'legacy-import' },
      ),
    ).resolves.toMatchObject({
      supplierBrand: 'Supplier A',
      supplierBrandId: 'supplier-1',
    });

    resolveCanonicalIdForWrite.mockImplementation(() => Promise.resolve(null));
    resolveCanonicalNameById.mockResolvedValue(null);
    await expect(
      buildGovernedCanonicalWritePairForTable(
        'after_sales',
        { supplierBrand: 'Unknown Supplier' },
        { mode: 'legacy-import' },
      ),
    ).rejects.toMatchObject({ code: 'UNRESOLVED_CANONICAL_REFERENCE' });
  });
});
