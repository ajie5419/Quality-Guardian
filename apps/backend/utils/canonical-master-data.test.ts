import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __masterDataGovernanceTestHooks,
  MasterDataGovernanceKernel,
} from './canonical-master-data';

const {
  executeRawUnsafe,
  queryRawUnsafe,
  transaction,
  unresolvedFindMany,
  unresolvedUpdateMany,
  unresolvedUpsert,
} = vi.hoisted(() => {
  const queryRawUnsafe = vi.fn();
  return {
    executeRawUnsafe: vi.fn(),
    queryRawUnsafe,
    transaction: vi.fn(
      async (
        callback: (tx: { $queryRawUnsafe: typeof queryRawUnsafe }) => unknown,
      ) => callback({ $queryRawUnsafe: queryRawUnsafe }),
    ),
    unresolvedFindMany: vi.fn(),
    unresolvedUpdateMany: vi.fn(),
    unresolvedUpsert: vi.fn(),
  };
});

vi.mock('~/utils/prisma', () => ({
  default: {
    $executeRawUnsafe: executeRawUnsafe,
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: transaction,
    unresolved_master_data_refs: {
      findMany: unresolvedFindMany,
      updateMany: unresolvedUpdateMany,
      upsert: unresolvedUpsert,
    },
  },
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'process-cuid',
}));

describe('masterDataGovernanceKernel', () => {
  beforeEach(() => {
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    transaction.mockClear();
    unresolvedFindMany.mockReset();
    unresolvedUpdateMany.mockReset();
    unresolvedUpsert.mockReset();
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

  it('requires process identities to be enabled', async () => {
    queryRawUnsafe.mockResolvedValue([{ value: 'Welding' }]);

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
        configKey: 'processName',
        explicitCanonicalId: 'process-1',
        name: 'Welding',
      }),
    ).resolves.toBe('process-1');

    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain('isDeleted = 0');
    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain('status = 1');
  });

  it('creates bootstrapped process identities with cuid IDs', async () => {
    executeRawUnsafe.mockResolvedValue(1);

    await expect(
      __masterDataGovernanceTestHooks.seedCanonicalByNames(
        {
          activeWhere: 'isDeleted = 0 AND status = 1',
          idColumn: 'id',
          nameColumn: 'name',
          table: 'processes',
        },
        ['Welding'],
      ),
    ).resolves.toBe(1);
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO processes'),
      'process-cuid',
      'Welding',
      0,
    );
  });

  it('never recreates historical names after canonical initialization', async () => {
    queryRawUnsafe.mockResolvedValue([{ count: 1 }]);

    await expect(
      MasterDataGovernanceKernel.bootstrapCanonicalFromTargetNames(
        'processName',
      ),
    ).resolves.toEqual({
      candidateCanonicalRows: 0,
      canonicalRowsBeforeBootstrap: 1,
      seededCanonicalRows: 0,
      status: 'already-initialized',
    });
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('never recreates legacy dictionary names after process initialization', async () => {
    queryRawUnsafe.mockResolvedValue([{ count: 1 }]);

    await expect(
      MasterDataGovernanceKernel.seedCanonicalFromSource('processName'),
    ).resolves.toEqual({ seededCanonicalRows: 0 });
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('bootstraps only names from rows without canonical IDs', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([
        { columnName: 'isDeleted' },
        { columnName: 'processId' },
        { columnName: 'processName' },
      ])
      .mockResolvedValueOnce([{ value: 'Welding' }]);

    await expect(
      __masterDataGovernanceTestHooks.readDistinctMissingCanonicalIdTargetNames(
        {
          idColumn: 'processId',
          nameColumn: 'processName',
          nullable: true,
          table: 'work_order_requirements',
        },
      ),
    ).resolves.toEqual(['Welding']);
    expect(queryRawUnsafe.mock.calls[1]?.[0]).toContain('`processId` IS NULL');
  });

  it('persists every unresolved canonical target in a mixed batch', async () => {
    __masterDataGovernanceTestHooks.resetCaches();
    queryRawUnsafe
      .mockResolvedValueOnce([{ columnName: 'id' }])
      .mockResolvedValueOnce([
        { columnName: 'id' },
        { columnName: 'isDeleted' },
      ])
      .mockResolvedValueOnce([
        { rowKey: 'requirement-1', value: 'Unknown process' },
        { rowKey: 'requirement-2', value: 'Welding' },
      ])
      .mockResolvedValueOnce([
        { canonicalId: 'process-1', rowKey: 'requirement-2' },
      ]);
    executeRawUnsafe.mockResolvedValue(1);
    unresolvedFindMany.mockResolvedValue([{ entityId: 'requirement-2' }]);
    unresolvedUpdateMany.mockResolvedValue({ count: 1 });
    unresolvedUpsert.mockResolvedValue({ id: 'audit-1' });

    await expect(
      __masterDataGovernanceTestHooks.backfillTargetCanonicalIds(
        {
          idColumn: 'processId',
          nameColumn: 'processName',
          nullable: true,
          table: 'work_order_requirements',
        },
        new Map([['Welding', 'process-1']]),
        { batchSize: 100, configKey: 'processName' },
      ),
    ).resolves.toMatchObject({
      exhausted: true,
      scannedRows: 2,
      unresolvedRows: 1,
      updatedRows: 1,
    });

    expect(unresolvedUpsert).toHaveBeenCalledWith({
      where: {
        entityType_entityId_fieldName: {
          entityId: 'requirement-1',
          entityType: 'work_order_requirements',
          fieldName: 'processId',
        },
      },
      create: expect.objectContaining({
        entityId: 'requirement-1',
        entityType: 'work_order_requirements',
        fieldName: 'processId',
        rawId: null,
        rawName: 'Unknown process',
        reason: 'NO_EXACT_CANONICAL_MATCH',
      }),
      update: expect.objectContaining({
        isDeleted: false,
        rawName: 'Unknown process',
        status: 'OPEN',
      }),
    });
    expect(queryRawUnsafe.mock.calls[2]?.[0]).toContain('`isDeleted` = 0');
    expect(executeRawUnsafe.mock.calls[0]?.[0]).toContain(
      '`processId` IS NULL',
    );
    expect(unresolvedUpdateMany).toHaveBeenCalledWith({
      where: {
        entityId: 'requirement-2',
        entityType: 'work_order_requirements',
        fieldName: 'processId',
        isDeleted: false,
        status: 'OPEN',
      },
      data: {
        resolutionNote: 'Resolved by deterministic canonical ID backfill',
        resolvedAt: expect.any(Date),
        resolvedId: 'process-1',
        status: 'RESOLVED',
      },
    });
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
