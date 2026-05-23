import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  buildProcessNameWhere,
  resolveCanonicalProcessNameById,
  resolveProcessIdForWrite,
  resolveProcessIdsByNames,
} from './process-resolver';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRawUnsafe: vi.fn(),
    processes: {
      findMany: vi.fn(),
    },
  },
}));

describe('process-resolver helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$queryRawUnsafe as any).mockResolvedValue([]);
  });

  it('resolveProcessIdForWrite returns explicit process id first', async () => {
    const processId = await resolveProcessIdForWrite({
      explicitProcessId: 'p-explicit',
      processName: '焊接',
    });

    expect(processId).toBe('p-explicit');
    expect((prisma.processes.findMany as any).mock.calls.length).toBe(0);
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
    (prisma.$queryRawUnsafe as any).mockResolvedValue([
      { id: 'p-weld', name: '焊接' },
      { id: 'p-paint', name: '喷涂' },
    ]);

    const result = await resolveProcessIdsByNames([
      '焊接',
      '焊接',
      '喷涂',
      null,
      undefined,
      '',
    ]);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(result.get('焊接')).toBe('p-weld');
    expect(result.get('喷涂')).toBe('p-paint');
  });

  it('buildProcessNameWhere returns OR condition when process id resolved', async () => {
    (prisma.$queryRawUnsafe as any).mockResolvedValue([{ id: 'p-weld' }]);

    const where = await buildProcessNameWhere('焊接');

    expect(where).toEqual({
      OR: [{ processName: '焊接' }, { processId: 'p-weld' }],
    });
  });

  it('buildProcessNameWhere returns field-only condition when process id missing', async () => {
    (prisma.$queryRawUnsafe as any).mockResolvedValue([]);

    const where = await buildProcessNameWhere('未知工序', {
      field: 'inspectionProcessName',
    });

    expect(where).toEqual({
      inspectionProcessName: '未知工序',
    });
  });

  it('buildProcessNameWhere falls back to plain name condition when governance lookup fails', async () => {
    (prisma.$queryRawUnsafe as any).mockRejectedValueOnce(
      new Error('db unavailable'),
    );

    const where = await buildProcessNameWhere('焊接');

    expect(where).toEqual({
      processName: '焊接',
    });
  });

  it('resolveProcessIdForWrite falls back to legacy behavior when governance lookup fails', async () => {
    (prisma.$queryRawUnsafe as any).mockRejectedValueOnce(
      new Error('db unavailable'),
    );

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
    (prisma.$queryRawUnsafe as any).mockRejectedValueOnce(
      new Error('db unavailable'),
    );

    const processName = await resolveCanonicalProcessNameById(
      tx as any,
      'process-id-1',
      '回退工序',
    );

    expect(processName).toBe('回退工序');
  });
});
