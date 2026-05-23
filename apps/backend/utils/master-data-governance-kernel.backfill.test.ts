import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __masterDataGovernanceTestHooks } from './master-data-governance-kernel';
import prisma from './prisma';

vi.mock('./prisma', () => ({
  default: {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

describe('master-data-governance-kernel backfill progress', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('continues scanning when one batch has only unresolved names and updates later rows', async () => {
    const queryMock = vi.mocked(prisma.$queryRawUnsafe);
    const executeMock = vi.mocked(prisma.$executeRawUnsafe);

    queryMock
      .mockResolvedValueOnce([
        { id: 'a1', value: 'unknown' },
        { id: 'a2', value: 'unknown' },
      ] as any)
      .mockResolvedValueOnce([{ id: 'b1', value: 'known' }] as any)
      .mockResolvedValueOnce([] as any);
    executeMock.mockResolvedValueOnce(1 as any);

    const result =
      await __masterDataGovernanceTestHooks.backfillTargetCanonicalIds(
        {
          table: 'quality_records',
          nameColumn: 'processName',
          idColumn: 'processId',
          nullable: true,
        },
        new Map([['known', 'p-known']]),
        {
          batchSize: 2,
        },
      );

    expect(result.updatedRows).toBe(1);
    expect(result.unresolvedRows).toBe(2);
    expect(result.scannedRows).toBe(3);
    expect(result.batches).toBe(2);
    expect(result.exhausted).toBe(true);
    expect(result.nextStartAfterId).toBeNull();
  });

  it('stops on maxBatchesPerTable and returns next cursor for resume', async () => {
    const queryMock = vi.mocked(prisma.$queryRawUnsafe);
    const executeMock = vi.mocked(prisma.$executeRawUnsafe);

    queryMock.mockResolvedValueOnce([
      { id: '100', value: 'n1' },
      { id: '101', value: 'n2' },
    ] as any);
    executeMock.mockResolvedValueOnce(2 as any);

    const result =
      await __masterDataGovernanceTestHooks.backfillTargetCanonicalIds(
        {
          table: 'quality_records',
          nameColumn: 'processName',
          idColumn: 'processId',
          nullable: true,
        },
        new Map([
          ['n1', 'p1'],
          ['n2', 'p2'],
        ]),
        {
          batchSize: 2,
          maxBatches: 1,
        },
      );

    expect(result.updatedRows).toBe(2);
    expect(result.unresolvedRows).toBe(0);
    expect(result.batches).toBe(1);
    expect(result.exhausted).toBe(false);
    expect(result.nextStartAfterId).toBe('101');
  });

  it('stops on maxRows and returns next cursor for resume', async () => {
    const queryMock = vi.mocked(prisma.$queryRawUnsafe);
    const executeMock = vi.mocked(prisma.$executeRawUnsafe);

    queryMock.mockResolvedValueOnce([
      { id: '201', value: 'n1' },
      { id: '202', value: 'n2' },
    ] as any);
    executeMock.mockResolvedValueOnce(2 as any);

    const result =
      await __masterDataGovernanceTestHooks.backfillTargetCanonicalIds(
        {
          table: 'quality_records',
          nameColumn: 'processName',
          idColumn: 'processId',
          nullable: true,
        },
        new Map([
          ['n1', 'p1'],
          ['n2', 'p2'],
        ]),
        {
          batchSize: 2,
          maxRows: 2,
        },
      );

    expect(result.updatedRows).toBe(2);
    expect(result.scannedRows).toBe(2);
    expect(result.exhausted).toBe(false);
    expect(result.nextStartAfterId).toBe('202');
  });

  it('buildActiveRowWhereSql falls back to 1 = 1 when table has no isDeleted column', async () => {
    const queryMock = vi.mocked(prisma.$queryRawUnsafe);
    queryMock.mockResolvedValueOnce([{ columnName: 'id' }] as any);
    const whereSql =
      await __masterDataGovernanceTestHooks.buildActiveRowWhereSql(
        'project_boms',
      );
    expect(whereSql).toBe('1 = 1');
  });

  it('buildActiveRowWhereSql uses isDeleted filter when column exists', async () => {
    const queryMock = vi.mocked(prisma.$queryRawUnsafe);
    queryMock.mockResolvedValueOnce([{ columnName: 'isDeleted' }] as any);
    const whereSql =
      await __masterDataGovernanceTestHooks.buildActiveRowWhereSql(
        'quality_records',
      );
    expect(whereSql).toBe('`isDeleted` = 0');
  });
});
