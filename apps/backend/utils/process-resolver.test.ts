import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

import {
  __resetProcessResolverRuntimeForTest,
  buildProcessNameWhere,
  resolveCanonicalProcessName,
  resolveCanonicalProcessNameById,
  resolveIncomingTypeName,
  resolveIncomingTypeNamesByIds,
  resolveProcessIdForWrite,
  resolveProcessIdsByNames,
} from './process-resolver';

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    buildNameWhere: vi.fn(),
    resolveCanonicalIdForWrite: vi.fn(),
    resolveCanonicalIdsByNames: vi.fn(),
    resolveCanonicalNameById: vi.fn(),
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    dictionaries: {
      findMany: vi.fn(),
    },
  },
}));

describe('process-resolver helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetProcessResolverRuntimeForTest();
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockImplementation(async (options) => {
      if (options.explicitCanonicalId !== undefined) {
        return options.explicitCanonicalId;
      }
      if (!String(options.name || '').trim()) {
        return options.keepExistingWhenNameMissing
          ? undefined
          : (options.fallbackCanonicalId ?? null);
      }
      return options.fallbackCanonicalId ?? null;
    });
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).mockResolvedValue(new Map());
    vi.mocked(MasterDataGovernanceKernel.buildNameWhere).mockImplementation(
      async (options) => ({
        [options.field || 'processName']: options.name,
      }),
    );
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockImplementation(async (options) => options.fallbackName || null);
  });

  it('resolveProcessIdForWrite returns explicit process id first', async () => {
    const processId = await resolveProcessIdForWrite({
      explicitProcessId: 'p-explicit',
      processName: '焊接',
    });

    expect(processId).toBe('p-explicit');
    expect(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).toHaveBeenCalledOnce();
  });

  it('resolveProcessIdForWrite returns undefined when keeping existing and name missing', async () => {
    const processId = await resolveProcessIdForWrite({
      keepExistingWhenNameMissing: true,
      processName: '',
    });

    expect(processId).toBeUndefined();
  });

  it('resolveProcessIdForWrite returns fallback process id when name missing', async () => {
    const processId = await resolveProcessIdForWrite({
      fallbackProcessId: 'p-fallback',
      processName: '',
    });

    expect(processId).toBe('p-fallback');
  });

  it('resolveProcessIdsByNames batches lookup and de-duplicates names', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).mockResolvedValue(
      new Map([
        ['喷涂', 'p-paint'],
        ['焊接', 'p-weld'],
      ]),
    );

    const result = await resolveProcessIdsByNames([
      '焊接',
      '焊接',
      '喷涂',
      null,
      undefined,
      '',
    ]);

    expect(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).toHaveBeenCalledWith({
      configKey: 'processName',
      names: ['焊接', '喷涂'],
    });
    expect(result.get('焊接')).toBe('p-weld');
    expect(result.get('喷涂')).toBe('p-paint');
  });

  it('buildProcessNameWhere returns OR condition when process id resolved', async () => {
    vi.mocked(MasterDataGovernanceKernel.buildNameWhere).mockResolvedValue({
      OR: [{ processName: '焊接' }, { processId: 'p-weld' }],
    });

    const where = await buildProcessNameWhere('焊接');

    expect(where).toEqual({
      OR: [{ processName: '焊接' }, { processId: 'p-weld' }],
    });
  });

  it('buildProcessNameWhere returns field-only condition when process id missing', async () => {
    const where = await buildProcessNameWhere('未知工序', {
      field: 'inspectionProcessName',
    });

    expect(where).toEqual({
      inspectionProcessName: '未知工序',
    });
  });

  it('buildProcessNameWhere falls back to plain name condition when governance lookup fails', async () => {
    vi.mocked(MasterDataGovernanceKernel.buildNameWhere).mockRejectedValueOnce(
      new Error('db unavailable'),
    );

    const where = await buildProcessNameWhere('焊接');

    expect(where).toEqual({
      processName: '焊接',
    });
  });

  it('resolveProcessIdForWrite falls back to legacy behavior when governance lookup fails', async () => {
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdForWrite,
    ).mockRejectedValueOnce(new Error('db unavailable'));

    const processId = await resolveProcessIdForWrite({
      processName: '焊接',
      fallbackProcessId: 'fallback-process-id',
    });

    expect(processId).toBe('fallback-process-id');
  });

  it('resolveCanonicalProcessNameById falls back to input processName when governance lookup fails', async () => {
    const tx = {
      processes: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockRejectedValueOnce(new Error('db unavailable'));

    const processName = await resolveCanonicalProcessNameById(
      tx as any,
      'process-id-1',
      '回退工序',
    );

    expect(processName).toBe('回退工序');
  });

  it('resolveCanonicalProcessName prefers the current process relation name over the snapshot', () => {
    expect(
      resolveCanonicalProcessName({
        process: { name: '涂装-测试' },
        processName: '涂装',
      }),
    ).toBe('涂装-测试');
  });

  it('resolveCanonicalProcessName falls back to the snapshot when the relation name is empty', () => {
    expect(
      resolveCanonicalProcessName({
        process: { name: null },
        processName: '涂装',
      }),
    ).toBe('涂装');
  });

  it('resolves incoming-type names by dictionary id', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '机加成品件-外协', id: 'dict-1' },
    ] as never);

    const resolved = await resolveIncomingTypeNamesByIds(['dict-1', '']);

    expect(resolved.get('dict-1')).toBe('机加成品件-外协');
    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith({
      where: {
        dictType: 'incoming_type',
        id: { in: ['dict-1'] },
        isDeleted: false,
        status: 1,
      },
      select: { dictKey: true, id: true },
    });
  });

  it('resolveIncomingTypeName falls back to the snapshot when the dictionary id is unknown', async () => {
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([] as never);

    await expect(
      resolveIncomingTypeName({
        incomingType: '机加成品件',
        incomingTypeId: 'unknown-id',
      }),
    ).resolves.toBe('机加成品件');
  });

  it('resolveIncomingTypeName returns the snapshot when no dictionary id exists', async () => {
    await expect(
      resolveIncomingTypeName({ incomingType: '机加成品件' }),
    ).resolves.toBe('机加成品件');
  });
});
