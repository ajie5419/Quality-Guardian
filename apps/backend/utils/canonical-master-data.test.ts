import { Decimal } from '@prisma/client/runtime/library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __masterDataGovernanceTestHooks,
  MasterDataGovernanceKernel,
} from './canonical-master-data';

const {
  executeRawUnsafe,
  queryRaw,
  queryRawUnsafe,
  transaction,
  unresolvedFindMany,
  unresolvedUpdateMany,
  unresolvedUpsert,
} = vi.hoisted(() => {
  const queryRawUnsafe = vi.fn();
  const queryRaw = vi.fn();
  return {
    executeRawUnsafe: vi.fn(),
    queryRaw,
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
    $queryRaw: queryRaw,
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
    queryRaw.mockReset();
    executeRawUnsafe.mockReset();
    transaction.mockClear();
    unresolvedFindMany.mockReset();
    unresolvedUpdateMany.mockReset();
    unresolvedUpsert.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['Prisma Decimal', new Decimal(7), 7],
    ['number', 6, 6],
    ['bigint', 5n, 5],
    ['numeric string', '4', 4],
    ['null', null, 0],
  ])('normalizes %s database count values', (_label, value, expected) => {
    expect(__masterDataGovernanceTestHooks.toAffectedRows(value)).toBe(
      expected,
    );
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

  it('requires project identities to be enabled', () => {
    expect(
      MasterDataGovernanceKernel.getField('projectName').canonical?.activeWhere,
    ).toBe('isDeleted = 0 AND status = 1');
  });

  it('lists canonical options through the structured query API', async () => {
    queryRaw.mockResolvedValue([{ id: 'project-1', name: 'Project A' }]);

    await expect(
      MasterDataGovernanceKernel.listCanonicalOptions({
        configKey: 'projectName',
        keyword: 'Project',
      }),
    ).resolves.toEqual([{ id: 'project-1', name: 'Project A' }]);

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRawUnsafe).not.toHaveBeenCalled();
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

  it('treats a historical name snapshot mismatch as an observation', async () => {
    vi.spyOn(MasterDataGovernanceKernel, 'auditOrphans').mockResolvedValue([]);
    vi.spyOn(
      MasterDataGovernanceKernel,
      'auditMissingCanonicalIds',
    ).mockResolvedValue([]);
    vi.spyOn(
      MasterDataGovernanceKernel,
      'auditInvalidCanonicalIds',
    ).mockResolvedValue([
      {
        invalidCanonicalId: 0,
        mismatchedCanonicalName: 2,
        table: 'work_orders',
      },
    ]);

    await expect(
      MasterDataGovernanceKernel.auditGovernance({ configKeys: ['division'] }),
    ).resolves.toMatchObject({
      invalid: [],
      summary: {
        invalidCanonicalId: 0,
        mismatchedCanonicalName: 2,
        status: 'pass',
      },
    });
  });

  it('returns null for duplicate canonical names regardless of row order', async () => {
    queryRawUnsafe.mockResolvedValue([
      { id: 'department-2', name: 'Production' },
      { id: 'department-1', name: 'Production' },
      { id: 'department-3', name: 'Quality' },
    ]);

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
        configKey: 'division',
        names: ['Production', 'Quality'],
      }),
    ).resolves.toEqual(
      new Map([
        ['Production', null],
        ['Quality', 'department-3'],
      ]),
    );
    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain('ORDER BY `name` ASC');
  });

  it('keeps an existing resolution when an unresolved reference is scanned again', async () => {
    __masterDataGovernanceTestHooks.resetCaches();
    queryRawUnsafe
      .mockResolvedValueOnce([{ columnName: 'id' }])
      .mockResolvedValueOnce([
        { columnName: 'id' },
        { columnName: 'isDeleted' },
      ])
      .mockResolvedValueOnce([
        { rowKey: 'requirement-1', value: 'Unknown process' },
      ]);
    unresolvedUpsert.mockResolvedValue({ id: 'audit-1' });

    await __masterDataGovernanceTestHooks.backfillTargetCanonicalIds(
      {
        idColumn: 'processId',
        nameColumn: 'processName',
        nullable: true,
        table: 'work_order_requirements',
      },
      new Map(),
      { batchSize: 100, configKey: 'processName' },
    );

    expect(unresolvedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({
          resolutionNote: expect.anything(),
          resolvedAt: expect.anything(),
          resolvedId: expect.anything(),
          status: expect.anything(),
        }),
      }),
    );
  });

  it('resolves an unresolved canonical ID through an ID-like name snapshot', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'dept-1769576623191', name: '生产 OBU' }]);
    const canonicalIdById = new Map<string, string>();

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: ['a3a98d7b568511f1881c00163e37355f'],
        configKey: 'responsibleDepartment',
        canonicalIdById,
        idLikeNameById: [
          {
            id: 'a3a98d7b568511f1881c00163e37355f',
            rawName: 'dept-1769576623191',
          },
        ],
      }),
    ).resolves.toEqual(
      new Map([['a3a98d7b568511f1881c00163e37355f', '生产 OBU']]),
    );
    expect(canonicalIdById).toEqual(
      new Map([['a3a98d7b568511f1881c00163e37355f', 'dept-1769576623191']]),
    );
    expect(queryRawUnsafe).toHaveBeenLastCalledWith(
      expect.stringContaining('FROM `departments`'),
      'dept-1769576623191',
    );
  });

  it('keeps an unresolved ID when the name snapshot is not a canonical ID', async () => {
    queryRawUnsafe.mockResolvedValue([]);

    await expect(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
        canonicalIds: ['a3a98e23568511f1881c00163e37355f'],
        configKey: 'responsibleDepartment',
        idLikeNameById: [
          {
            id: 'a3a98e23568511f1881c00163e37355f',
            rawName: '秦皇岛弘旺设备安装工程有限公司',
          },
        ],
      }),
    ).resolves.toEqual(new Map([['a3a98e23568511f1881c00163e37355f', null]]));
  });

  it('merges resolved rows sharing a canonical name into one aggregate row', () => {
    const result =
      MasterDataGovernanceKernel.mergeResolvedIdentityAggregateItems(
        [
          {
            id: 'a3a98d7b568511f1881c00163e37355f',
            name: '生产 OBU',
            resolutionStatus: 'RESOLVED' as const,
            value: 47,
          },
          {
            id: 'dept-r9u69gg8y64qutugxzsd8u6r',
            name: '生产 OBU',
            resolutionStatus: 'RESOLVED' as const,
            value: 42,
          },
          {
            id: 'dept-1769576623191',
            name: '生产 OBU',
            resolutionStatus: 'RESOLVED' as const,
            value: 9,
          },
          {
            id: 'a3a98e23568511f1881c00163e37355f',
            name: '主数据已失效：秦皇岛弘旺设备安装工程有限公司',
            rawName: '秦皇岛弘旺设备安装工程有限公司',
            resolutionReason: 'INVALID_REFERENCE' as const,
            resolutionStatus: 'INVALID' as const,
            value: 1,
          },
        ],
        {
          canonicalIdById: new Map([
            ['a3a98d7b568511f1881c00163e37355f', 'dept-1769576623191'],
          ]),
        },
      );

    expect(result).toEqual([
      {
        id: 'a3a98e23568511f1881c00163e37355f',
        name: '主数据已失效：秦皇岛弘旺设备安装工程有限公司',
        rawName: '秦皇岛弘旺设备安装工程有限公司',
        resolutionReason: 'INVALID_REFERENCE',
        resolutionStatus: 'INVALID',
        value: 1,
      },
      {
        id: 'dept-1769576623191',
        name: '生产 OBU',
        resolutionStatus: 'RESOLVED',
        value: 98,
      },
    ]);
  });

  it('keeps unresolved rows and empty names untouched', () => {
    const result =
      MasterDataGovernanceKernel.mergeResolvedIdentityAggregateItems([
        {
          id: 'dept-a',
          name: '数据待治理：生产 OBU',
          resolutionReason: 'MISSING_REQUIRED' as const,
          resolutionStatus: 'MISSING' as const,
          value: 1,
        },
        {
          id: null,
          name: '',
          resolutionStatus: 'RESOLVED' as const,
          value: 2,
        },
      ]);

    expect(result).toEqual([
      {
        id: 'dept-a',
        name: '数据待治理：生产 OBU',
        resolutionReason: 'MISSING_REQUIRED',
        resolutionStatus: 'MISSING',
        value: 1,
      },
      {
        id: null,
        name: '',
        resolutionStatus: 'RESOLVED',
        value: 2,
      },
    ]);
  });
});
