import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MasterDataGovernanceKernel } from './canonical-master-data';

const { queryRawUnsafe, transaction } = vi.hoisted(() => {
  const queryRawUnsafe = vi.fn();
  return {
    queryRawUnsafe,
    transaction: vi.fn(
      async (
        callback: (tx: { $queryRawUnsafe: typeof queryRawUnsafe }) => unknown,
      ) => callback({ $queryRawUnsafe: queryRawUnsafe }),
    ),
  };
});

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: transaction,
  },
}));

describe('masterDataGovernanceKernel', () => {
  beforeEach(() => {
    queryRawUnsafe.mockReset();
    transaction.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts an active canonical ID with a matching name', async () => {
    queryRawUnsafe.mockResolvedValue([{ value: 'Vehicle OBU' }]);

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: 'division',
        explicitCanonicalId: 'dept-1',
        name: 'Vehicle OBU',
      }),
    ).resolves.toBe('dept-1');

    expect(queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM `departments`'),
      'dept-1',
    );
    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain('isDeleted = 0');
    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain('status = 1');
  });

  it('rejects a canonical ID outside the configured active identity domain', async () => {
    queryRawUnsafe.mockResolvedValue([]);

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: 'division',
        explicitCanonicalId: 'division-1',
        name: 'Vehicle OBU',
      }),
    ).rejects.toThrow('INVALID_CANONICAL_ID:division:division-1');
  });

  it('rejects a canonical ID and name mismatch', async () => {
    queryRawUnsafe.mockResolvedValue([{ value: 'Vehicle OBU' }]);

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: 'division',
        explicitCanonicalId: 'dept-1',
        name: 'Production Division',
      }),
    ).rejects.toThrow('CANONICAL_NAME_MISMATCH:division:dept-1');
  });

  it('keeps explicit null compatible without querying the canonical table', async () => {
    await expect(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: 'division',
        explicitCanonicalId: null,
      }),
    ).resolves.toBeNull();
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('includes the department source when previewing a division rename', async () => {
    queryRawUnsafe.mockResolvedValue([{ count: 2 }]);

    await expect(
      MasterDataGovernanceKernel.rename({
        configKey: 'division',
        dryRun: true,
        newValue: 'New Division',
        oldValue: 'Old Division',
      }),
    ).resolves.toContainEqual({
      affectedRows: 2,
      field: 'name',
      model: 'departments',
    });
  });

  it('aggregates only actionable audit findings', async () => {
    vi.spyOn(MasterDataGovernanceKernel, 'auditOrphans').mockResolvedValue([
      {
        configKey: 'division',
        count: 2,
        tables: ['work_orders'],
        value: 'Legacy Division',
      },
    ]);
    vi.spyOn(
      MasterDataGovernanceKernel,
      'auditMissingCanonicalIds',
    ).mockResolvedValue([
      { missingCanonicalId: 3, table: 'work_orders', totalWithName: 10 },
      { missingCanonicalId: 0, table: 'quality_records', totalWithName: 4 },
    ]);
    vi.spyOn(
      MasterDataGovernanceKernel,
      'auditInvalidCanonicalIds',
    ).mockResolvedValue([
      {
        invalidCanonicalId: 1,
        mismatchedCanonicalName: 2,
        table: 'work_orders',
      },
      {
        invalidCanonicalId: 0,
        mismatchedCanonicalName: 0,
        table: 'quality_records',
      },
    ]);

    await expect(
      MasterDataGovernanceKernel.auditGovernance({
        configKeys: ['division'],
      }),
    ).resolves.toEqual({
      invalid: [
        {
          configKey: 'division',
          invalidCanonicalId: 1,
          mismatchedCanonicalName: 2,
          table: 'work_orders',
        },
      ],
      missing: [
        {
          configKey: 'division',
          missingCanonicalId: 3,
          table: 'work_orders',
          totalWithName: 10,
        },
      ],
      orphans: [
        {
          configKey: 'division',
          count: 2,
          tables: ['work_orders'],
          value: 'Legacy Division',
        },
      ],
      summary: {
        fieldCount: 1,
        invalidCanonicalId: 1,
        mismatchedCanonicalName: 2,
        missingCanonicalId: 3,
        orphanCount: 2,
        status: 'warn',
      },
    });
  });
});
